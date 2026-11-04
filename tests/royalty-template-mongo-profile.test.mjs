import test from 'node:test';
import assert from 'node:assert/strict';
import {AtomicPlugin,prepared,limits} from './fixtures/royalty-rule-component.mjs';
const simple='mongodb-simple-utf8-v1', context={binding:{},sourceCapabilities:['original-action-authorization-v1']};
test('Mongo simple comparison requires a separate explicit opt-in and does not alter other models',async()=>{
 assert.throws(()=>new AtomicPlugin({limits:limits(),engineeringRoyaltyTemplateMongoComparison:true}),/requires engineeringRoyaltyTemplateQuery/);
 const base=new AtomicPlugin({limits:limits(),engineeringRoyaltyTemplateQuery:true}).getStatefulProjectionsV2(context).projections;
 const selected=new AtomicPlugin({limits:limits(),engineeringRoyaltyTemplateQuery:true,engineeringRoyaltyTemplateMongoComparison:true}).getStatefulProjectionsV2(context).projections;
 assert.equal(base[2].requiredIndexedQueries[0].model.textComparison,'atomicmarket-270-royalty-template-pg16-v1');
 assert.equal(selected[2].requiredIndexedQueries[0].model.textComparison,simple);
 for(const i of [0,1,3]){assert.deepEqual(selected[i].definition,base[i].definition);assert.deepEqual(selected[i].requiredIndexedQueries,base[i].requiredIndexedQueries);}
 const without=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true,engineeringRoyaltyTemplateMongoComparison:true},comparison:'atomicmarket-270-royalty-template-pg16-v1'});
 try{const r=await without.api.inject('/atomicmarket/v1/royalties/oracle/templates');assert.equal(r.statusCode,503);assert.equal(without.adapter.queryCalls,0);}finally{await without.close();}
});
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
test('pinned native planner receives the opted-in model and uses BSON Long sets', {skip:!process.env.HAPI_ROYALTY_REFERENCE_ROOT}, async()=>{
 const root=process.env.HAPI_ROYALTY_REFERENCE_ROOT;
 assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),'49dfe804590ab5b9cb17df05ebc85eb8e6976b14');
 for(const [file,expected] of [['packages/backend-mongodb/src/stateful-indexed-model-v1.ts','7712acc352192e6d79ec398f1659386f1e4be3fc977a0873dcf8ca7e574cc643'],['packages/backend-mongodb/dist/stateful-indexed-model-v1.js','6c75d9f37c9840b726beabb4868d02485b7354548fd2d8c1da1b7adcd24ddfce'],['packages/backend-mongodb/node_modules/@eosrio/hyperion-sdk/dist/projection-stateful-indexed-query-v1.js','1965ed0403d6f6aea30b0b3018bb43775312527d5a76295b3f0660d2f29dce18']])assert.equal(createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),expected,file);
 const native=await import(pathToFileURL(join(root,'packages/backend-mongodb/dist/stateful-indexed-model-v1.js')));
 const sdk=await import(pathToFileURL(join(root,'packages/backend-mongodb/node_modules/@eosrio/hyperion-sdk/dist/projection-stateful-owner-v2.js')));
 const state=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true,engineeringRoyaltyTemplateMongoComparison:true},comparison:simple});
 try{
  const received=await sdk.receiveStatefulOwnerDeclarationV2(state.declaration),caps=supported=>({family:sdk.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:received.projection.limits});
  const owner=await sdk.negotiateStatefulOwnerV2(received.projection,caps(sdk.STATEFUL_OWNER_HOST_CAPABILITIES_V2),caps(sdk.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
  assert.equal(owner.digest,state.declaration.digest);const captured=await native.receiveMongoIndexedModelV1(owner,state.model,state.requirement.limits);
  assert.doesNotThrow(()=>native.assertMongoIndexedTracerModelV1(captured));
  const query={kind:'page',where:[{field:'market_contract',op:'eq',value:'atomicmarket'},{field:'collection_name',op:'eq',value:'oracle'},{field:'template_id',op:'in',values:['-2','0','9223372036854775807']}],order:[{field:'template_id',direction:'asc',nulls:'last'}],offset:'0',limit:10,select:['market_contract','collection_name','template_id'],records:['rule']};
  const plan=native.planMongoIndexedQueryV1(captured,query,'inert');const ids=plan.pipeline[0].$match.$and.find(x=>x['v.template_id'])['v.template_id'].$in;
  assert.deepEqual(ids.map(x=>x.toString()),['-2','0','9223372036854775807']);assert.ok(ids.every(x=>x._bsontype==='Long'));assert.equal(plan.allowDiskUse,false);
 }finally{await state.close();}
});
