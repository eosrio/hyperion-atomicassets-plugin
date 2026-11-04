import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkReport} from './schema-report-gate.mjs';
// Reduced retained Node26 report from run 41792404917; not a substitute for a fresh physical run.
const good=JSON.parse(readFileSync(new URL('./owned-schema-gate-fixture.json',import.meta.url),'utf8'));
test('real-shaped successful receipt passes, while incomplete or failed cleanup fails',()=>{
 checkReport(good);
 for(const mutate of [r=>{r.status='failed';},r=>{r.completedAt=null;},r=>{r.connectionClose.succeeded=false;},r=>{r.royaltyTemplate=null;},
  r=>{r.ownedSchema.rollbackSucceeded=false;},r=>{r.ownedSchema.baseline='other';},r=>{r.reference.commit='other';},r=>{r.admission.version='16.14';},
  r=>{r.ownedSource[0].fixtureSha256='wrong';},r=>{r.ownedSource.push(r.ownedSource[0]);}]){
  const r=structuredClone(good);mutate(r);assert.throws(()=>checkReport(r));
 }
});
test('missing, contradictory or reordered snapshots and event ranges fail',()=>{
 for(const mutate of [r=>{r.ownedSchema.snapshots=r.ownedSchema.snapshots.map(({name})=>({name}));},
  r=>{r.ownedSchema.snapshots[1].handlerRows=[];},r=>{r.ownedSchema.snapshots[1].counts[0].owned='1';},
  r=>{r.ownedSchema.snapshots[1].eventStart++;},r=>{r.ownedSchema.snapshots[1].eventEnd--;},
  r=>{r.ownedSchema.events[12].rows=[];},r=>{r.ownedSchema.events[13].rows[0].owned='0';},
  r=>{r.ownedSchema.events[12].label='empty:handler';},r=>{r.ownedSchema.events.splice(12,0,structuredClone(r.ownedSchema.events[12]));},
  r=>{[r.ownedSchema.snapshots[1],r.ownedSchema.snapshots[2]]=[r.ownedSchema.snapshots[2],r.ownedSchema.snapshots[1]];}]){
  const r=structuredClone(good);mutate(r);assert.throws(()=>checkReport(r));
 }
});
test('trigger, SQL, bindings, row counts and rollback evidence cannot be placeholders',()=>{
 for(const mutate of [r=>{r.ownedSchema.events[0].rows=[{}];},r=>{r.ownedSchema.events[0].rows[0].tgenabled='D';},
  r=>{r.ownedSchema.events[0].rows[0].function_definition='update_atomicassets_asset_counts';},
  r=>{r.ownedSchema.events[0].rows[0].function_definition=r.ownedSchema.events[0].rows[0].function_definition.replace('OLD.owner IS DISTINCT FROM NEW.owner','FALSE');},
  r=>{r.ownedSchema.events[8].sql='SELECT 1';},r=>{r.ownedSchema.events[14].bindings[0]='eve';},
  r=>{r.ownedSchema.events[17].status='error';},r=>{r.ownedSchema.events[21].rowCount=0;},
  r=>{r.ownedSchema.events[24].sql='ROLLBACK';},r=>{r.ownedSchema.events[33].rows=[{}];},
  r=>{r.ownedSchema.events[6].bindings[1]='other';}]){
  const r=structuredClone(good);mutate(r);assert.throws(()=>checkReport(r));
 }
});
