import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
import {ownerFixture} from './fixtures/owned-schema-owner.mjs';
import {input,initial,mint,transfer,action,row,key} from './fixtures/asset-domain-cases.mjs';

const dir=new URL('./fixtures/owned-schema-original-2.7/',import.meta.url);
function pinned(name,hash){const bytes=readFileSync(new URL(name,dir));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);return bytes.toString('utf8');}
const source=pinned('collections.ts','943826d8a9bf0d4adfc93480020b6691708214bb223813f89487f874d7bce56e');
const migration=pinned('migration.sql','e08678302db4f48c6327eea6815826738a081d73c71751445f628ed46b6c731e');
assert.match(migration,/COUNT\(\*\) FILTER \(WHERE owner IS NOT NULL\) AS owned/);
assert.match(migration,/CASE WHEN OLD\.owner IS NOT NULL THEN -1 END/);
assert.match(migration,/CASE WHEN NEW\.owner IS NOT NULL THEN 1 END/);
const start=source.indexOf('export async function getCollectionSchemasAction'),end=source.indexOf('export async function getCollectionLogsAction',start);
assert.ok(start>=0&&end>start);
const code=stripTypeScriptTypes(source.slice(start,end).replace('export async','async'),{mode:'strip'});
const original=new Script(code+'; getCollectionSchemasAction').runInContext(createContext({}));
const membership=rows=>rows.filter(row=>BigInt(row.owned)>0n).map(row=>row.schema_name).sort();
async function compare(f){
 // Actual original handler with the migration's owned-row semantics modeled in a finite collaborator.
 const rows=f.all('asset'),db={async query(sql,args){assert.match(sql,/HAVING SUM\(owned\) > 0/);assert.deepEqual(Array.from(args),[input.contract,input.collection]);
  return {rows:[...new Set(rows.filter(a=>a.contract===args[0]&&a.collection_name===args[1]&&a.owner!==null).map(a=>a.schema_name))].map(schema_name=>({schema_name}))};}};
 const result=await original({}, {db,coreArgs:{atomicassets_account:input.contract},pathParams:{collection_name:input.collection}});
 assert.deepEqual(membership(f.all('owned-schema-count')),Array.from(result,r=>r.schema_name).sort());
}
test('SDK owner reduction path: mint, redelivery, transfer, multiple assets, burn, rollback and delete',async()=>{
 const f=await ownerFixture(),schemaKey=key(input.contract,input.collection,input.schema);
 const first=await f.execute(initial());assert.equal(first.result.status,'applied');assert.equal(f.row('owned-schema-count',schemaKey).owned,'1');await compare(f);
 assert.equal((await f.redeliver(first.source,first.target)).status,'duplicate');assert.equal(f.row('owned-schema-count',schemaKey).owned,'1');
 await f.execute([transfer('alice','bob')]);assert.equal(f.row('owned-schema-count',schemaKey).owned,'1');await compare(f);
 const second='1234567890124';await f.execute([mint(second)]);assert.equal(f.row('owned-schema-count',schemaKey).owned,'2');await compare(f);
 await f.execute([action('logburnasset',{asset_id:input.assetId,asset_owner:'bob'})]);assert.equal(f.row('owned-schema-count',schemaKey).owned,'1');await compare(f);
 f.rollback();assert.equal(f.row('owned-schema-count',schemaKey).owned,'2');await compare(f);
 await f.execute([action('logburnasset',{asset_id:input.assetId,asset_owner:'bob'})]);await f.execute([],second);assert.equal(f.row('owned-schema-count',schemaKey).owned,'0');await compare(f);
});
test('multiple schema membership and replayed upsert match original handler membership',async()=>{
 const f=await ownerFixture();await compare(f);await f.execute(initial());
 const second='1234567890124',other='second',schemaEvent=row('schemas',{schema_name:other,format:input.format}),mintEvent=mint(second);
 mintEvent.value.schema_name=other;await f.execute([schemaEvent,mintEvent]);await compare(f);
 assert.deepEqual(membership(f.all('owned-schema-count')),[input.schema,other].sort());
 await f.execute([mintEvent]);await compare(f);assert.equal(f.row('owned-schema-count',key(input.contract,input.collection,other)).owned,'1');
 await f.execute([action('logburnasset',{asset_id:second,asset_owner:'alice'})]);await compare(f);
 assert.deepEqual(membership(f.all('owned-schema-count')),[input.schema]);
});
