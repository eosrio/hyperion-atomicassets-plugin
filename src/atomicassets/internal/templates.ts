import {jsonbText} from './jsonb-text.js';
import {formatSchema, type AtomicSchema} from '../asset.js';
import {databaseMetadata} from './database-json.js';
import {createHash} from 'node:crypto';
import {decimal,domainKey,format,hash,read,record,records,required,strings,text,unavailable,
  type DomainReader,type DomainStage,type LifecycleBlock,type LifecycleEvent,type MetadataCodec} from './lifecycle-port.js';

const boolean = (value: unknown) => typeof value === 'boolean' ? value : unavailable('Invalid template flag');
const quantity = (value: unknown) => decimal(typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value);
export function templateId(value: unknown): string {
  return quantity(value);
}

async function decode(b: LifecycleBlock,event: Extract<LifecycleEvent,{kind:'row'}>,stage: DomainReader,codec: MetadataCodec,field: string) {
  const name=text(event.value.schema_name),schema=await required(stage,'schema',domainKey(b.contract,event.scope,name));
  if (schema.contract!==b.contract || schema.collection_name!==event.scope || schema.schema_name!==name)
    unavailable('Mismatched template schema');
  const fields=format(schema.format),digest=createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  if (hash(schema.schema_digest)!==digest || (event.evidence.schemaDigest!==undefined && hash(event.evidence.schemaDigest)!==digest))
    unavailable('Template schema format evidence differs');
  const raw=event.value[field],hex=typeof raw==='string' ? raw : unavailable('Invalid serialized template metadata');
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) unavailable('Invalid serialized template metadata');
  try {return databaseMetadata(codec.collection(hex,fields));}
  catch {return unavailable('Template codec refused the supported input');}
}

/** Original templates/templates2 priority-40 effects in the caller's atomic staging view. */
export async function reduceTemplateRow(b: LifecycleBlock,event: Extract<LifecycleEvent,{kind:'row'}>,stage: DomainStage,codec: MetadataCodec): Promise<void> {
  const v=event.value,id=templateId(v.template_id),key=domainKey(b.contract,id),old=await read(stage,'template',key);
  if (old && (old.contract!==b.contract || old.template_id!==id)) unavailable('Mismatched template identity');
  if (event.table==='templates2') {
    // A clear is UPDATE ... mutable_data=NULL, including a zero-row unknown update.
    const data=event.present ? await decode(b,event,stage,codec,'mutable_serialized_data') : null;
    if (old) stage.put('template',key,{...old,mutable_data:data});
  } else if (event.table==='templates') {
    if (!old && !event.present) return; // Never manufacture an unknown deleted template.
    const changes={transferable:boolean(v.transferable),burnable:boolean(v.burnable),max_supply:quantity(v.max_supply),
      issued_supply:quantity(v.issued_supply),deleted_at_block:event.present?null:b.blockNum,
      deleted_at_time:event.present?null:b.blockTimeMs};
    if (old) stage.put('template',key,{...old,...changes});
    else stage.put('template',key,{contract:b.contract,template_id:id,collection_name:event.scope,schema_name:text(v.schema_name),
      ...changes,immutable_data:await decode(b,event,stage,codec,'immutable_serialized_data'),mutable_data:null,
      created_at_block:b.blockNum,created_at_time:b.blockTimeMs});
  } else unavailable('Unsupported template occurrence');
}

/** Same coherent reader as its asset; no cached mint-time template response. */
export async function readTemplateForAsset(reader: DomainReader,contract: string,id: string) {
  const row=await required(reader,'template',domainKey(contract,templateId(id)));
  if (row.contract!==contract || row.template_id!==id) unavailable('Mismatched template relationship');
  return {template_id:id,max_supply:decimal(row.max_supply),issued_supply:decimal(row.issued_supply),
    is_transferable:boolean(row.transferable),is_burnable:boolean(row.burnable),
    immutable_data:row.immutable_data===null?null:record(row.immutable_data),
    mutable_data:row.mutable_data===null?null:record(row.mutable_data),
    created_at_block:decimal(row.created_at_block),created_at_time:decimal(row.created_at_time),
    deleted_at_block:row.deleted_at_block===null?null:decimal(row.deleted_at_block),
    deleted_at_time:row.deleted_at_time===null?null:decimal(row.deleted_at_time)};
}

/** Pinned templates_master INNER JOIN, composed through one request-owned reader. */
export async function readTemplateId(reader: DomainReader, contract: string, collectionName: string, id: string) {
  const row=await read(reader,'template',domainKey(contract,id));
  if (!row) return null;
  if(row.contract!==contract || row.template_id!==id) return unavailable('Mismatched template identity');
  const collection=await read(reader,'collection',domainKey(contract,text(row.collection_name)));
  const schema=await read(reader,'schema',domainKey(contract,text(row.collection_name),text(row.schema_name)));
  if (!collection || !schema) return null;
  if(collection.contract!==contract || collection.collection_name!==row.collection_name || schema.contract!==contract ||
    schema.collection_name!==row.collection_name || schema.schema_name!==row.schema_name) return unavailable('Mismatched template join');
  if(row.collection_name!==collectionName) return null;
  const nested=await readTemplateForAsset(reader,contract,id), metadata=record(collection.data);
  if(typeof collection.allow_notify!=='boolean' || typeof collection.market_fee!=='number' || !Number.isFinite(collection.market_fee))
    return unavailable('Invalid collection fields');
  const mutable=nested.mutable_data??{}, immutable=nested.immutable_data??{}, data={...mutable,...immutable};
  return record({contract,...nested,collection:{collection_name:collection.collection_name,name:jsonbText(metadata.name ?? null),img:jsonbText(metadata.img ?? null),
    images:jsonbText(metadata.images ?? null),author:text(collection.author),allow_notify:collection.allow_notify,
    authorized_accounts:strings(collection.authorized_accounts),notify_accounts:strings(collection.notify_accounts),market_fee:collection.market_fee,
    created_at_block:decimal(collection.created_at_block),created_at_time:decimal(collection.created_at_time)},
    schema:JSON.parse(JSON.stringify(formatSchema({schema_name:text(schema.schema_name),format:format(schema.format),types:records(schema.types).map(v=>({...v,name:text(v.name)})),
      created_at_block:decimal(schema.created_at_block),created_at_time:decimal(schema.created_at_time)} as AtomicSchema))),
    mutable_data:mutable,immutable_data:immutable,data,...(data.name===undefined?{}:{name:data.name})});
}
