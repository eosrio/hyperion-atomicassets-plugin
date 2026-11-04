// Independent fail-closed check of the persisted report, including cleanup.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function checkReport(report){
 assert.equal(report?.status,'passed');
 assert.equal(report?.connectionClose?.attempted,true);
 assert.equal(report?.connectionClose?.succeeded,true);
 assert.ok(report?.completedAt);
 assert.ok(report?.royaltyTemplate);
 assert.equal(report?.ownedSchema?.status,'passed');
 assert.equal(report?.ownedSchema?.rollbackSucceeded,true);
 assert.deepEqual(report?.ownedSchema?.snapshots?.map(x=>x.name),['empty','insert','transfer','burn-one','burn-last','after-rollback','delete-alpha','delete-beta']);
 assert.ok(report?.ownedSchema?.events?.some(x=>x.label==='trigger-identity'&&x.status==='ok'&&x.rows?.length===1));
 assert.ok(report?.ownedSchema?.events?.some(x=>x.label==='rollback-transaction'&&x.status==='ok'));
 for(const [path,sha] of [['src/api/namespaces/atomicassets/handlers/collections.ts','943826d8a9bf0d4adfc93480020b6691708214bb223813f89487f874d7bce56e'],
  ['definitions/migrations/1.3.15/atomicassets.sql','e08678302db4f48c6327eea6815826738a081d73c71751445f628ed46b6c731e']]){
  const entry=report?.ownedSource?.find(x=>x.path===path);assert.equal(entry?.sourceSha256,sha);assert.equal(entry?.fixtureSha256,sha);assert.equal(entry?.workingSha256,sha);
 }
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 checkReport(JSON.parse(readFileSync(process.argv[2],'utf8')));
}
