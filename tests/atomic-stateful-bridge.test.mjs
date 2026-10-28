import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
const {createAtomicStatefulHost,RECORD_KINDS,selectors,RELATIONS_CONTRACT}=await import(process.env.ATOMIC_STATEFUL_BRIDGE_MODULE?
  pathToFileURL(process.env.ATOMIC_STATEFUL_BRIDGE_MODULE).href:new URL('../harness/stateful/bridge.mjs',import.meta.url));
import {initial,stages,fixture,codec,input as aa,key} from './fixtures/asset-domain-cases.mjs';
import {input as am,scenario} from './fixtures/fixed-sale-cases.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),hex=n=>n.toString(16).padStart(64,'0');
const clone=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const component=process.env.ATOMIC_STATEFUL_COMPONENT_ROOT;
const optional=component?test:test.skip;
let sdk,adapterSdk,createAdapter,databaseFixture;
if(component) {
  const pins=JSON.parse(readFileSync(new URL('../harness/stateful/component-pins.json',import.meta.url)));
  for(const [name,pin]of Object.entries(pins.files)) {const b=readFileSync(join(component,name));assert.equal(b.length,pin.bytes,name);assert.equal(hash(b),pin.sha256,name);}
  // By-value second SDK namespace: adapter-local opaque handles must not become
  // host execution authority merely because the source bytes match.
  const hostRoot=mkdtempSync(join(tmpdir(),'atomic-qualified-host-sdk-'));
  after(()=>{assert.ok(hostRoot.startsWith(join(tmpdir(),'atomic-qualified-host-sdk-')));rmSync(hostRoot,{recursive:true});});
  writeFileSync(join(hostRoot,'package.json'),'{"type":"module"}\n');
  const prefix='node_modules/@eosrio/hyperion-sdk/';
  for(const [name,pin]of Object.entries(pins.files).filter(([name])=>name.startsWith(prefix))) {
    const relative=name.slice(prefix.length),target=join(hostRoot,relative),raw=readFileSync(join(component,name));assert.equal(hash(raw),pin.sha256);
    mkdirSync(join(target,'..'),{recursive:true});writeFileSync(target,raw,{flag:'wx'});
  }
  sdk=await import(pathToFileURL(join(hostRoot,'dist/projection-stateful.js')));
  adapterSdk=await import(pathToFileURL(join(component,'node_modules/@eosrio/hyperion-sdk/dist/projection-stateful.js')));assert.notEqual(sdk,adapterSdk);
  ({createMongoDbStatefulAdapter:createAdapter}=await import(pathToFileURL(join(component,'dist/stateful.js'))));
  ({databaseFixture}=await import(pathToFileURL(join(component,'tests/fixture.mjs'))));
}
test('qualification declaration is backend-neutral and no production export/dependency is changed',()=>{
  assert.equal(new Set(RECORD_KINDS).size,15);assert.equal(selectors(aa.contract,am.marketContract).length,18);
  const source=readFileSync(new URL('../harness/stateful/bridge.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"](?:mongodb|@eosrio\/hyperion-sdk)/);
});
import {atomicLimits as limits,atomicDefinition as definition,atomicSource as source,firstAtomicEvents as first,secondAtomicEvents as second,marketOccurrence as market} from '../harness/stateful/scenario.mjs';
class Custody {
  bytes=new Map();
  async load(d,s){const raw=this.bytes.get(d+s);return raw===undefined?null:JSON.parse(raw);}
  async retain(c){const id=c.declarationDigest+c.source.digest,raw=JSON.stringify(c);if(this.bytes.has(id))assert.equal(this.bytes.get(id),raw);this.bytes.set(id,raw);}
}
async function setup() {
  const f=databaseFixture(),def=definition(),draft=await sdk.captureStatefulDeclaration(def,limits);
  const options={client:f.client,databaseName:'atomic_component',backendId:def.binding.backendId,collectionPrefix:'bridge',declaration:draft,
    receiptRetention:8,rollbackRetentionBlocks:8,rollbackRetentionBytes:4194304,rollbackMaxBlockBytes:1048576,operationTimeoutMS:1000,transactionTimeoutMS:2000};
  const adapter=await createAdapter(options),declaration=await sdk.negotiateStatefulProjection(def,limits,
    {family:sdk.STATEFUL_FAMILY,interfaceVersion:1,supported:sdk.STATEFUL_HOST_CAPABILITIES,limits},adapter.capabilities),custody=new Custody();
  assert.throws(()=>adapterSdk.canonicalStatefulRecord(declaration,'asset',{asset_id:'1'}),/Recapture/);
  await adapter.initialize(declaration);const host=createAtomicStatefulHost({sdk,declaration,adapter,custody,guard:()=>{},codec});
  return {f,def,options,adapter,declaration,custody,host};
}
const query={assetId:aa.assetId,saleId:am.saleId};
const read=async s=>clone((await s.host.read(await s.adapter.open(s.declaration),query)).value);
optional('real emitted reducers + SDK + native adapter caller commit a shared asset/sale candidate and coherent query',async()=>{
  const s=await setup();await s.host.execute(source(s.def,1,first()));const response=await read(s);
  const expected=clone(fixture.stages[0].formatted);
  for(const k of ['minted_at_block','updated_at_block','transferred_at_block'])expected[k]='1';expected.collection.created_at_block='1';expected.schema.created_at_block='1';
  assert.deepEqual(response.asset,expected);assert.equal(canonical(response.asset),canonical(expected),'Pinned original-derived complete response bytes, explicit engineering block rebase only');assert.equal(response.sale.state,1);assert.equal(response.sale.price.amount,'9007199254740993');
  assert.equal(response.sale.collection.name,response.asset.collection.name);assert.deepEqual(response.sale.assets,[response.asset.asset_id]);
  assert.ok(s.f.native.some(n=>n.command==='transaction'));assert.equal(s.custody.bytes.size,1);
  assert.equal((await s.host.execute(source(s.def,1,first()))).status,'duplicate');
});
optional('actual adapter failure leaves pending fixed candidate; new host/adapter objects recover without reducers rerunning',async()=>{
  const s=await setup();await s.host.execute(source(s.def,1,first()));const before=await read(s),b=source(s.def,2,second());
  const business=()=>clone([...s.f.storage].filter(([name])=>name.includes('_r_')||name.includes('_u_')).map(([name,values])=>[name,[...values]])),beforeBusiness=business();
  const wrapped={capabilities:s.adapter.capabilities};for(const name of ['open','read','inspect','markIncomplete'])wrapped[name]=s.adapter[name].bind(s.adapter);
  wrapped.apply=c=>{s.f.failTransaction='before';return s.adapter.apply(c);};
  const failed=createAtomicStatefulHost({sdk,declaration:s.declaration,adapter:wrapped,custody:s.custody,guard:()=>{},codec});
  await assert.rejects(failed.execute(b),e=>e.code==='stateful.apply-unavailable');
  await assert.rejects(s.adapter.open(s.declaration),e=>e.code==='stateful.incomplete');
  assert.deepEqual(business(),beforeBusiness,'Earlier controlled transaction writes must not escape abort');
  const saved=[...s.custody.bytes.values()].find(raw=>JSON.parse(raw).source.source.block.blockNum===2);assert.ok(saved);
  const recoveredCustody=new Custody();recoveredCustody.bytes=new Map(s.custody.bytes);const adapter=await createAdapter(s.options);
  const host=createAtomicStatefulHost({sdk,declaration:s.declaration,adapter,custody:recoveredCustody,guard:()=>{},codec:{...codec,attributes(){throw Error('Recovery reran reducer codec');}}});
  assert.equal((await host.execute(b)).status,'applied');s.adapter=adapter;s.host=host;
  const current=await read(s);assert.equal(before.asset.owner,'alice');assert.equal(current.asset.owner,'bob');assert.equal(current.sale.state,3);assert.equal(current.sale.buyer,'buyer');
  assert.equal([...recoveredCustody.bytes.values()].find(raw=>JSON.parse(raw).source.source.block.blockNum===2),saved);
});
optional('fork undo rotates the read fence, replacement branch and relationship-only update preserve shared current joins',async()=>{
  const s=await setup();await s.host.execute(source(s.def,1,first()));const a=await read(s);await s.host.execute(source(s.def,2,second()));const old=await s.adapter.open(s.declaration);
  await s.adapter.rollback({declarationDigest:s.declaration.digest,revision:old.revision,operationId:hex(91),from:old.checkpoint,ancestor:{blockNum:1,blockId:hex(1)},maxBlocks:1});
  await assert.rejects(s.host.read(old,query),e=>e.code==='stateful.stale-view');assert.deepEqual(await read(s),a);
  const events=stages()[3];await s.host.execute(source(s.def,2,events,3,{blockNum:1,blockId:hex(1)}));const c=await read(s);
  assert.equal(c.asset.owner,'alice');assert.equal(c.asset.collection.name,'current joined collection');assert.equal(c.sale.collection.name,c.asset.collection.name);
  assert.equal(c.asset.minted_at_block,'1');assert.equal(c.sale.created_at_block,'1');
});
optional('source/NUL/schema failures cannot publish a partial combined candidate; cancellation keeps readiness fenced',async()=>{
  const s=await setup();for(const value of ['a\0b','a\\u0000b']) {const bad=first();bad[0].value.new_data=[{key:'name',value:['string',value]}];
    await assert.rejects(s.host.execute(source(s.def,1,bad)));assert.equal(s.custody.bytes.size,0);assert.equal((await s.adapter.open(s.declaration)).checkpoint.blockNum,0);}
  const missing=source(s.def,1,first());delete missing.block.timeMs;await assert.rejects(s.host.execute(missing));assert.equal(s.custody.bytes.size,0);
  const tampered=source(s.def,1,first());tampered.inputs[0].data.value.asset_id='changed';await assert.rejects(s.host.execute(tampered));assert.equal(s.custody.bytes.size,0);
  const canceled=createAtomicStatefulHost({sdk,declaration:s.declaration,adapter:s.adapter,custody:s.custody,codec,guard(){throw Error('Owned source canceled');}});
  await assert.rejects(canceled.execute(source(s.def,1,first())),/Owned source canceled/);assert.equal(s.custody.bytes.size,0);
});
optional('wrong-owner transfer, cancel/start, matched transfer and retained burn pass through actual combined staging',async()=>{
  const s=await setup();await s.host.execute(source(s.def,1,first()));
  await s.host.execute(source(s.def,2,[...stages()[1],market({name:'cancelsale',data:{sale_id:am.saleId}})]));
  assert.equal((await read(s)).asset.owner,'alice');assert.equal((await read(s)).sale.state,2);
  await s.host.execute(source(s.def,3,[...stages()[2],market({name:'logsalestart',data:{sale_id:am.saleId,offer_id:am.offerId}})]));
  assert.equal((await read(s)).asset.owner,'bob');assert.equal((await read(s)).sale.state,1);
  await s.host.execute(source(s.def,4,[...stages()[4],market({name:'purchasesale',data:{sale_id:am.saleId,buyer:'buyer',intended_delphi_median:'0',taker_marketplace:''}})]));
  const burned=await read(s);assert.equal(burned.asset.owner,null);assert.equal(burned.asset.burned_by_account,'bob');assert.equal(burned.asset.minted_at_block,'1');assert.equal(burned.sale.state,3);
});
optional('a coincident forward commit invalidates the original composed view rather than mixing old and new relations',async()=>{
  const s=await setup();await s.host.execute(source(s.def,1,first()));const view=await s.adapter.open(s.declaration);
  s.f.beforeFind=async name=>{if(name.includes('_r_')){s.f.beforeFind=null;await s.host.execute(source(s.def,2,second()));}};
  await assert.rejects(s.host.read(view,query),e=>e.code==='stateful.stale-view');
});
