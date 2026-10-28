import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const codecPath = new URL('../../fixtures/harness/atomicassets/lifecycle/original/codec/build/index.cjs', import.meta.url);
if (createHash('sha256').update(readFileSync(codecPath)).digest('hex') !== '2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573') throw Error('Unpinned codec');
const original = require(codecPath.pathname.replace(/^\/(\w:)/, '$1'));
export const codec = {sha256: '2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573',
  attributes: value => original.convertAttributeMapToObject(value),
  collection: (hex, format) => original.deserialize(hex, original.CachedObjectSchema(format))};
export const fixture = JSON.parse(readFileSync(new URL('../../fixtures/harness/atomicassets/domain/expected.json', import.meta.url)));
// The physical original driver can select this exact full input profile too.
export const input = require('../../harness/atomicassets/lifecycle-input.cjs').loadInputProfile('portable-safe-image').input;
export const key = (...parts) => JSON.stringify(parts);
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const schemaDigest = digest(input.format);
export const schema2Digest = digest([...input.format, {name:'new_field',type:'string'}]);
export const block = n => ({contract:input.contract, blockNum:String(input.block.block_num+n),
  blockTimeMs:String(Date.parse(input.block.timestamp+'Z')+n*1000), blockId:(n+1).toString(16).padStart(64,'0')});
let occurrence = 0;
export const evidence = (schema = schemaDigest) => ({occurrence:'constructed:'+ ++occurrence,abiDeployment:'constructed:abi:1',abiSha256:'a'.repeat(64),schemaDigest:schema});
export const action = (name,value,schema) => ({kind:'action',name,value,transactionId:'ab'.repeat(32),evidence:evidence(schema)});
export const row = (table,value,scope=input.collection,present=true,schema) => ({kind:'row',table,value,scope,present,evidence:evidence(schema)});
export const collectionRow = (data=input.collectionData) => row('collections',{collection_name:input.collection,author:'author',allow_notify:true,
  authorized_accounts:['author','editor'],notify_accounts:['watcher'],market_fee:.05,
  serialized_data:Buffer.from(original.serialize(data,original.CachedObjectSchema(input.collectionFormat))).toString('hex')});
export const mint = (id=input.assetId) => action('logmint',{asset_id:id,collection_name:input.collection,schema_name:input.schema,template_id:-1,
  new_asset_owner:'alice',authorized_minter:'author',immutable_data:input.immutableAttributes,mutable_data:input.mutableAttributes});
export const transfer = (from,to) => action('logtransfer',{from,to,asset_ids:[input.assetId],memo:'original PG transfer'});
export const initial = () => [action('logsetdata',{asset_id:input.assetId,new_data:input.updatedAttributes}),mint(),
  row('schemas',{schema_name:input.schema,format:input.format}),collectionRow(),row('config',{collection_format:input.collectionFormat})];
export const stages = () => [initial(),[transfer('mallory','wrong')],[transfer('alice','bob')],
  [row('schemas',{schema_name:input.schema,format:[...input.format,{name:'new_field',type:'string'}]},input.collection,true,schema2Digest),
   row('schematypes',{schema_name:input.schema,format_type:[{name:'image',mediatype:'video',info:'video/mp4'}]}),
   collectionRow({...input.collectionData,name:'current joined collection'})],
  [action('logburnasset',{asset_id:input.assetId,asset_owner:'bob'})],[],[]];

/** Local callback fixture only. No physical store, SDK staging/recovery or authority qualification. */
export function storage() {
  let state = new Map();
  const complete = new Set();
  const add = (kind,...parts) => complete.add(kind+':'+key(...parts));
  for (const kind of ['asset','mint','template-link','backed-tokens','original-mint']) add(kind,input.contract,input.assetId);
  add('config',input.contract);add('collection',input.contract,input.collection);add('schema',input.contract,input.collection,input.schema);
  const object = target => ({async get(kind,k) {
    const id=kind+':'+k;
    if (!complete.has(id)) return {status:'unavailable',reason:'fixture has no source coverage'};
    return target.has(id)?{status:'present',value:structuredClone(target.get(id))}:{status:'covered-absent'};
  },put(kind,k,value){target.set(kind+':'+k,structuredClone(value));},delete(kind,k){target.delete(kind+':'+k);}});
  return {complete,add,reader:()=>object(state),snapshot:()=>structuredClone(state),
    seed(kind,k,value){state.set(kind+':'+k,structuredClone(value));},
    async run(reduce,b,events,selectedCodec=codec) {const next=structuredClone(state);await reduce(b,events,object(next),selectedCodec);state=next;}};
}
