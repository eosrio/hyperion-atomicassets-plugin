// Actual HAPI registry/API/final-publication composition for the attribute model only.
// The admitted Linux caller owns source provenance, client, namespaces and engineering selection.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const PROJECTION='atomicassets:royalty-attribute-rules',MODEL='atomicmarket-royalty-attributes';
const stateHeaders=['hyperion-state-block-num','hyperion-state-block-id','hyperion-state-last-valid'];
export async function createAttributeHost({hapiRoot,atomic,client,databaseName,generation,bounds,persist,guard,selectEngineering,onQueryResult}){
 assert.equal(process.platform,'linux');for(const f of [persist,guard,selectEngineering,onQueryResult])assert.equal(typeof f,'function');
 const load=path=>import(pathToFileURL(join(hapiRoot,path)));
 const [{StatefulProjectionRegistryV2},{installStatefulApiHostV2}]=await Promise.all([load('build/indexer/projection/stateful-registry.js'),load('build/api/helpers/stateful-owner.js')]);
 const Fastify=createRequire(join(hapiRoot,'package.json'))('fastify');
 const plugin=new atomic.default({limits:bounds,engineeringRoyaltyAttributeMongoComparison:true}),published=new Map(),proofs=new WeakSet(),active=new Map();
 const controls={source:true,mapping:true,socket:{}};
 const source={
  async statefulSelectors(selectors){guard();const proof=Object.freeze({});proofs.add(proof);return {proof,selectors:selectors.map(row=>({...row,abiDeployment:'controlled-attribute-native-v1',abiSha256:sha('controlled-attribute-native-v1')}))};},
  async open(checkpoint){guard();assert(controls.source&&[...published.values()].some(view=>view.checkpoint.blockNum===checkpoint.blockNum&&view.checkpoint.blockId===checkpoint.blockId));const proof=Object.freeze({checkpoint:structuredClone(checkpoint)});proofs.add(proof);return proof;},
  async assertStatefulView(proof,declaration){guard();assert(proofs.has(proof)&&controls.mapping&&active.get(declaration.projection.definition.id)===declaration.digest);assert(published.has(declaration.digest+':'+proof.checkpoint.blockNum+':'+proof.checkpoint.blockId));},
  async revalidate(proof){guard();assert(controls.source&&proofs.has(proof));}
 };
 const configuration={generation,backend:{kind:'mongodb',id:databaseName,database:databaseName},recovery:{receipts:64,blocks:64,bytes:16*1024*1024,maxBlockBytes:1024*1024},maximumFramesPerDrain:8,operationTimeoutMS:5000,transactionTimeoutMS:15000,api:{timeoutMs:5000}};
 const errors=[],loader={plugins:[plugin],statefulPluginsV2:()=>[{plugin,configuration:plugin.baseConfig,hookArtifact:sha(readFileSync(new URL('../../../dist/index.js',import.meta.url)))}]};
 const registry=await StatefulProjectionRegistryV2.create({chainId:'1'.repeat(64),configuration,mongo:client,client:{},source,profile:{id:'controlled-attribute-native',profileId:'synthetic-only',components:[]},completeKindMongo:async()=>client,onError:(projection,error)=>errors.push({projection,error})},loader);
 await registry.initializeMissing();assert.deepEqual(errors,[]);
 const reads=new Set();let opened=0,closed=0;
 const openedRead=read=>{assert(!reads.has(read));reads.add(read);opened++;};
 const closedRead=read=>{assert(reads.delete(read));closed++;};
 for(const [id,original]of registry.entries){
  active.set(id,original.declaration.digest);const adapter=original.adapter,facade=Object.fromEntries(Object.entries(adapter).map(([name,value])=>[name,typeof value==='function'?value.bind(adapter):value]));
  for(const name of ['reductionRead','completedRead'])facade[name]=async(...args)=>{const read=await adapter[name](...args);openedRead(read);return read;};
  facade.closeRead=read=>{const result=adapter.closeRead(read);closedRead(read);return result;};
  const observed=Object.freeze(facade);registry.entries.set(id,Object.freeze({...original,adapter:observed,...(original.completeKind?{completeKind:Object.freeze({...original.completeKind,adapter:observed})}:{})}));
 }
 const original=registry.entries.get(PROJECTION);assert(original?.indexed?.models.has(MODEL));
 assert.deepEqual(original.indexed.adapter.indexedCapabilities.queryDeclarationDigests,[]);assert.deepEqual(original.indexed.adapter.indexedCapabilities.comparisonProfiles,[]);
 const engineering=selectEngineering(original.indexed.adapter);
 const facade=Object.fromEntries(Object.entries(engineering).map(([name,value])=>[name,typeof value==='function'?value.bind(engineering):value]));
 facade.indexedForModel=async(...args)=>{
  const selected=await engineering.indexedForModel(...args),methods=Object.fromEntries(Object.entries(selected).map(([name,value])=>[name,typeof value==='function'?value.bind(selected):value]));
  return Object.freeze({...methods,
   async completedRead(...args){const read=await selected.completedRead(...args);openedRead(read);return read;},
   closeRead(read){const result=selected.closeRead(read);closedRead(read);return result;},
   async queryCompleted(...args){const answer=await selected.queryCompleted(...args);await onQueryResult({projection:PROJECTION,model:MODEL,query:structuredClone(args[2]),answer:structuredClone(answer)});return answer;}
  });
 };
 registry.entries.set(PROJECTION,Object.freeze({...original,indexed:Object.freeze({...original.indexed,adapter:Object.freeze(facade)})}));
 await persist({event:'attribute-managed-registry-model',projection:PROJECTION,model:MODEL,ownerDigest:original.declaration.digest,modelDigest:original.indexed.models.get(MODEL).declaration.digest,productionOffers:'unchanged-empty',sourceAuthority:'controlled-synthetic-only'});
 const api=Fastify();let beforeSend;
 api.addHook('onSend',async(request,reply,payload)=>{if(beforeSend)await beforeSend(request,reply);return payload;});
 const context=installStatefulApiHostV2(api,{configuration,registry:async()=>registry,probe:{currentSocket:()=>controls.socket,probe:async(_target,signal)=>{guard();return !signal.aborted&&controls.source&&controls.mapping;}}});
 plugin.addRoutes(api,context);
 const observe=async(url,view,options={})=>{
  const response=await api.inject({url,...options});
  if(response.statusCode===200){assert.equal(response.headers['hyperion-state-block-num'],String(view.checkpoint.blockNum));assert.equal(response.headers['hyperion-state-block-id'],view.checkpoint.blockId);assert.equal(response.headers['hyperion-state-last-valid'],'false');}
  else {for(const name of stateHeaders)assert.equal(response.headers[name],undefined);if(response.statusCode===503)assert.equal(response.headers['cache-control'],'no-store');}
  await persist({event:'attribute-managed-http',url,method:options.method??'GET',status:response.statusCode,headers:response.headers,rawText:response.body,body:response.body===''?null:response.json()});return response;
 };
 return {registry,controls,observe,async publish(declaration,view){guard();assert.deepEqual((await registry.entries.get(declaration.projection.definition.id).adapter.recovery()).view,view);published.set(declaration.digest+':'+view.checkpoint.blockNum+':'+view.checkpoint.blockId,structuredClone(view));},
  async late(url,change,view){assert.equal(beforeSend,undefined);let called=false;beforeSend=async(request,reply)=>{assert.equal(reply.statusCode,200);called=true;await change(request);};try{const response=await observe(url,view);assert(called);assert.equal(response.statusCode,503);return response;}finally{beforeSend=undefined;}},
  async cancelAtPublication(url,view){return this.late(url,async request=>{request.raw.emit('aborted');},view);},
  async close(){await api.close();assert.equal(reads.size,0);assert.equal(opened,closed);return {httpClosed:true,readsOpened:opened,readsClosed:closed};}
 };
}
