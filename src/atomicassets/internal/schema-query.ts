import type {StatefulCompleteKindReadV1} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import type {OperatorListResultV1} from '@eosrio/hyperion-sdk/operator-lists';
import {formatSchema, type AtomicSchema} from '../asset.js';
import {decimal, domainKey, format, read, record, records, strings, text, unavailable} from './lifecycle-port.js';

export interface OperatorListHost {resolve(names: readonly string[]): Promise<OperatorListResultV1>}
export class SchemaParameterError extends Error {constructor(readonly parameter: string) {super('Invalid value for parameter '+parameter);}}
export class SchemaListsUnavailable extends Error {readonly statusCode=503; readonly code='operator-list.unavailable'; readonly retryable=true; readonly headers={'retry-after':'1','cache-control':'no-store'};
  constructor(message: string, options?: ErrorOptions) {super(message, options);}
}
const nameRE=/^[.1-5a-z]{1,12}[.1-5a-j]?$/;
/** The reference expands each token once, then validates the resulting field. */
export async function schemaFilters(collection: string, schema: string, host?: OperatorListHost) {
  const fields=[collection,schema].map(value=>value === '' ? [] : value.split(','));
  // Reference validates collection before beginning schema expansion. If collection has
  // a list, defer all its validation until that same field has been expanded.
  if(!fields[0]!.some(value=>value.startsWith('$list:')) && fields[0]!.some(value=>!nameRE.test(value)))
    throw new SchemaParameterError('collection_name');
  const names=[...new Set(fields.flat().filter(x=>x.startsWith('$list:')).map(x=>x.slice(6)))];
  if(names.length && !host) throw new SchemaListsUnavailable('Operator lists unavailable');
  const result=names.length ? await host!.resolve(names) : undefined;
  if(result && (result.entries.length!==names.length || result.entries.some((entry,i)=>entry.name!==names[i]))) throw new SchemaListsUnavailable('Incomplete operator lists');
  const lists=new Map(result?.entries.map(entry=>[entry.name,entry.items]));
  for(let i=0;i<fields.length;i++) {
    const expanded=fields[i]!.flatMap(value=>value.startsWith('$list:') ? lists.get(value.slice(6)) ?? [] : [value]);
    if(expanded.some(value=>!nameRE.test(value))) throw new SchemaParameterError(i===0?'collection_name':'schema_name');
    fields[i]=expanded;
  }
  return {collections:fields[0]!, schemas:fields[1]!};
}
/** Pinned schema-ID list delegation: complete kind first, then coherent joins and default ordering. */
export async function readSchemaId(reader: StatefulCompleteKindReadV1, contract: string, filters: {collections: readonly string[]; schemas: readonly string[]}) {
  const candidates=[];
  for(const {key,value} of await reader.all('schema')) {
    const row=record(value), collection=text(row.collection_name), name=text(row.schema_name);
    if(row.contract!==contract || key!==domainKey(contract,collection,name)) return unavailable('Mismatched schema identity');
    if(filters.collections.length && !filters.collections.includes(collection) || filters.schemas.length && !filters.schemas.includes(name)) continue;
    const joined=await read(reader,'collection',domainKey(contract,collection));
    if(!joined) continue;
    if(joined.contract!==contract || joined.collection_name!==collection) return unavailable('Mismatched schema collection');
    candidates.push({row,joined,collection,name,time:BigInt(decimal(row.created_at_time))});
  }
  candidates.sort((a,b)=>a.time===b.time ? (a.name<b.name?-1:a.name>b.name?1:0) : a.time>b.time?-1:1);
  const first=candidates[0]; if(!first) return null;
  const {row,joined,collection,name}=first;
  const count=await read(reader,'schema-asset-count',domainKey(contract,collection,name));
  if(count && (count.contract!==contract || count.collection_name!==collection || count.schema_name!==name)) return unavailable('Mismatched schema count');
  const assets=count ? BigInt(decimal(count.assets)) : 0n;
  if(assets>2147483647n) return unavailable('Schema count exceeds original integer range');
  if(typeof joined.allow_notify!=='boolean' || typeof joined.market_fee!=='number' || !Number.isFinite(joined.market_fee)) return unavailable('Invalid collection fields');
  const metadata=record(joined.data), selected=(v:unknown)=>v==null?null:typeof v==='string'?v:unavailable('Unsupported collection metadata');
  const types=records(row.types).map(v=>({...v,name:text(v.name)}));
  const collectionValue={collection_name:collection,name:selected(metadata.name),img:selected(metadata.img),images:selected(metadata.images),
    author:text(joined.author),allow_notify:joined.allow_notify,authorized_accounts:strings(joined.authorized_accounts),notify_accounts:strings(joined.notify_accounts),
    market_fee:joined.market_fee,created_at_block:decimal(joined.created_at_block),created_at_time:decimal(joined.created_at_time)};
  const formatted=formatSchema({contract,schema_name:name,collection:collectionValue,format:format(row.format),types,
    created_at_block:decimal(row.created_at_block),created_at_time:decimal(row.created_at_time),assets:Number(assets)} as AtomicSchema);
  return record({...formatted,types});
}
