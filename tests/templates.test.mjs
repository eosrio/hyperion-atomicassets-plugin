import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {executeOriginalTemplateControls} from '../harness/shared/reference.mjs';
import {validateInputProfile} from '../harness/atomicassets/lifecycle-input.cjs';
import {caseInputs,begin,template as templateRow,mutable,inputProfile} from './fixtures/template-cases.mjs';
import Fastify from 'fastify';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
import {captureStatefulDeclaration} from '@eosrio/hyperion-sdk/projection-stateful';
import {scenario as marketScenario,input as market} from './fixtures/fixed-sale-cases.mjs';
import {initial,input,row,mint,storage,block,key,codec} from './fixtures/asset-domain-cases.mjs';
const dist = process.env.AA_DOMAIN_MODULE_ROOT ? pathToFileURL(process.env.AA_DOMAIN_MODULE_ROOT.replaceAll('\\','/')+'/') : new URL('../dist/',import.meta.url);
const {reduceAssetLifecycle,readLifecycleAsset} = await import(new URL('atomicassets/internal/lifecycle.js',dist));
const {AssetDomainUnavailable} = await import(new URL('atomicassets/internal/lifecycle-port.js',dist));
const pluginDist=process.env.ATOMIC_PLUGIN_DIST_ROOT ? pathToFileURL(process.env.ATOMIC_PLUGIN_DIST_ROOT.replaceAll('\\','/')+'/') : new URL('../dist/',import.meta.url);
const {createAtomicStatefulPlugin}=await import(new URL('index.js',pluginDist));
const {readFixedSaleWithAssets}=await import(new URL('atomicmarket/internal/sale-assets.js',pluginDist));
const {readAuctionWithAssets}=await import(new URL('atomicmarket/internal/auction-assets.js',pluginDist));
const cases=caseInputs(),hash=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.parse(JSON.stringify(x));
let reference;
const original=()=>reference??=(async()=>{
  const result=await executeOriginalTemplateControls({referenceRoot:process.env.AA_REFERENCE_ROOT,input:cases});
  validateInputProfile(result.inputProfile);assert.deepEqual(result.inputProfile,inputProfile);
  assert.equal(result.inputSha256,hash(JSON.stringify(cases)));
  await mkdir(new URL('../out/templates/',import.meta.url),{recursive:true});
  await writeFile(new URL('../out/templates/original-'+process.version+'-'+process.pid+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  return result;
})();
const storageWithTemplate=()=>{const s=storage();s.add('template',input.contract,'42');s.add('template',input.contract,'43');return s;};
const template = () => row('templates',{template_id:42,schema_name:input.schema,transferable:false,burnable:true,
  max_supply:'100',issued_supply:'1',immutable_serialized_data:''});

test('actual template row precedes a templated mint and enriches its coherent asset read',async()=>{
  const s=storage();s.add('template',input.contract,'42');
  const events=initial().filter(e=>e.kind!=='action');const event=mint();event.value.template_id=42;
  await s.run(reduceAssetLifecycle,block(0),[event,template(),...events]);
  const result=await readLifecycleAsset(s.reader(),input.contract,input.assetId);
  assert.equal(result.template.template_id,'42');assert.equal(result.is_transferable,false);assert.equal(result.is_burnable,true);
  assert.equal(s.snapshot().get('asset:'+key(input.contract,input.assetId)).template_id,'42');
});

test('chronological template creation/update/clear/delete and asset view match actual original callbacks and formatter',async()=>{
  const expected=await original(),scenario=cases.cases.find(c=>c.name==='chronological'),s=storageWithTemplate();
  assert.equal(expected.reference.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(expected.sources.length,9);
  assert.equal(expected.scope.originalProcessors,true);assert.equal(expected.scope.originalAssetFormatter,true);
  for(const name of ['postgres','mongo','sourceAuthority','templateMintMaintenance','nestedSalePriceParity','fullParity'])assert.equal(expected.scope[name],false);
  const snapshots=expected.cases.find(c=>c.name===scenario.name).snapshots;
  for(let n=0;n<scenario.blocks.length;n++){
    const b=scenario.blocks[n];await s.run(reduceAssetLifecycle,b,b.events);
    assert.equal(snapshots[n].error,null);
    assert.deepEqual(json(await readLifecycleAsset(s.reader(),input.contract,input.assetId)),snapshots[n].views[0].formatted);
  }
  const row=s.snapshot().get('template:'+key(input.contract,'42'));
  assert.equal(row.immutable_data.name,'template immutable');assert.equal(row.mutable_data,null);
  assert.equal(row.max_supply,'100','Delete delta applies its actual flags/supply like original');
  assert.equal(row.deleted_at_block,scenario.blocks[3].blockNum);assert.equal(row.created_at_block,scenario.blocks[0].blockNum);
  assert.equal((await readLifecycleAsset(s.reader(),input.contract,input.assetId)).collection.name,'current collection only');
});

test('stable priority40 ordering, unknown deletion and decoder failures preserve original callback outcomes',async()=>{
  const expected=await original();
  for(const scenario of cases.cases.filter(c=>c.name!=='chronological')){
    const s=storageWithTemplate(),result=expected.cases.find(c=>c.name===scenario.name).snapshots[0],b=scenario.blocks[0];
    if(result.error!==null){await assert.rejects(s.run(reduceAssetLifecycle,b,b.events),AssetDomainUnavailable);assert.equal(s.snapshot().size,0);}
    else{await s.run(reduceAssetLifecycle,b,b.events);assert.deepEqual(json(await readLifecycleAsset(s.reader(),input.contract,input.assetId)),result.views[0]?.formatted??null);}
    if(scenario.name==='stable-equal-priority')assert.equal(s.snapshot().get('template:'+key(input.contract,'42')).mutable_data,null);
    if(scenario.name==='unknown-delete')assert.equal(s.snapshot().size,0);
  }
});

test('template schema, coverage and caller fencing errors cannot return an enriched asset',async()=>{
  const s=storageWithTemplate();await s.run(reduceAssetLifecycle,block(0),begin());const before=s.snapshot();
  const reader=s.reader(),fence=Error('caller view fenced');
  await assert.rejects(readLifecycleAsset({async get(kind,k){if(kind==='template')throw fence;return reader.get(kind,k);}},input.contract,input.assetId),e=>e===fence);
  for(const result of [{status:'unavailable',reason:'unknown'}, {status:'covered-absent'},
    {status:'present',value:{...before.get('template:'+key(input.contract,'42')),contract:'foreign'}}])
    await assert.rejects(readLifecycleAsset({get:(kind,k)=>kind==='template'?Promise.resolve(result):reader.get(kind,k)},input.contract,input.assetId),AssetDomainUnavailable);
  const bad=mutable();bad.evidence.schemaDigest='b'.repeat(64);
  await assert.rejects(s.run(reduceAssetLifecycle,block(1),[bad]),AssetDomainUnavailable);assert.deepEqual(s.snapshot(),before);
  const events=begin();events.find(e=>e.kind==='row'&&e.table==='templates').value.immutable_serialized_data='0';
  const empty=storageWithTemplate();await assert.rejects(empty.run(reduceAssetLifecycle,block(0),events),AssetDomainUnavailable);assert.equal(empty.snapshot().size,0);
});

function source(b,events){return{previous:{blockNum:Number(b.blockNum)-1,blockId:'0'.repeat(64)},block:{blockNum:Number(b.blockNum),blockId:b.blockId,previousBlockId:'0'.repeat(64),timeMs:b.blockTimeMs},
  inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract:input.contract,name:e.table??e.name,data:structuredClone(e.value),
    sourceEvidence:e.evidence.occurrence,abiDeployment:e.evidence.abiDeployment,abiSha256:e.evidence.abiSha256,
    transactionId:e.transactionId??null,...(e.kind==='row'?{present:e.present,identity:{kind:'contract-row',scope:e.scope,primaryKey:String(i)}}:{})}))};}

