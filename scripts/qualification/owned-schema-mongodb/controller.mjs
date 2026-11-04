// Controlled fixture assembly only. No listener, process, Mongo client or chain authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as logical from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {createAtomicStatefulPlugin} from '../../../dist/stateful/plugin.js';
import {OWNED_SCHEMA_MODEL_ID} from '../../../dist/stateful/owned-schema-indexed.js';
import {limits as fixtureLimits} from '../../../tests/fixtures/config-component.mjs';
import {runOwnedSchemaNativeDifferential} from './driver.mjs';
const hex=n=>n.toString(16).padStart(64,'0');
export const PROFILE='atomicassets-owned-schema-cbfb-c561-qualification-v1';
export const HAPI_REVISION='c5619c990039b5d02dfa635d1540669305c3f3fe';
export const SDK_REVISION='cbfb26694b90b52266d1e0b9b5dbf6f8389e736b';
export const NATIVE_PROFILE='indexed-royalty-sdk-cbfb-native-cf514-engineering-v1';
export const DOMAIN_PROFILE_SHA256='318a7559a94b0329eebad845dab1fd716974375101c50fe76d0af26d6cb5e947';
const root=new URL('../../../',import.meta.url),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(rootPath) {
 const rows=[];let total=0;function visit(dir){for(const name of readdirSync(dir).sort()){const path=join(dir,name),stat=lstatSync(path);assert.equal(stat.isSymbolicLink(),false);
  if(stat.isDirectory())visit(path);else {assert.ok(stat.isFile()&&rows.length<2048&&(total+=stat.size)<=67108864);const bytes=readFileSync(path);rows.push({path:relative(rootPath,path).replaceAll('\\','/'),bytes:bytes.length,sha256:digest(bytes)});}}}
 visit(rootPath);return rows;
}
export function verifyDomainProfile(read=path=>readFileSync(new URL(path,root),'utf8'),inspect=inventory) {
 const raw=read('scripts/qualification/owned-schema-mongodb/profile.json').replace(/\r\n/g,'\n');
 assert.equal(digest(raw),DOMAIN_PROFILE_SHA256,'domain profile bytes differ');const profile=JSON.parse(raw);
 assert.equal(profile.profile,PROFILE);assert.equal(profile.sdk,SDK_REVISION);assert.equal(profile.hapi,HAPI_REVISION);
 for(const file of profile.files)assert.equal(digest(read(file.path).replace(/\r\n/g,'\n')),file.sha256,'domain source differs: '+file.path);
 assert.deepEqual(inspect(fileURLToPath(new URL('dist/',root))),profile.pluginDist,'plugin emissions differ');
 assert.deepEqual(inspect(fileURLToPath(new URL('node_modules/@eosrio/hyperion-sdk/dist/',root))),profile.sdkDist,'SDK emissions differ');
 return profile;
}
export async function prepareOwnedSchemaDeclaration(backendId,generation){
 assert.match(backendId,/^h45_indexed_[a-f0-9]{12}$/);assert.match(generation,/^aa-owned-[a-f0-9]{16}$/);
 const bounds={...fixtureLimits(),recordKinds:22,readKeys:64,readAttempts:128,mutations:256};
 const plugin=createAtomicStatefulPlugin({limits:bounds,ownedSchemaCounts:true,engineeringOwnedSchemaMongoComparison:true});
 const registration=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
 assert.equal(registration.definition.records.length,22);
 const requirement=registration.requiredIndexedQueries.find(x=>x.model.id===OWNED_SCHEMA_MODEL_ID);assert.ok(requirement);
 const binding={chainId:hex(1),backendId,generation,mappingRevision:hex(2),hookArtifact:hex(3),hookRevision:hex(4),codecRevision:hex(5),normalizerRevision:hex(6)};
 const projection=await logical.captureStatefulDeclaration({...registration.definition,binding,selectors:registration.definition.selectors.map(s=>({...s,abiDeployment:'fixture',abiSha256:hex(7)}))},bounds);
 return {registration,requirement,projection,bounds};
}
// Client and native modules must be selected by the caller's separately admitted,
// bounded Linux controller. This function does not admit assembly or create resources.
export async function runOwnedSchemaQualification({profile,admission,client,databaseName,generation,nativeOwner,nativeIndexed,nativeEngineering,persist}){
 assert.equal(profile,PROFILE);assert.equal(admission?.hapiRevision,HAPI_REVISION);assert.equal(admission?.sdkRevision,SDK_REVISION);assert.equal(admission?.profile,NATIVE_PROFILE);verifyDomainProfile();
 assert.equal(typeof persist,'function');assert.ok(client);const prepared=await prepareOwnedSchemaDeclaration(databaseName,generation);
 const {registration,requirement,projection,bounds}=prepared,draft=await owner.captureStatefulOwnerDeclarationV2(projection,2);
 const config={client,databaseName,backendId:databaseName,collectionPrefix:'atomicassets_owned',declaration:draft,receiptRetention:4,rollbackRetentionBlocks:4,rollbackRetentionBytes:4194304,rollbackMaxBlockBytes:1048576,operationTimeoutMS:5000,transactionTimeoutMS:15000};
 const completeLimits={readAttempts:12,responseRecords:8,responseBytes:65536};
 const base=await nativeOwner.createMongoDbStatefulCompleteKindAdapterV1(config,completeLimits);
 const host={family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported:owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2,limits:bounds};
 const declaration=await owner.negotiateStatefulOwnerV2(projection,host,base.capabilities);
 const model=await indexed.captureIndexedDeclarationV1(declaration,requirement.modelRevision,requirement.model);
 const adapter=await nativeIndexed.createMongoDbStatefulIndexedAdapterV1({...config,declaration},[{declaration:model,limits:requirement.limits}],completeLimits,base);
 const engineering=nativeEngineering.selectMongoDbRoyaltyEngineeringAssemblyV1(adapter,NATIVE_PROFILE);
 assert.deepEqual(adapter.indexedCapabilities.queryDeclarationDigests,[],'production adapter must not offer engineering model');
 let identity={id:'atomicassets-owned-qualification',generation:'one'},lease=await adapter.acquireOwner({expected:null,nextOwner:identity},()=>{}),serial=1000,active=true;
 const custody=new Map(),key=(d,s)=>d+':'+s,sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const guard=()=>{if(!active)throw Error('qualification authority retired');};
 const store={async load(d,s){return custody.get(key(d,s))??null;},async retain(candidate){const k=key(candidate.declarationDigest,candidate.source.digest),prior=custody.get(k);if(prior)assert.equal(prior.digest,candidate.digest);else {persist({event:'candidate',digest:candidate.digest,sourceDigest:candidate.source.digest,candidate});custody.set(k,structuredClone(candidate));}}};
 const rollback=async ancestor=>{guard();const before=await adapter.recovery();await adapter.rollbackOwned(lease,{declarationDigest:declaration.digest,revision:before.view.revision,operationId:hex(++serial),from:before.view.checkpoint,ancestor,maxBlocks:before.view.checkpoint.blockNum-ancestor.blockNum});
  const recovery=await adapter.recovery();identity={...identity,generation:'owner-'+(++serial)};lease=await adapter.acquireOwner({expected:{version:recovery.version,view:recovery.view,owner:recovery.owner},nextOwner:identity},guard);persist({event:'rollback',ancestor,view:recovery.view});return {identity,lease};};
 persist({event:'declarations',profile,projectionDigest:projection.digest,ownerDigest:declaration.digest,modelDigest:model.digest,modelHash:sha(model.model),generation,authority:'controlled synthetic fixture; no chain or production authority'});
 try {const snapshots=await runOwnedSchemaNativeDifferential({registration,declaration,model,limits:requirement.limits,adapter,engineering,identity,lease,guard,rollback,...store,onObservation:observation=>persist({event:'observation',...observation})});persist({event:'snapshots',snapshots});return {snapshots,projectionDigest:projection.digest,ownerDigest:declaration.digest,modelDigest:model.digest};}
 finally {active=false;}
}
