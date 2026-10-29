import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import Fastify from 'fastify';
import {captureStatefulDeclaration} from '@eosrio/hyperion-sdk/projection-stateful';
import AtomicPlugin, {createAtomicStatefulPlugin, createAtomicMetadataCodec, ATOMIC_METADATA_CODEC,
  ATOMIC_HOOK_INVENTORY, ATOMIC_CAPABILITY_GAPS} from '../dist/index.js';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
import {initial, input, key, stages} from './fixtures/asset-domain-cases.mjs';
import {readLifecycleAsset} from '../dist/atomicassets/internal/lifecycle.js';
import {input as marketInput, scenario} from './fixtures/fixed-sale-cases.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const binding = {chainId:'a'.repeat(64),backendId:'host-owned',generation:'host-generation',mappingRevision:'b'.repeat(64),
  hookArtifact:'c'.repeat(64),hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)};
const options = () => ({limits:{...atomicLimits,selectors:128,recordKinds:20}});
const descriptor = plugin => plugin.getStatefulProjectionsV2({binding,sourceCapabilities:['original-action-authorization-v1']});
function source(events) {
  return {previous:{blockNum:0,blockId:'0'.repeat(64)},block:{blockNum:1,blockId:'1'.repeat(64),previousBlockId:'0'.repeat(64),timeMs:'1700000000000'},
    inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract:input.contract,name:e.table??e.name,
      data:structuredClone(e.value),sourceEvidence:hash('actual retained occurrence '+i),abiDeployment:'actual-abi-occurrence',abiSha256:'a'.repeat(64),
      transactionId:e.transactionId??null,...(e.kind==='row'?{present:e.present,identity:{kind:'contract-row',scope:e.scope,primaryKey:String(i)}}:{})}))};
}
function port(s,state=new Map()) {
  return {source:s,async get(kind,k){return state.has(kind+k)?{status:'present',value:structuredClone(state.get(kind+k))}:{status:'covered-absent'};},
    put(kind,k,value){state.set(kind+k,structuredClone(value));},delete(kind,k){state.delete(kind+k);},state};
}

