/** Qualification-only domain inputs and independent original-fixture row oracle. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {hash,hex,point,stable} from './guard.mjs';

export const BRIDGE_HEAD='294abcd51a16a5d6ea4f0e00fe1531300402bf99';
export const MARKER=Object.freeze({kind:'engine-marker',key:'late-native-delete',value:{engineeringOnly:true}});
export const BRANCHES=Object.freeze({A:['A'],B:['A','B'],C:['A','C'],D:['C','D'],E:['D','E']});
export const FLOORS=Object.freeze({A:null,B:null,C:null,D:'A',E:'C'});
const clone=v=>JSON.parse(JSON.stringify(v));
const exact=(v,keys)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort());

/** All source files and actual Linux emissions must already be in the original full inventory. */
export function validatePlan(plan) {
  exact(plan,['schemaVersion','kind','pluginRoot','bridgeHead','buildPath']);
  assert.equal(plan.schemaVersion,1);assert.equal(plan.kind,'atomic-stateful-engine-qualification');
  assert.equal(plan.pluginRoot,'atomic-plugin');assert.equal(plan.bridgeHead,BRIDGE_HEAD);
  assert.equal(plan.buildPath,'atomic-plugin/engine-build.json');
  return plan;
}
export function validateDomainPins(m,plan,sourcePins,build) {
  validatePlan(plan);
  exact(sourcePins,['sourceHead','sources','emissions']);assert.equal(sourcePins.sourceHead,BRIDGE_HEAD);
  exact(build,['schemaVersion','sourceHead','platform','compiler','npmCiExecuted','files']);
  assert.equal(build.schemaVersion,1);assert.equal(build.sourceHead,BRIDGE_HEAD);assert.equal(build.platform,'linux');
  assert.equal(build.compiler,'7.0.2');assert.equal(typeof build.npmCiExecuted,'boolean');
  const map=new Map(m.modules.files.map(f=>[f.path,f]));
  for(const [name,pin]of Object.entries(sourcePins.sources)) {
    const row=map.get(plan.pluginRoot+'/'+name);assert.ok(row,'Missing original plugin source: '+name);
    assert.deepEqual({bytes:row.bytes,sha256:row.sha256},pin,'Plugin source differs from bridge pin: '+name);
  }
  assert.deepEqual(Object.keys(build.files).sort(),[...sourcePins.emissions].sort());
  for(const name of sourcePins.emissions) {
    const row=map.get(plan.pluginRoot+'/'+name);assert.ok(row,'Missing actual emitted plugin file: '+name);
    assert.deepEqual({bytes:row.bytes,sha256:row.sha256},build.files[name],'Actual build and manifest differ: '+name);
  }
  assert.ok(map.has(plan.buildPath));
  for(const name of ['domain.mjs','source-pins.json'])assert.ok(map.has('qualification/'+name));
}

