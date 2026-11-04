// Domain-specific companion to the shared, independently admitted Linux controller.
// Creates no client/listener/process and grants no chain or production authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as logical from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {createAtomicStatefulPlugin} from '../../../dist/stateful/plugin.js';
import {ROYALTY_TEMPLATE_MODEL_ID} from '../../../dist/stateful/royalty-rules.js';
import {limits as fixtureLimits} from '../../../tests/fixtures/royalty-rule-component.mjs';
import {verifyDomainProfile as verifySharedEmissions,HAPI_REVISION,SDK_REVISION,NATIVE_PROFILE} from '../owned-schema-mongodb/controller.mjs';
import {runRoyaltyTemplateNativeDifferential} from './driver.mjs';
const hex=n=>n.toString(16).padStart(64,'0'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const PROFILE='atomicmarket-royalty-template-cbfb-c561-qualification-v1';
export const MODEL_SHA256='04a67391497f89d053ddf4df27d62bd73b38f82a7fb5fa06476d43ee549ce684';
export const PROFILE_SHA256='6fc82b9a5dad2f442853a4265f71c61bc495652f62f18c83dbf8311be1ae55d9';
const root=new URL('../../../',import.meta.url);
export function verifyRoyaltyProfile(read=path=>readFileSync(new URL(path,root),'utf8')){
 const raw=read('scripts/qualification/royalty-template-mongodb/profile.json').replace(/\r\n/g,'\n');assert.equal(digest(raw),PROFILE_SHA256,'royalty profile differs');
 const profile=JSON.parse(raw);assert.equal(profile.profile,PROFILE);assert.equal(profile.hapi,HAPI_REVISION);assert.equal(profile.sdk,SDK_REVISION);
 for(const file of profile.files)assert.equal(digest(read(file.path).replace(/\r\n/g,'\n')),file.sha256,'royalty source differs: '+file.path);
 verifySharedEmissions();return profile;
}
export async function prepareRoyaltyDeclaration(backendId,generation){
 assert.match(backendId,/^h45_indexed_[a-f0-9]{12}$/);assert.match(generation,/^am-royalty-[a-f0-9]{16}$/);
 const bounds={...fixtureLimits(),readAttempts:128,mutations:256};
 const plugin=createAtomicStatefulPlugin({limits:bounds,engineeringRoyaltyTemplateQuery:true,engineeringRoyaltyTemplateMongoComparison:true});
 const registration=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections.find(x=>x.definition.id.endsWith(':royalty-template-rules'));
 assert.ok(registration);const requirement=registration.requiredIndexedQueries.find(x=>x.model.id===ROYALTY_TEMPLATE_MODEL_ID);assert.ok(requirement);
 assert.equal(digest(JSON.stringify(requirement.model)),MODEL_SHA256,'royalty model differs');
 const binding={chainId:hex(1),backendId,generation,mappingRevision:hex(2),hookArtifact:hex(3),hookRevision:hex(4),codecRevision:hex(5),normalizerRevision:hex(6)};
 const projection=await logical.captureStatefulDeclaration({...registration.definition,binding,selectors:registration.definition.selectors.map(s=>({...s,abiDeployment:'fixture',abiSha256:hex(7)}))},bounds);
 return {registration,requirement,projection,bounds};
}
export async function runRoyaltyQualification({profile,admission,client,databaseName,generation,nativeOwner,nativeIndexed,nativeEngineering,persist,onPhase,onNamespace}){
 assert.equal(profile,PROFILE);assert.equal(admission?.hapiRevision,HAPI_REVISION);assert.equal(admission?.sdkRevision,SDK_REVISION);assert.equal(admission?.profile,NATIVE_PROFILE);verifyRoyaltyProfile();
 assert.equal(typeof persist,'function');assert.equal(typeof onPhase,'function');assert.equal(typeof onNamespace,'function');assert.ok(client);const {registration,requirement,projection,bounds}=await prepareRoyaltyDeclaration(databaseName,generation);
 const draft=await owner.captureStatefulOwnerDeclarationV2(projection,2),completeLimits={readAttempts:12,responseRecords:8,responseBytes:65536};
 const config={client,databaseName,backendId:databaseName,collectionPrefix:'atomicmarket_royalty',declaration:draft,receiptRetention:4,rollbackRetentionBlocks:4,rollbackRetentionBytes:4194304,rollbackMaxBlockBytes:1048576,operationTimeoutMS:5000,transactionTimeoutMS:15000};
 const base=await nativeOwner.createMongoDbStatefulCompleteKindAdapterV1(config,completeLimits);
 const host={family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported:owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2,limits:bounds};
 const declaration=await owner.negotiateStatefulOwnerV2(projection,host,base.capabilities),model=await indexed.captureIndexedDeclarationV1(declaration,requirement.modelRevision,requirement.model);
 const adapter=await nativeIndexed.createMongoDbStatefulIndexedAdapterV1({...config,declaration},[{declaration:model,limits:requirement.limits}],completeLimits,base);
 onNamespace(config.collectionPrefix+'_ix1_'+model.digest+'_r',model.digest);
 const engineering=nativeEngineering.selectMongoDbRoyaltyEngineeringAssemblyV1(adapter,NATIVE_PROFILE);assert.deepEqual(adapter.indexedCapabilities.queryDeclarationDigests,[]);
 const identity={id:'atomicmarket-royalty-qualification',generation:'one'},lease=await adapter.acquireOwner({expected:null,nextOwner:identity},()=>{}),custody=new Map();let active=true;
 const guard=()=>{if(!active)throw Error('qualification authority retired');};
 const key=(d,s)=>d+':'+s,store={async load(d,s){return custody.get(key(d,s))??null;},async retain(candidate){const k=key(candidate.declarationDigest,candidate.source.digest),prior=custody.get(k);if(prior)assert.equal(prior.digest,candidate.digest);else{persist({event:'candidate',candidate});custody.set(k,structuredClone(candidate));}}};
 persist({event:'declarations',profile,projectionDigest:projection.digest,ownerDigest:declaration.digest,modelDigest:model.digest,modelHash:MODEL_SHA256,generation,authority:'controlled synthetic fixture; no chain or production authority'});
 try{const result=await runRoyaltyTemplateNativeDifferential({registration,declaration,model,limits:requirement.limits,adapter,engineering,identity,lease,guard,...store,onPhase,onObservation:observation=>persist({event:'observation',...observation})});persist({event:'results',result});return {result,projectionDigest:projection.digest,ownerDigest:declaration.digest,modelDigest:model.digest};}
 finally{active=false;}
}
