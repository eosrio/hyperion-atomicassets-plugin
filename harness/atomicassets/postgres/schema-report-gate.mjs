// Independent fail-closed check of the persisted report, including cleanup.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const stages=[
 ['empty',[],[]],['insert',['alpha','beta'],[['alpha','2'],['beta','1'],['gamma','0']]],
 ['transfer',['alpha','beta'],[['alpha','2'],['beta','1'],['gamma','0']]],
 ['burn-one',['alpha','beta'],[['alpha','1'],['beta','1'],['gamma','0']]],
 ['burn-last',['beta'],[['alpha','0'],['beta','1'],['gamma','0']]],
 ['after-rollback',['alpha','beta'],[['alpha','1'],['beta','1'],['gamma','0']]],
 ['delete-alpha',['beta'],[['alpha','0'],['beta','1'],['gamma','0']]],
 ['delete-beta',[],[['alpha','0'],['beta','0'],['gamma','0']]]];
const labels=['trigger-identity','collection','schema:alpha','schema:beta','schema:gamma','schema:empty','empty:handler','empty:counts',
 'insert:1','insert:2','insert:3','insert:4','insert:handler','insert:counts','transfer','transfer:handler','transfer:counts',
 'burn-one','burn-one:handler','burn-one:counts','savepoint','burn-last','burn-last:handler','burn-last:counts','rollback-savepoint',
 'after-rollback:handler','after-rollback:counts','delete-alpha','delete-alpha:handler','delete-alpha:counts','delete-beta','delete-beta:handler','delete-beta:counts','rollback-transaction'];
const sql={trigger:"SELECT t.tgenabled, pg_get_triggerdef(t.oid) AS trigger_definition, pg_get_functiondef(t.tgfoid) AS function_definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='atomicassets_assets' AND t.tgname='update_atomicassets_asset_counts_tr' AND NOT t.tgisinternal",
 collection:"INSERT INTO atomicassets_collections (contract,collection_name,author,allow_notify,authorized_accounts,notify_accounts,market_fee,data,created_at_block,created_at_time) VALUES ($1,$2,'author',true,ARRAY['author']::varchar[],ARRAY[]::varchar[],0,'{}',1,1)",
 schema:'INSERT INTO atomicassets_schemas (contract,collection_name,schema_name,format,types,created_at_block,created_at_time) VALUES ($1,$2,$3,ARRAY[]::jsonb[],ARRAY[]::jsonb[],1,1)',
 insert:'INSERT INTO atomicassets_assets (contract,asset_id,collection_name,schema_name,owner,transferred_at_block,transferred_at_time,updated_at_block,updated_at_time,minted_at_block,minted_at_time) VALUES ($1,$2,$3,$4,$5,1,1,1,1,1,1)',
 transfer:'UPDATE atomicassets_assets SET owner=$1 WHERE contract=$2 AND asset_id=$3',burn:'UPDATE atomicassets_assets SET owner=NULL WHERE contract=$1 AND asset_id=$2',
 remove:'DELETE FROM atomicassets_assets WHERE contract=$1 AND asset_id=$2',
 handler:'SELECT schema_name FROM atomicassets_asset_counts WHERE contract = $1 AND collection_name = $2 GROUP BY schema_name HAVING SUM(owned) > 0',
 counts:'SELECT schema_name, COALESCE(SUM(owned),0)::text AS owned FROM atomicassets_asset_counts WHERE contract=$1 AND collection_name=$2 GROUP BY schema_name ORDER BY schema_name'};