/** Explicit constructed/rebased occurrences; never chain ABI or canonical source authority. */
export async function loadDomain(root) {
  const load=n=>import(pathToFileURL(join(root,n)).href);
  const scenario=await load('harness/stateful/scenario.mjs'),bridge=await load('harness/stateful/bridge.mjs');
  const assets=await load('tests/fixtures/asset-domain-cases.mjs');
  const market=await load('tests/fixtures/fixed-sale-cases.mjs');
  const reference=JSON.parse(readFileSync(join(root,'fixtures/harness/atomicmarket/lifecycle/expected.json'),'utf8'));
  const source=(label,definition=scenario.atomicDefinition())=>{
    assert.ok(['A','B','C','D','E','conflict-B'].includes(label));
    const n=label==='A'?1:label==='D'?3:label==='E'?4:2;
    const id=label==='C'?3:label==='D'?4:label==='E'?5:label==='conflict-B'?99:n;
    const previous=label==='D'?point(2,hex(3)):label==='E'?point(3,hex(4)):point(n-1);
    const events=label==='A'?scenario.firstAtomicEvents():['B','conflict-B'].includes(label)?scenario.secondAtomicEvents():label==='C'?assets.stages()[3]:[];
    return scenario.atomicSource(definition,n,events,id,previous);
  };
  // These before/after values come from pinned original callback fixtures and explicit
  // engineering block/evidence transforms, never observed adapter/engine output.
  const time=n=>source(n===1?'A':'B').block.timeMs;
  const key=(...parts)=>JSON.stringify(parts),input=assets.input;
  const rebase=(v,block='1')=>{
    const r=clone(v);for(const k of ['created_at_block','minted_at_block','updated_at_block','transferred_at_block'])if(Object.hasOwn(r,k))r[k]=block;
    return r;
  };
  const first=assets.fixture.stages[0],saleCase=reference.cases.find(c=>c.name==='same-block-start-before-create');assert.ok(saleCase);
  const listed=rebase(saleCase.snapshots[0].logicalRows[0]);
  const schema=rebase(first.schemas[0]);schema.schema_digest=assets.schemaDigest;
  const domainA=[
    {kind:'config',key:key(input.contract),value:{collection_format:clone(input.collectionFormat)}},
    {kind:'collection',key:key(input.contract,input.collection),value:rebase(first.collections[0])},
    {kind:'schema',key:key(input.contract,input.collection,input.schema),value:schema},
    {kind:'asset',key:key(input.contract,input.assetId),value:rebase(first.asset)},
    {kind:'mint',key:key(input.contract,input.assetId),value:clone(first.mints[0])},
    {kind:'market-config',key:key(market.input.marketContract),value:{version:'1.2.2',occurrence:hash('constructed:1:5'),abiDeployment:'constructed-market-abi:1',abiSha256:'a'.repeat(64)}},
    {kind:'offer',key:key(input.contract,market.input.offerId),value:clone(market.input.relationships.offer)},
    {kind:'offer-assets',key:key(input.contract,market.input.offerId),value:clone(market.input.relationships.offerAssets)},
    {kind:'market-token',key:key(market.input.marketContract,'WAX'),value:clone(market.input.relationships.token)},
    {kind:'market-sale',key:key(market.input.marketContract,market.input.saleId),value:listed},
  ];
  const rows=stage=>{
    assert.ok(Object.hasOwn(BRANCHES,stage));const target=stage==='D'||stage==='E'?'C':stage;
    const r=clone(domainA);
    if(target==='B') {
      const a=r.find(x=>x.kind==='asset').value;a.owner='bob';a.updated_at_block=a.transferred_at_block='2';a.updated_at_time=a.transferred_at_time=time(2);
      const s=r.find(x=>x.kind==='market-sale').value;Object.assign(s,{state:3,buyer:'buyer',final_price:s.listing_price,taker_marketplace:null,updated_at_block:'2',updated_at_time:time(2)});
    } else if(target==='C') {
      const changed=assets.fixture.stages[3];r.find(x=>x.kind==='collection').value=rebase(changed.collections[0]);
      const s=rebase(changed.schemas[0]);s.schema_digest=assets.schema2Digest;r.find(x=>x.kind==='schema').value=s;
    }
    if(target!=='B')r.push(clone(MARKER));
    return r.sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0);
  };
  const response=stage=>{
    const target=stage==='D'||stage==='E'?'C':stage;assert.ok(['A','B','C'].includes(target));
    const asset=rebase(first.formatted);asset.collection=rebase(asset.collection);asset.schema=rebase(asset.schema);
    const sale=rebase(saleCase.views[0].formatted);sale.collection=clone(asset.collection);sale.current_collection_fee=asset.collection.market_fee;
    if(target==='B') {
      asset.owner='bob';asset.updated_at_block=asset.transferred_at_block='2';asset.updated_at_time=asset.transferred_at_time=time(2);
      Object.assign(sale,{state:3,buyer:'buyer',taker_marketplace:null,updated_at_block:'2',updated_at_time:time(2)});
    } else if(target==='C') {
      const changed=assets.fixture.stages[3].formatted;asset.collection=rebase(changed.collection);asset.schema=rebase(changed.schema);sale.collection=clone(asset.collection);
    }
    return {asset,sale};
  };
  return Object.freeze({scenario,bridge,source,rows,response,query:scenario.atomicQuery,codec:scenario.codec,
    definition(m,runnerSha,guardSha) {
      const def=scenario.atomicDefinition();def.id='atomic-engine-fixture';
      Object.assign(def.binding,{backendId:m.caseId,generation:m.caseId,mappingRevision:m.input.sha256,
        hookArtifact:runnerSha,hookRevision:guardSha});
      def.records.push({kind:MARKER.kind,integers:[]});return def;
    },
    limits(m){return {...scenario.atomicLimits,recordKinds:16,candidateBytes:m.bounds.candidateBytes,
      envelope:{...scenario.atomicLimits.envelope,stringBytes:m.bounds.candidateBytes,recordBytes:m.bounds.candidateBytes},
      responseRecords:32,responseBytes:m.bounds.candidateBytes};},
    async reduce(port,label) {
      await bridge.reduceAtomicSource(port,{assets:input.contract,market:market.input.marketContract,codec:scenario.codec});
      if(label==='A')port.put(MARKER.kind,MARKER.key,MARKER.value);
      if(label==='B')port.delete(MARKER.kind,MARKER.key);
    },
  });
}
