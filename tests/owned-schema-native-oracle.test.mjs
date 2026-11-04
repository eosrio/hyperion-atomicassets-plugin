import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSnapshots,loadOriginalOracle,verifySnapshot} from '../scripts/qualification/owned-schema-mongodb/oracle.mjs';
const snapshots=loadOriginalOracle();
const observation=s=>({name:s.name,statusCode:200,body:{success:true,data:structuredClone(s.handlerRows).reverse()},counts:structuredClone(s.counts).reverse()});
test('all retained PostgreSQL snapshots compare complete unordered HTTP rows and exact counts',async()=>{
 const advanced=[];const out=await compareSnapshots({async advance(name){advanced.push(name);},async observe(name){return observation(snapshots.find(s=>s.name===name));}});
 assert.deepEqual(advanced,snapshots.map(s=>s.name));assert.equal(out.length,8);
});
test('differential rejects missing rows, duplicate rows, changed count and HTTP failures',()=>{
 const snapshot=snapshots[1];
 for(const alter of [x=>x.body.data.pop(),x=>x.body.data.push(x.body.data[0]),x=>x.counts[0].owned='3',x=>x.statusCode=503]){
  const value=observation(snapshot);alter(value);assert.throws(()=>verifySnapshot(snapshot,value));
 }
});
test('oracle requires the exact retained bytes',()=>{assert.throws(()=>loadOriginalOracle(Buffer.from('{}')),/evidence bytes/);});
