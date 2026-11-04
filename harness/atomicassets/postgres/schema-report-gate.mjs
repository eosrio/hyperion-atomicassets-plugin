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
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 checkReport(JSON.parse(readFileSync(process.argv[2],'utf8')));
}
