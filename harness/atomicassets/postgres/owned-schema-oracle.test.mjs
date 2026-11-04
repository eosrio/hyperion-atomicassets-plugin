// Controlled failure/progress tests, not evidence of PostgreSQL execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
import {ownedSchemaPostgresOracle} from './owned-schema-oracle.mjs';
const fixture=new URL('../../../tests/fixtures/owned-schema-original-2.7/',import.meta.url);
function source(name,hash){const data=readFileSync(new URL(name,fixture));assert.equal(createHash('sha256').update(data).digest('hex'),hash);return data.toString('utf8');}
const code=source('collections.ts','943826d8a9bf0d4adfc93480020b6691708214bb223813f89487f874d7bce56e');
const migration=source('migration.sql','e08678302db4f48c6327eea6815826738a081d73c71751445f628ed46b6c731e');
assert.match(migration,/CREATE TRIGGER update_atomicassets_asset_counts_tr/);
const start=code.indexOf('export async function getCollectionSchemasAction'),end=code.indexOf('export async function getCollectionLogsAction',start);assert.ok(start>=0&&end>start);
const original=new Script(stripTypeScriptTypes(code.slice(start,end).replace('export async','async'),{mode:'strip'})+'; getCollectionSchemasAction').runInContext(createContext({}));
function mock({badLast=false,failBurn=false}={}){
 let assets=new Map(),seen=new Set(),saved,released=false;
 const rows=()=>[...seen].sort().map(schema_name=>({schema_name,owned:String([...assets.values()].filter(x=>x.schema===schema_name&&x.owner!==null).length)}));
 const client={async query(sql,values=[]){
  if(sql.includes('pg_get_triggerdef'))return {rows:[{tgenabled:'O',trigger_definition:'AFTER INSERT OR DELETE OR UPDATE',function_definition:'update_atomicassets_asset_counts'}],rowCount:1};
  if(sql.startsWith('INSERT INTO atomicassets_assets ')){assets.set(values[1],{schema:values[3],owner:values[4]});seen.add(values[3]);return {rows:[],rowCount:1};}
  if(sql.startsWith('UPDATE atomicassets_assets SET owner=$1')){assets.get(values[2]).owner=values[0];return {rows:[],rowCount:1};}
  if(sql.startsWith('UPDATE atomicassets_assets SET owner=NULL')){if(failBurn&&values[1]==='1')throw Object.assign(new Error('modeled failure'),{code:'XX001'});if(!(badLast&&values[1]==='2'))assets.get(values[1]).owner=null;return {rows:[],rowCount:1};}
  if(sql.startsWith('DELETE FROM atomicassets_assets')){assets.delete(values[1]);return {rows:[],rowCount:1};}
  if(sql==='SAVEPOINT before_last'){saved={assets:structuredClone(assets),seen:structuredClone(seen)};return {rows:[],rowCount:null};}
  if(sql==='ROLLBACK TO SAVEPOINT before_last'){assets=saved.assets;seen=saved.seen;return {rows:[],rowCount:null};}
  if(sql.includes('HAVING SUM(owned) > 0'))return {rows:rows().filter(x=>x.owned!=='0').map(x=>({schema_name:x.schema_name})),rowCount:null};
  if(sql.startsWith('SELECT schema_name, COALESCE'))return {rows:rows(),rowCount:null};
  return {rows:[],rowCount:null};
 },release(){released=true;}};
 return {async begin(){return client;},get released(){return released;}};
}
test('pinned original handler drives all eight staged membership observations',async()=>{
 const db=mock(),snapshots=[],report=await ownedSchemaPostgresOracle(db,original,v=>snapshots.push(structuredClone(v)));
 assert.equal(report.status,'passed');assert.equal(report.rollbackSucceeded,true);assert.equal(db.released,true);
 assert.deepEqual(report.snapshots.map(x=>x.name),['empty','insert','transfer','burn-one','burn-last','after-rollback','delete-alpha','delete-beta']);
 assert.equal(report.events.filter(x=>x.label.endsWith(':handler')).length,8);
 assert.ok(report.events.filter(x=>x.label.endsWith(':handler')).every(x=>/HAVING SUM\(owned\) > 0/.test(x.sql)));
 assert.equal(snapshots.at(-1).status,'passed');
});
test('wrong last burn persists observed SQL and rows before failing and rolls back',async()=>{
 const db=mock({badLast:true}),snapshots=[];await assert.rejects(ownedSchemaPostgresOracle(db,original,v=>snapshots.push(structuredClone(v))));
 const last=snapshots.at(-1),failed=last.snapshots.find(x=>x.name==='burn-last');assert.equal(last.status,'failed');assert.equal(last.rollbackSucceeded,true);assert.equal(db.released,true);
 assert.deepEqual(failed.handlerRows.map(x=>x.schema_name),['alpha','beta']);assert.ok(last.events.some(x=>x.label==='burn-last:handler'&&x.status==='ok'&&x.bindings[1]==='ownedoracle'));
});
test('database errors persist failing SQL, bindings and error before cleanup',async()=>{
 const db=mock({failBurn:true}),snapshots=[];await assert.rejects(ownedSchemaPostgresOracle(db,original,v=>snapshots.push(structuredClone(v))));
 const last=snapshots.at(-1),event=last.events.find(x=>x.label==='burn-one');assert.equal(event.status,'error');assert.equal(event.error.code,'XX001');
 assert.deepEqual(event.bindings,['atomicassets','1']);assert.match(event.sql,/UPDATE atomicassets_assets/);assert.equal(last.rollbackSucceeded,true);assert.equal(db.released,true);
});