const compact=s=>s.trim().replace(/\s+/g,' ');
function expectedOwnedFunction(){
 const source=readFileSync(new URL('../../../tests/fixtures/owned-schema-original-2.7/migration.sql',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),'e08678302db4f48c6327eea6815826738a081d73c71751445f628ed46b6c731e');
 const match=source.toString('utf8').match(/CREATE OR REPLACE FUNCTION update_atomicassets_asset_counts\(\) RETURNS TRIGGER AS \$\$([\s\S]*?)\$\$ LANGUAGE plpgsql;/);
 assert.ok(match);return compact(match[1]);
}
function verifyOwned(owned){
 assert.equal(owned?.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
 const events=owned?.events,snapshots=owned?.snapshots;assert.ok(Array.isArray(events));assert.deepEqual(events.map(x=>x.label),labels);
 assert.ok(events.every(x=>x.status==='ok'));assert.ok(Array.isArray(snapshots));assert.equal(snapshots.length,stages.length);
 const check=(label,expectedSql,bindings,rowCount)=>{const e=events[labels.indexOf(label)];assert.equal(compact(e.sql),expectedSql);assert.deepEqual(e.bindings,bindings);assert.equal(e.rowCount,rowCount);assert.ok(Array.isArray(e.rows));
  if(label!=='trigger-identity'&&!label.endsWith(':handler')&&!label.endsWith(':counts'))assert.deepEqual(e.rows,[]);return e;};
 const trigger=check('trigger-identity',sql.trigger,[],1);assert.equal(trigger.rows?.length,1);const t=trigger.rows[0];assert.equal(t.tgenabled,'O');
 assert.equal(t.trigger_definition,'CREATE TRIGGER update_atomicassets_asset_counts_tr AFTER INSERT OR DELETE OR UPDATE ON public.atomicassets_assets FOR EACH ROW EXECUTE FUNCTION update_atomicassets_asset_counts()');
 assert.match(t.function_definition,/CREATE OR REPLACE FUNCTION public\.update_atomicassets_asset_counts\(\)/);
 const body=t.function_definition.match(/AS \$function\$([\s\S]*?)\$function\$/);assert.ok(body);assert.equal(compact(body[1]),expectedOwnedFunction());
 check('collection',sql.collection,['atomicassets','ownedoracle'],1);
 for(const name of ['alpha','beta','gamma','empty'])check('schema:'+name,sql.schema,['atomicassets','ownedoracle',name],1);
 for(const [id,schema,owner] of [['1','alpha','alice'],['2','alpha','bob'],['3','beta','carol'],['4','gamma',null]])check('insert:'+id,sql.insert,['atomicassets',id,'ownedoracle',schema,owner],1);
 check('transfer',sql.transfer,['dave','atomicassets','1'],1);check('burn-one',sql.burn,['atomicassets','1'],1);check('burn-last',sql.burn,['atomicassets','2'],1);
 check('savepoint','SAVEPOINT before_last',[],null);check('rollback-savepoint','ROLLBACK TO SAVEPOINT before_last',[],null);
 check('delete-alpha',sql.remove,['atomicassets','2'],1);check('delete-beta',sql.remove,['atomicassets','3'],1);check('rollback-transaction','ROLLBACK',[],null);
 for(let i=0;i<stages.length;i++){
  const [name,members,counts]=stages[i],snapshot=snapshots[i],start=labels.indexOf(name+':handler');
  assert.equal(snapshot.name,name);assert.equal(snapshot.eventStart,start);assert.equal(snapshot.eventEnd,start+2);
  assert.deepEqual(snapshot.handlerRows.map(x=>x.schema_name).sort(),members);assert.deepEqual(snapshot.handlerRows.map(x=>Object.keys(x)),members.map(()=>['schema_name']));
  assert.deepEqual(snapshot.counts,counts.map(([schema_name,owned])=>({schema_name,owned})));
  const handler=check(name+':handler',sql.handler,['atomicassets','ownedoracle'],members.length),aggregate=check(name+':counts',sql.counts,['atomicassets','ownedoracle'],counts.length);
  assert.deepEqual(handler.rows,snapshot.handlerRows);assert.deepEqual(aggregate.rows,snapshot.counts);
 }
}
export function checkReport(report){
 assert.equal(report?.status,'passed');
 assert.equal(report?.connectionClose?.attempted,true);
 assert.equal(report?.connectionClose?.succeeded,true);
 assert.ok(report?.completedAt);
 assert.equal(report?.reference?.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
 assert.equal(report?.admission?.version,'16.15');
 assert.ok(report?.royaltyTemplate);
 assert.equal(report?.sdk50?.status,'passed');
 assert.deepEqual(report.sdk50.operations.map(x=>x.name),['selected-overflow','off-page-overflow','count-overflow','statement-timeout']);
 assert.deepEqual(report.sdk50.cleanup,[{role:'reader',rollback:true,released:true},{role:'locker',rollback:true,released:true}]);
 assert.equal(report.sdk50.operations[0].dbError?.code,'22003');assert.equal(report.sdk50.operations[0].http?.status,500);
 assert.equal(report.sdk50.operations[2].http?.status,200);assert.equal(report.sdk50.operations[3].dbError?.code,'57014');assert.equal(report.sdk50.operations[3].http?.status,408);
 assert.equal(report?.ownedSchema?.status,'passed');
 assert.equal(report?.ownedSchema?.rollbackSucceeded,true);
 verifyOwned(report.ownedSchema);
 assert.equal(report?.ownedSource?.length,2);
 for(const [path,sha] of [['src/api/namespaces/atomicassets/handlers/collections.ts','943826d8a9bf0d4adfc93480020b6691708214bb223813f89487f874d7bce56e'],
  ['definitions/migrations/1.3.15/atomicassets.sql','e08678302db4f48c6327eea6815826738a081d73c71751445f628ed46b6c731e']]){
  const entry=report?.ownedSource?.find(x=>x.path===path);assert.equal(entry?.sourceSha256,sha);assert.equal(entry?.fixtureSha256,sha);assert.equal(entry?.workingSha256,sha);
 }
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 checkReport(JSON.parse(readFileSync(process.argv[2],'utf8')));
}