test('one compound descriptor fits the actual host template and never supplies binding or ABI epochs',async()=>{
  const p=createAtomicStatefulPlugin(options()),registered=descriptor(p);
  assert.equal(registered.interfaceVersion,2);assert.equal(registered.sourceInputVersion,2);assert.equal(registered.projections.length,1);
  const {definition,limits}=registered.projections[0];assert.equal(definition.id,'atomicassets');assert.equal(Object.hasOwn(definition,'binding'),false);
  assert.ok(definition.selectors.some(s=>s.contract==='atomicassets'));assert.ok(definition.selectors.some(s=>s.contract==='atomicmarket'));
  assert.equal(new Set(definition.selectors.map(s=>s.id)).size,definition.selectors.length);
  for(const s of definition.selectors) assert.deepEqual(Object.keys(s).sort(),['contract','id','kind','name']);
  assert.equal(binding.codecRevision,'e'.repeat(64),'Host compound codec identity differs from metadata artifact identity');
  limits.value.depth=1;assert.equal(descriptor(p).projections[0].limits.value.depth,atomicLimits.value.depth);
  assert.throws(()=>definition.selectors.push({}),TypeError);
  const captured=await captureStatefulDeclaration({...definition,binding,
    selectors:definition.selectors.map(s=>({...s,abiDeployment:'host-resolved-deployment',abiSha256:'a'.repeat(64)}))},
    descriptor(p).projections[0].limits);
  assert.equal(captured.definition.id,definition.id,'Actual SDK accepts the host-resolved descriptor');
});
test('inventory covers all 99 original processor registrations and retains explicit partial/gap semantics',()=>{
  assert.equal(ATOMIC_HOOK_INVENTORY.baseline.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  assert.equal(ATOMIC_HOOK_INVENTORY.hooks.length,99);assert.equal(ATOMIC_HOOK_INVENTORY.sources.length,34);
  assert.equal(ATOMIC_HOOK_INVENTORY.lifecycleHooks.length,4);
  assert.ok(ATOMIC_HOOK_INVENTORY.hooks.some(h=>h.name==='templates2'&&h.coverage==='partial'));
  assert.ok(ATOMIC_HOOK_INVENTORY.hooks.some(h=>h.name==='lognewbuyo'&&h.coverage==='partial'));
  assert.equal(ATOMIC_HOOK_INVENTORY.hooks.filter(h=>h.processor==='auctions'&&h.coverage==='partial').length,7);
  assert.ok(ATOMIC_HOOK_INVENTORY.hooks.every(h=>h.coverage!=='complete'));
  assert.ok(ATOMIC_CAPABILITY_GAPS.includes('scope-less table domain interpretation'));
});
test('distributed codec is byte-exact original and runtime delegates real metadata serialization',()=>{
  assert.equal(hash(readFileSync(new URL('../vendor/atomicassets-2.2.0/build/index.cjs',import.meta.url))),ATOMIC_METADATA_CODEC.sha256);
  const codec=createAtomicMetadataCodec();assert.deepEqual(codec.attributes([{key:'exact',value:['uint64','18446744073709551615']}]),{exact:'18446744073709551615'});
});
test('actual decoded data reaches unchanged lifecycle reducer without an engineering envelope',async()=>{
  const reduce=descriptor(createAtomicStatefulPlugin(options())).projections[0].reduce;
  const p=port(source(initial()));await reduce(p);
  const asset=await readLifecycleAsset(p,input.contract,input.assetId);assert.equal(asset.asset_id,input.assetId);
  assert.equal(asset.owner,'alice');assert.equal(asset.mutable_data.name,input.updatedAttributes.find(a=>a.key==='name').value[1]);
  const update=port(source(stages()[2]),p.state);await reduce(update);assert.equal((await readLifecycleAsset(update,input.contract,input.assetId)).owner,'bob');
  const burn=port(source(stages()[4]),p.state);await reduce(burn);assert.equal((await readLifecycleAsset(burn,input.contract,input.assetId)).owner,null);
});
test('one actual reducer callback dispatches combined AA lifecycle and source-bound market sale actions',async()=>{
  const reduce=descriptor(createAtomicStatefulPlugin(options())).projections[0].reduce,s=source(initial());
  const evidence={sourceEvidence:hash('retained market config'),abiDeployment:'market-abi',abiSha256:'b'.repeat(64)};
  s.inputs.push({kind:'table',contract:marketInput.marketContract,name:'config',present:true,
    data:{version:'1.2.2',atomicassets_account:input.contract,supported_tokens:[],supported_symbol_pairs:[]},...evidence});
  for(const event of scenario('same-block-start-before-create').blocks[0].events)
    s.inputs.push({kind:'action',contract:marketInput.marketContract,name:event.name,data:event.data,
      transactionId:'c'.repeat(64),...evidence});
  const p=port(s);await reduce(p);
  const sale=p.state.get('market-sale'+key(marketInput.marketContract,marketInput.saleId));
  assert.equal(sale.state,1);assert.equal(sale.listing_price,'9007199254740993');assert.equal(sale.offer_id,marketInput.offerId);
  assert.equal((await readLifecycleAsset(p,input.contract,input.assetId)).asset_id,input.assetId);
  assert.equal([...p.state.keys()].some(k=>k.startsWith('offer')||k.startsWith('market-token')),false,'No manufactured relationship rows');
  const unknown=source([]);unknown.inputs=s.inputs.filter(i=>i.kind==='action'&&i.contract===marketInput.marketContract);
  await assert.rejects(reduce(port(unknown)),/Missing required relationship/);
});
test('missing schema, unsupported metadata and scope-less domain identity cannot become successful effects',async()=>{
  const reduce=descriptor(createAtomicStatefulPlugin(options())).projections[0].reduce;
  await assert.rejects(reduce(port(source(initial().filter(e=>e.table!=='schemas')))),/Missing required relationship/);
  const s=source(initial());s.inputs.find(e=>e.name==='schemas').identity={kind:'kv-primary',tableId:1,keyHex:'00'};
  await assert.rejects(reduce(port(s)),/actual scoped/);
  for(const value of ['a\\u0000b']) {const events=initial();events[0].value.new_data=[{key:'name',value:['string',value]}];
    await assert.rejects(reduce(port(source(events))),/Metadata codec refused/);}
});
test('unsupported original hooks and missing market relationships refuse instead of manufacturing rows',async()=>{
  const reduce=descriptor(createAtomicStatefulPlugin(options())).projections[0].reduce;
  const bad=source([]);bad.inputs=[{kind:'action',contract:'atomicassets',name:'logbackasset',data:{},sourceEvidence:'x',abiDeployment:'x',abiSha256:'a'.repeat(64)}];
  await assert.rejects(reduce(port(bad)),/Unimplemented AtomicAssets action/);
  const market=source([]);market.inputs=[{kind:'table',contract:'atomicmarket',name:'offers',data:{},present:true}];
  await assert.rejects(reduce(port(market)),/Unimplemented AtomicMarket/);
});
test('legacy constructor and both ID routes use only the request-scoped host and shared projection',async()=>{
  const plugin=new AtomicPlugin({...options(),projectionId:'both',assetsContract:'assets',marketContract:'market'});
  assert.deepEqual(plugin.dynamicContracts,['assets','market','eosio']);assert.deepEqual(plugin.actionHandlers,[]);assert.deepEqual(plugin.deltaHandlers,[]);
  const api=Fastify(),calls=[];
  assert.throws(()=>plugin.addRoutes(api),/request-scoped/);
  plugin.addRoutes(api,{statefulQueryHost(request){calls.push(request.url);return {async compose(id,read){assert.equal(id,'both');
    return {value:await read({async get(){return {status:'covered-absent'};}})};}};}});
  for(const url of ['/atomicassets/v1/assets/1','/atomicmarket/v1/sales/1']) assert.equal((await api.inject(url)).statusCode,416);
  assert.deepEqual(calls,['/atomicassets/v1/assets/1','/atomicmarket/v1/sales/1']);await api.close();
});
