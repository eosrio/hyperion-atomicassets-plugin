import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as sdk from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {createAtomicStatefulPlugin} from '../dist/stateful/plugin.js';
import {OWNED_SCHEMA_MODEL_ID,OWNED_SCHEMA_MONGO_ENGINEERING_COMPARISON} from '../dist/stateful/owned-schema-indexed.js';
import {SCHEMA_LIST_COMPARISON} from '../dist/stateful/schema-indexed.js';
import {limits} from './fixtures/config-component.mjs';
const hex=n=>n.toString(16).padStart(64,'0');
async function prepare(engineering=false){
 const bounds={...limits(),recordKinds:22},plugin=createAtomicStatefulPlugin({limits:bounds,ownedSchemaCounts:true,...(engineering?{engineeringOwnedSchemaMongoComparison:true}:{})});
 const reg=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
 const requirement=reg.requiredIndexedQueries.find(x=>x.model.id===OWNED_SCHEMA_MODEL_ID);assert.ok(requirement);
 const binding={chainId:hex(1),backendId:'native-schema-fixture',generation:'fresh',mappingRevision:hex(2),hookArtifact:hex(3),hookRevision:hex(4),codecRevision:hex(5),normalizerRevision:hex(6)};
 const projection=await sdk.captureStatefulDeclaration({...reg.definition,binding,selectors:reg.definition.selectors.map(s=>({...s,abiDeployment:'fixture',abiSha256:hex(7)}))},bounds);
 const cap=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:bounds});
 const declaration=await owner.negotiateStatefulOwnerV2(projection,cap(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),cap(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 return {requirement,declaration,model:await indexed.captureIndexedDeclarationV1(declaration,requirement.modelRevision,requirement.model)};
}
test('Mongo comparison is explicit, model-local and never changes the default offer',async()=>{
 const normal=await prepare(),engineering=await prepare(true);assert.equal(normal.model.model.textComparison,SCHEMA_LIST_COMPARISON);assert.equal(engineering.model.model.textComparison,OWNED_SCHEMA_MONGO_ENGINEERING_COMPARISON);assert.notEqual(normal.model.digest,engineering.model.digest);
 assert.throws(()=>createAtomicStatefulPlugin({limits:limits(),engineeringOwnedSchemaMongoComparison:true}),/requires ownedSchemaCounts/);
});
test('pinned native Mongo planner accepts the explicit owned-schema model without claiming engine execution', {skip:!process.env.HAPI_INDEXED_REFERENCE_ROOT}, async()=>{
 const root=process.env.HAPI_INDEXED_REFERENCE_ROOT;assert.ok(root,'HAPI_INDEXED_REFERENCE_ROOT must identify the exact native engineering checkout');
 const sha=file=>createHash('sha256').update(readFileSync(join(root,file))).digest('hex');
 assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),'770faa16f8bd2b02f51bb6a6296b7092224f5301');
 assert.equal(sha('packages/backend-mongodb/src/stateful-indexed-model-v1.ts'),'49027829ba770e452c75a923b8da3b217e5d5c4717a905ef2a99b36cc2745dc1');
 assert.equal(sha('packages/backend-mongodb/dist/stateful-indexed-model-v1.js'),'6676526ddf9660abab25aaa6fc1faf810ff42107a0eb69c2cf970208a99780d7');
 const native=await import(pathToFileURL(join(root,'packages/backend-mongodb/dist/stateful-indexed-model-v1.js')));
 const sdkOwner=await import(pathToFileURL(join(root,'packages/backend-mongodb/node_modules/@eosrio/hyperion-sdk/dist/projection-stateful-owner-v2.js')));
 const f=await prepare(true),received=await sdkOwner.receiveStatefulOwnerDeclarationV2(f.declaration);
 const capability=supported=>({family:sdkOwner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:received.projection.limits});
 const negotiated=await sdkOwner.negotiateStatefulOwnerV2(received.projection,capability(sdkOwner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),capability(sdkOwner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 assert.equal(negotiated.digest,f.declaration.digest);const model=await native.receiveMongoIndexedModelV1(negotiated,f.model,f.requirement.limits);
 assert.equal(model.declaration.model.textComparison,native.MONGO_SIMPLE_INDEXED_COMPARISON_V1);assert.ok(native.mongoIndexedIndexesV1(model).length>=1);
 const key=JSON.stringify(['atomicassets','cats','alpha']),target={kind:'owned-schema-count',key},record={contract:'atomicassets',collection_name:'cats',schema_name:'alpha',owned:'2'};
 const [encoded]=native.encodeMongoIndexedRowsV1(model,target,record);assert.equal(encoded.v.owned.toString(),'2');assert.deepEqual({...native.decodeMongoIndexedRowV1(model,'owned',encoded).value},record);
 assert.throws(()=>native.encodeMongoIndexedRowsV1(model,target,{...record,owned:'9223372036854775808'}));assert.throws(()=>native.encodeMongoIndexedRowsV1(model,target,{...record,owned:null}));
 const where=[{field:'contract',op:'eq',value:'atomicassets'},{field:'collection_name',op:'eq',value:'cats'},{field:'owned',op:'gt',value:'0'}];
 const count=native.planMongoIndexedQueryV1(model,{kind:'count',exact:true,where},'fixture_rows');assert.equal(count.allowDiskUse,false);assert.ok(count.hint);assert.ok(count.pipeline.some(x=>x.$group));
 const page=native.planMongoIndexedQueryV1(model,{kind:'page',where,order:[{field:'schema_name',direction:'asc',nulls:'last'}],offset:'0',limit:2,select:['schema_name'],records:[]},'fixture_rows');assert.equal(page.allowDiskUse,false);assert.ok(page.hint);assert.ok(page.pipeline.some(x=>x.$sort));
});