test('actual packaged factory dispatch and asset ID route expose the original templated asset body through one caller reader',async()=>{
  const plugin=createAtomicStatefulPlugin({limits:{...atomicLimits,selectors:128,recordKinds:19,readAttempts:128,mutations:64}}),
    descriptor=plugin.getStatefulProjectionsV2({binding:{}}),reduce=descriptor.projections[0].reduce;
  assert.ok(descriptor.projections[0].definition.records.some(r=>r.kind==='template'));
  let state=new Map();const calls=[];const port=target=>({async get(kind,k){calls.push(kind);return target.has(kind+k)?{status:'present',value:structuredClone(target.get(kind+k))}:{status:'covered-absent'};},
    put(kind,k,v){target.set(kind+k,structuredClone(v));},delete(kind,k){target.delete(kind+k);}});
  const b=block(0),candidate=structuredClone(state);await reduce({...port(candidate),source:source(b,begin())});state=candidate;
  const expected=(await original()).cases.find(c=>c.name==='chronological').snapshots[0].views[0].formatted;
  assert.deepEqual(json(await readLifecycleAsset(port(state),input.contract,input.assetId)),expected);
  const api=Fastify();plugin.addRoutes(api,{statefulQueryHost(){return {async compose(id,read){assert.equal(id,'atomicassets');return{value:await read(port(state))};}};}});
  try{const reply=await api.inject('/atomicassets/v1/assets/'+input.assetId);assert.equal(reply.statusCode,200);assert.deepEqual(reply.json().data,expected);}
  finally{await api.close();}
  assert.ok(calls.includes('template'));
});

