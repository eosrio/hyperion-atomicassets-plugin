import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedResultV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {formatSchema,type AtomicObject,type AtomicSchema,type AtomicSchemaField,type AtomicSchemaType} from '../asset.js';
import {domainKey,metadataInputRecord,strings} from './lifecycle-port.js';
import {jsonbText} from './jsonb-text.js';
export class SchemaListDatabaseError extends Error {constructor() {super('Internal Server Error');}}

const unavailable=():never=>{throw new StatefulContractError('stateful.unavailable','Invalid indexed schema view');};
function text(value:unknown):string {if(typeof value!=='string')return unavailable();return value;}
function integer(value:unknown):string {
  const result=text(value);if(!/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(result))return unavailable();
  const n=BigInt(result);if(n< -9223372036854775808n||n>9223372036854775807n)return unavailable();return result;
}
function row(value:unknown):AtomicObject {try{return metadataInputRecord(value);}catch{return unavailable();}}

/** Joins are supplied by the negotiated adapter in the same owner snapshot, never enumerated here. */
export function schemaListRows(result:Extract<IndexedResultV1,{kind:'page'}>,contract:string):readonly AtomicObject[] {
  return result.rows.map(entry=>{
    const schema=row(entry.records.schema),collection=row(entry.records.collection),name=text(schema.schema_name),collectionName=text(schema.collection_name);
    if(schema.contract!==contract||collection.contract!==contract||collection.collection_name!==collectionName
      ||entry.key!==domainKey(contract,collectionName,name))return unavailable();
    const aggregate=entry.records.assets===null?null:row(entry.records.assets);
    if(aggregate&&(aggregate.contract!==contract||aggregate.collection_name!==collectionName||aggregate.schema_name!==name))return unavailable();
    const total=aggregate?BigInt(integer(aggregate.assets)):0n;
    if(total< -2147483648n||total>2147483647n)throw new SchemaListDatabaseError();
    if(typeof collection.allow_notify!=='boolean'||typeof collection.market_fee!=='number'||!Number.isFinite(collection.market_fee))return unavailable();
    const metadata=row(collection.data);
    const rawFormat=schema.format||[],rawTypes=schema.types||[];
    if(!Array.isArray(rawFormat)||!Array.isArray(rawTypes))return unavailable();
    // These are ordinary JSONB fields, not metadata-encoder boundaries. Literal backslashes remain literal.
    jsonbText(rawFormat);jsonbText(rawTypes);
    const fields=rawFormat.map(value=>{const field=row(value);text(field.name);text(field.type);return field as AtomicSchemaField;});
    const types=rawTypes.map(value=>{const field=row(value);text(field.name);return field as AtomicSchemaType;});
    const nested={collection_name:collectionName,name:jsonbText(metadata.name??null),img:jsonbText(metadata.img??null),images:jsonbText(metadata.images??null),
      author:text(collection.author),allow_notify:collection.allow_notify,authorized_accounts:strings(collection.authorized_accounts),
      notify_accounts:strings(collection.notify_accounts),market_fee:collection.market_fee,
      created_at_block:integer(collection.created_at_block),created_at_time:integer(collection.created_at_time)};
    const formatted=formatSchema({contract,schema_name:name,collection:nested,format:fields,types,
      created_at_block:integer(schema.created_at_block),created_at_time:integer(schema.created_at_time),assets:Number(total)} as AtomicSchema);
    return row({...formatted,types});
  });
}
