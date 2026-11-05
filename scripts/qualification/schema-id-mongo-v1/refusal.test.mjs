import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedRefusal} from './refusal.mjs';
import {classifyCorpus,corpus} from '../jsonb-display-mongo-http/corpus.mjs';
import {AssetDomainUnavailable} from '../../../dist/atomicassets/internal/lifecycle-port.js';
const plans=(await classifyCorpus()).filter(p=>p.sourceRepresentable&&!p.originalSqlAccepted);
function request(plan,execute,reduce) {return {plan,original:corpus.cases[plan.index],execute,reduce};}
test('unrelated execution exception is never counted as expected reducer refusal',async()=>{
 const err=new Error('Mongo network timeout'); await assert.rejects(expectedRefusal(request(plans[0],async()=>{throw err;},async()=>{})));
});
test('all six SQL refusals demand exact original input and actual reducer rejection identity',async()=>{
 assert.equal(plans.length,6);
 for(const p of plans){const err=new AssetDomainUnavailable('Collection codec refused the supported input');const req=request(p,async hook=>hook({}),async()=>{throw err;});assert.equal((await expectedRefusal(req)).rejected,err);}
});
test('wrong domain, forged identity, swallowed hook or cleanup replacement fail',async()=>{
 const p=plans[0],good=()=>new AssetDomainUnavailable('Collection codec refused the supported input');
 for(const req of [request(p,async h=>h({}),async()=>{throw new Error('timeout');}),request(p,async h=>h({}),async()=>{throw new AssetDomainUnavailable('other');}),
   request(p,async h=>{try{await h({});}catch{}throw good();},async()=>{throw good();}),request(p,async h=>{try{await h({});}catch{}},async()=>{throw good();}),
   request(p,async h=>{try{await h({});}finally{throw new Error('cleanup failed');}},async()=>{throw good();})]) await assert.rejects(expectedRefusal(req));
});
import {reduceAssetLifecycle} from '../../../dist/atomicassets/internal/lifecycle.js';
import {storage,block,row,collectionRow} from '../../../tests/fixtures/asset-domain-cases.mjs';
test('six actual collection reducers reject the same original serialized cases before staged state commits',async()=>{
 for(const plan of plans){const store=storage(),coll=collectionRow();coll.value.serialized_data=plan.serializedHex;
  const events=[row('config',{collection_format:plan.format}),coll];
  const result=await expectedRefusal(request(plan,hook=>hook({}),()=>store.run(reduceAssetLifecycle,block(0),events)));
  assert.equal(result.evidence.errorMessage,'Collection codec refused the supported input');assert.equal(store.snapshot().size,0);
 }
});
test('mismatched source bytes or original SQL outcome are rejected before execution',async()=>{
 for(const bad of [p=>p.originalEncoded='{}',p=>p.serializedHex='00',p=>p.originalCallbackWrite.data='{}',p=>p.originalSqlAccepted=true]){
  const plan=structuredClone(plans[0]);bad(plan);let called=false;
  await assert.rejects(expectedRefusal(request(plan,async()=>{called=true;},async()=>{})));assert.equal(called,false);
 }
});
