import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReport} from './schema-report-gate.mjs';
test('report gate refuses failure, incomplete work, and failed cleanup',()=>{
 const hashes=['943826d8a9bf0d4adfc93480020b6691708214bb223813f89487f874d7bce56e','e08678302db4f48c6327eea6815826738a081d73c71751445f628ed46b6c731e'];
 const good={status:'passed',completedAt:'modeled',connectionClose:{attempted:true,succeeded:true},royaltyTemplate:{},
  ownedSource:['src/api/namespaces/atomicassets/handlers/collections.ts','definitions/migrations/1.3.15/atomicassets.sql'].map((path,i)=>({path,sourceSha256:hashes[i],fixtureSha256:hashes[i],workingSha256:hashes[i]})),
  ownedSchema:{status:'passed',rollbackSucceeded:true,snapshots:['empty','insert','transfer','burn-one','burn-last','after-rollback','delete-alpha','delete-beta'].map(name=>({name})),events:[{label:'trigger-identity',status:'ok',rows:[{}]},{label:'rollback-transaction',status:'ok'}]}};
 checkReport(good);
 for(const bad of [{...good,status:'failed'},{...good,status:'running'},{...good,completedAt:null},
  {...good,royaltyTemplate:null},{...good,ownedSchema:null},{...good,ownedSchema:{...good.ownedSchema,rollbackSucceeded:false}},
  {...good,ownedSchema:{...good.ownedSchema,snapshots:[]}}, {...good,connectionClose:{attempted:true,succeeded:false}},{...good,connectionClose:{attempted:false}}])
  assert.throws(()=>checkReport(bad));
});