test('combined declaration refuses explicit16,17 and18 without raising their budgets',async()=>{
  const binding={chainId:'a'.repeat(64),backendId:'fixture',generation:'combined19-new-declaration-required',mappingRevision:'b'.repeat(64),
    hookArtifact:'c'.repeat(64),hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)};
  let accepted;
  for(const recordKinds of [16,17,18,19]){
    const supplied={...atomicLimits,selectors:128,recordKinds},before=structuredClone(supplied),
      plugin=createAtomicStatefulPlugin({limits:supplied}),descriptor=plugin.getStatefulProjectionsV2({binding:{}}).projections[0];
    assert.equal(descriptor.limits.recordKinds,recordKinds);
    const definition={...descriptor.definition,binding,selectors:descriptor.definition.selectors.map(s=>({...s,abiDeployment:'host-bound',abiSha256:'a'.repeat(64)}))};
    assert.equal(definition.records.length,19);assert.ok(definition.records.some(r=>r.kind==='template'));
    assert.ok(definition.records.some(r=>r.kind==='market-auction'));
    assert.ok(definition.records.some(r=>r.kind==='marketplace'));
    if(recordKinds<19)await assert.rejects(captureStatefulDeclaration(definition,descriptor.limits),/Record kind bound/);
    else accepted=await captureStatefulDeclaration(definition,descriptor.limits);
    assert.deepEqual(supplied,before);assert.equal(plugin.getStatefulProjectionsV2({binding:{}}).projections[0].limits.recordKinds,recordKinds);
  }
  assert.equal(accepted.definition.records.length,19);
});

test('combined factory serves a templated asset while sale and auction refuse absent original price enrichment',async()=>{
  const plugin=createAtomicStatefulPlugin({limits:{...atomicLimits,selectors:128,recordKinds:19,readAttempts:128,mutations:64}}),
    reduce=plugin.getStatefulProjectionsV2({binding:{}}).projections[0].reduce,b=block(0),s=source(b,begin()),state=new Map();
  const common={sourceEvidence:'constructed-market',abiDeployment:'market-abi',abiSha256:'a'.repeat(64),transactionId:'a'.repeat(64)};
  s.inputs.push({kind:'table',contract:market.marketContract,name:'config',present:true,identity:{kind:'contract-row',scope:market.marketContract,primaryKey:'0'},
    data:{version:'1.2.2',atomicassets_account:input.contract,supported_tokens:[{token_contract:'eosio.token',token_symbol:'8,WAX'}],supported_symbol_pairs:[]},...common},
    {kind:'action',contract:input.contract,name:'lognewoffer',data:{offer_id:market.offerId,sender:'alice',recipient:market.marketContract,memo:'actual offer input',sender_asset_ids:[input.assetId],recipient_asset_ids:[]},...common});
  for(const event of marketScenario('same-block-start-before-create').blocks[0].events)
    s.inputs.push({kind:'action',contract:market.marketContract,name:event.name,data:structuredClone(event.data),...common});
  const auctionId='9007199254740993';
  s.inputs.push({kind:'action',contract:market.marketContract,name:'lognewauct',data:{auction_id:auctionId,seller:'alice',
    asset_ids:[input.assetId],starting_bid:'1.00000000 WAX',duration:60,end_time:Math.floor(Number(b.blockTimeMs)/1000)+60,
    maker_marketplace:'',collection_name:input.collection,collection_fee:.05},...common});
  const port={async get(kind,k){return state.has(kind+k)?{status:'present',value:structuredClone(state.get(kind+k))}:{status:'covered-absent'};},
    put(kind,k,v){state.set(kind+k,structuredClone(v));},delete(kind,k){state.delete(kind+k);}};
  await reduce({...port,source:s});assert.ok(await readLifecycleAsset(port,input.contract,input.assetId));
  await assert.rejects(readFixedSaleWithAssets(port,market.marketContract,market.saleId),/Templated sale price enrichment/);
  await assert.rejects(readAuctionWithAssets(port,market.marketContract,auctionId,Number(b.blockTimeMs)),/Auction template pricing/);
  const api=Fastify(),reads=[];
  api.setErrorHandler((_error,_request,reply)=>reply.code(503).send({success:false,message:'State unavailable'}));
  plugin.addRoutes(api,{statefulQueryHost(){return {async compose(id,read){assert.equal(id,'atomicassets');reads.push(id);return {value:await read(port)};}};}});
  try{
    assert.equal((await api.inject('/atomicassets/v1/assets/'+input.assetId)).statusCode,200);
    for(const path of ['sales/'+market.saleId,'auctions/'+auctionId]){
      const response=await api.inject('/atomicmarket/v1/'+path);assert.equal(response.statusCode,503);
      assert.deepEqual(response.json(),{success:false,message:'State unavailable'});
    }
    assert.deepEqual(reads,['atomicassets','atomicassets','atomicassets']);
  }finally{await api.close();}
});
