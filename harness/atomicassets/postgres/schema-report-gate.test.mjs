import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReport} from './schema-report-gate.mjs';
test('report gate refuses failure, incomplete work, and failed cleanup',()=>{
 const good={status:'passed',completedAt:'modeled',connectionClose:{attempted:true,succeeded:true},royaltyTemplate:{}};
 checkReport(good);
 for(const bad of [{...good,status:'failed'},{...good,status:'running'},{...good,completedAt:null},
  {...good,royaltyTemplate:null},{...good,connectionClose:{attempted:true,succeeded:false}},{...good,connectionClose:{attempted:false}}])
  assert.throws(()=>checkReport(bad));
});
