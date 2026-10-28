/** Socket-free fixture controls. Opt-in uses the existing pinned controlled driver, never MongoDB. */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {hash,hex,point,stable,validatePrior} from './guard.mjs';
import {BRIDGE_HEAD,MARKER,validatePlan,validateDomainPins,loadDomain} from './domain.mjs';
import {verifyUndoInventory,verifyFailureTrace,captureTransactionIdentity} from './runner.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
const sourcePins=JSON.parse(readFileSync(new URL('./source-pins.json',import.meta.url)));
const plan=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url)));
const plugin=process.env.ATOMIC_ENGINE_PLUGIN_ROOT;
const component=process.env.ATOMIC_STATEFUL_COMPONENT_ROOT;
const selected=plugin&&component?test:test.skip;
const moduleRows=Object.entries(sourcePins.sources).map(([path,pin])=>({path:'atomic-plugin/'+path,...pin}));
const fakeBuild={schemaVersion:1,sourceHead:BRIDGE_HEAD,platform:'linux',compiler:'7.0.2',npmCiExecuted:false,
  files:Object.fromEntries(sourcePins.emissions.map(path=>[path,{bytes:1,sha256:hex(8)}]))};
const fakeManifest={modules:{files:[...moduleRows,...sourcePins.emissions.map(path=>({path:'atomic-plugin/'+path,...fakeBuild.files[path]})),
  ...['qualification/domain.mjs','qualification/source-pins.json','atomic-plugin/engine-build.json'].map(path=>({path,bytes:1,sha256:hex(9)}))]}};
test('fixed qualification plan refuses an alternate plugin root, source or build path before file access',()=>{
  assert.equal(validatePlan(plan),plan);
  for(const field of ['pluginRoot','buildPath','bridgeHead']) {const bad=clone(plan);bad[field]='../outside';assert.throws(()=>validatePlan(bad));}
  assert.throws(()=>validatePlan({...plan,unknown:true}));
});
test('source and actual-emission admission rejects missing, mutated and non-Linux build inputs',()=>{
  validateDomainPins(fakeManifest,plan,sourcePins,fakeBuild);
  const missing=clone(fakeManifest);missing.modules.files.pop();assert.throws(()=>validateDomainPins(missing,plan,sourcePins,fakeBuild));
  const changed=clone(fakeManifest);changed.modules.files[0].sha256=hex(77);assert.throws(()=>validateDomainPins(changed,plan,sourcePins,fakeBuild));
  const emitted=clone(fakeBuild);emitted.files[sourcePins.emissions[0]].sha256=hex(78);assert.throws(()=>validateDomainPins(fakeManifest,plan,sourcePins,emitted));
  assert.throws(()=>validateDomainPins(fakeManifest,plan,sourcePins,{...fakeBuild,platform:'win32'}));
});
test('phase continuation refuses an interrupted or differently bound predecessor',()=>{
  const prior={phase:'a',status:'passed',manifestSha256:hex(1),actualMongo:true,engineCrash:false};
  assert.equal(validatePrior(prior,'fail-b',hex(1)),prior);
  assert.throws(()=>validatePrior({...prior,status:'interrupted'},'fail-b',hex(1)));
  assert.throws(()=>validatePrior(prior,'recover-b',hex(1)));assert.throws(()=>validatePrior(prior,'fail-b',hex(2)));
});
test('failure observation must be the exact late marker delete after both domain writes and durable intent',()=>{
  const rows=[{kind:'asset',key:'asset-key'},{kind:'market-sale',key:'sale-key'}],collection='owned_rows';
  const targets=rows.map(r=>hash(JSON.stringify([r.kind,r.key]))),marker=hash(JSON.stringify([MARKER.kind,MARKER.key]));
  const binding={rowCollection:collection,metadataCollection:'owned_metadata',metadataId:hex(10),candidateDigest:hex(11),sourceDigest:hex(12)};
  const identity={lsid:{id:{type:'binary',subtype:'04',hex:'ab'.repeat(16)}},txnNumber:{type:'int64',decimal:'9007199254740993'}};
  const trace=[
    {seq:1,event:'commandStarted',command:'update',requestId:1,transactional:false,collection:binding.metadataCollection,targets:[binding.metadataId],pending:[{candidateDigest:binding.candidateDigest,sourceDigest:binding.sourceDigest}]},
    {seq:2,event:'commandSucceeded',command:'update',requestId:1,writeErrors:[]},
    ...targets.flatMap((target,i)=>[{seq:3+2*i,event:'commandStarted',command:'update',requestId:2+i,transactional:true,transaction:clone(identity),collection,targets:[target]},
      {seq:4+2*i,event:'commandSucceeded',command:'update',requestId:2+i,writeErrors:[]}]),
    {seq:7,event:'commandStarted',command:'delete',requestId:4,transactional:true,transaction:clone(identity),collection,targets:[marker]},
    {seq:8,event:'commandFailed',command:'delete',requestId:4,code:2,labels:[]},
    {seq:9,event:'commandStarted',command:'abortTransaction',requestId:5,transactional:true,transaction:clone(identity)},
    {seq:10,event:'commandSucceeded',command:'abortTransaction',requestId:5,writeErrors:[]},
  ];
  verifyFailureTrace(trace,binding,rows);
  for(const mutate of [t=>t.splice(7,1),t=>{t[6].targets=[hex(55)];},t=>{t[4].transaction.txnNumber.decimal='8';},t=>{t[5].writeErrors=[11000];},
    t=>{t[7].labels=['TransientTransactionError'];},t=>{t[9].seq=1;},t=>{t[2].collection='foreign';},
    t=>{t[0].pending[0].candidateDigest=hex(100);},t=>{t[8].transaction.txnNumber.decimal='8';},
    t=>{t[2].transaction.lsid.id.hex='cd'.repeat(16);},t=>{t[4].transaction.lsid.id.hex='cd'.repeat(16);},
    t=>{t[8].transaction.lsid.id.hex='cd'.repeat(16);},t=>{delete t[6].transaction.lsid;},
    t=>{for(const i of [2,4,6,8])delete t[i].transaction.txnNumber;},t=>{t[4].transaction.lsid.id.subtype='00';}]) {
    const bad=clone(trace);mutate(bad);assert.throws(()=>verifyFailureTrace(bad,binding,rows));
  }
});

let sdk,adapterSdk,createAdapter,databaseFixture,BSON,domain;
if(plugin&&component) {
  for(const [name,pin]of Object.entries(sourcePins.sources)) {
    const b=readFileSync(join(plugin,name));assert.equal(b.length,pin.bytes,name);assert.equal(hash(b),pin.sha256,name);
  }
  const pins=JSON.parse(readFileSync(new URL('../component-pins.json',import.meta.url)));
  for(const [name,pin]of Object.entries(pins.files)) {const b=readFileSync(join(component,name));assert.equal(b.length,pin.bytes,name);assert.equal(hash(b),pin.sha256,name);}
  const host=mkdtempSync(join(tmpdir(),'atomic-engine-host-sdk-'));
  after(()=>{assert.equal(dirname(resolve(host)),resolve(tmpdir()));assert.ok(host.startsWith(join(tmpdir(),'atomic-engine-host-sdk-')));rmSync(host,{recursive:true});});
  writeFileSync(join(host,'package.json'),'{"type":"module"}\n');
  const prefix='node_modules/@eosrio/hyperion-sdk/';
  for(const name of Object.keys(pins.files).filter(n=>n.startsWith(prefix))) {
    const dest=join(host,name.slice(prefix.length));mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(join(component,name)),{flag:'wx'});
  }
  sdk=await import(pathToFileURL(join(host,'dist/projection-stateful.js')).href);
  adapterSdk=await import(pathToFileURL(join(component,prefix+'dist/projection-stateful.js')).href);assert.notEqual(sdk,adapterSdk);
  ({createMongoDbStatefulAdapter:createAdapter}=await import(pathToFileURL(join(component,'dist/stateful.js')).href));
  ({databaseFixture}=await import(pathToFileURL(join(component,'tests/fixture.mjs')).href));
  ({BSON}=await import(pathToFileURL(join(component,'node_modules/mongodb/lib/index.js')).href));
  domain=await loadDomain(plugin);
}
class Custody {
  values=new Map();
  async load(d,s){const raw=this.values.get(d+s);return raw?JSON.parse(raw):null;}
  async retain(c){const key=c.declarationDigest+c.source.digest,raw=JSON.stringify(c);if(this.values.has(key))assert.equal(this.values.get(key),raw);this.values.set(key,raw);}
}
selected('native BSON transaction identity preserves UUID subtype and exact int64 without session aliasing',()=>{
  const id=new BSON.Binary(Buffer.from('ab'.repeat(16),'hex'),BSON.Binary.SUBTYPE_UUID);
  const command={autocommit:false,lsid:{id},txnNumber:BSON.Long.fromString('9007199254740993')};
  const fixed=captureTransactionIdentity(command,BSON);
  assert.deepEqual(fixed,{lsid:{id:{type:'binary',subtype:'04',hex:'ab'.repeat(16)}},txnNumber:{type:'int64',decimal:'9007199254740993'}});
  id.buffer[0]=0;assert.equal(fixed.lsid.id.hex,'ab'.repeat(16),'Captured session bytes must detach from native mutable buffer');
  const second=captureTransactionIdentity({...command,lsid:{id:new BSON.Binary(Buffer.from('cd'.repeat(16),'hex'),4)}},BSON);
  assert.equal(second.txnNumber.decimal,fixed.txnNumber.decimal);assert.notEqual(stable(second),stable(fixed));
  assert.equal(captureTransactionIdentity({autocommit:true},BSON),null);
  for(const bad of [{...command,lsid:null},{...command,txnNumber:9007199254740993},{...command,txnNumber:'9007199254740993'},
    {...command,txnNumber:BSON.Long.fromString('9223372036854775808')},{...command,txnNumber:BSON.Long.fromString('9',true)},
    {...command,lsid:{id:new BSON.Binary(Buffer.alloc(16),0)}},{...command,lsid:{id:new BSON.Binary(Buffer.alloc(15),4)}},
    {...command,lsid:{id:Buffer.alloc(16)}},{...command,lsid:{...command.lsid,unknown:true}}])assert.throws(()=>captureTransactionIdentity(bad,BSON));
});
async function setup() {
  const m={caseId:'h45_stateful_eeeeeeeeeeee',input:{sha256:hex(10)},bounds:{candidateBytes:262144}};
  const def=domain.definition(m,hex(11),hex(12)),limits=domain.limits(m),configured=await sdk.captureStatefulDeclaration(def,limits),f=databaseFixture();
  const options={client:f.client,databaseName:m.caseId,backendId:m.caseId,collectionPrefix:'offline',declaration:configured,
    receiptRetention:2,rollbackRetentionBlocks:2,rollbackRetentionBytes:1048576,rollbackMaxBlockBytes:262144,operationTimeoutMS:1000,transactionTimeoutMS:2000};
  const adapter=await createAdapter(options),d=await sdk.negotiateStatefulProjection(def,limits,
    {family:sdk.STATEFUL_FAMILY,interfaceVersion:1,supported:sdk.STATEFUL_HOST_CAPABILITIES,limits},adapter.capabilities),custody=new Custody();
  assert.throws(()=>adapterSdk.canonicalStatefulRecord(d,'asset',{}),/Recapture/);
  await adapter.initialize(d);
  const boundDomain={...domain,source:label=>domain.source(label,def)};
  const apply=label=>sdk.executeStatefulBlock(d,boundDomain.source(label),adapter,custody,port=>domain.reduce(port,label),()=>{});
  const host=domain.bridge.createAtomicStatefulHost({sdk,declaration:d,adapter,custody,guard:()=>{},codec:domain.codec});
  const read=async()=>clone((await host.read(await adapter.open(d),domain.query)).value);
  const physical=()=>{
    const find=suffix=>[...f.storage].find(([name])=>name.endsWith(suffix))?.[1];
    return {metadata:clone([...find('_metadata').values()][0]),rows:clone([...find('_r_'+d.digest).values()]),images:clone([...find('_u_'+d.digest).values()])};
  };
  const candidates=async()=>Object.fromEntries(await Promise.all(['A','B','C','D','E'].map(async label=>[label,await custody.load(d.digest,(await sdk.captureStatefulSource(d,boundDomain.source(label))).digest)])));
  const inspect=async stage=>{
    const p=physical(),recovery=await adapter.recovery(d);verifyUndoInventory(p,boundDomain,stage,await candidates(),v=>BSON.serialize(v).length,options,recovery);
    const rows=p.rows.map(r=>({kind:r.kind,key:r.key,value:JSON.parse(r.json)})).sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0);
    assert.equal(stable(rows),stable(domain.rows(stage)));return p;
  };
  return {m,def,d,f,options,adapter,custody,boundDomain,apply,host,read,inspect,candidates};
}
selected('real combined reducers create exact original-derived A rows and coherent response with explicit marker',async()=>{
  const s=await setup();await s.apply('A');const p=await s.inspect('A');assert.equal(p.rows.length,11);assert.equal(p.images.length,11);
  assert.equal((await s.candidates()).A.mutations.filter(m=>m.target.kind==='asset').length,2,'Mint and same-block setdata retain one original before-image');
  assert.equal(stable(await s.read()),stable(domain.response('A')));
  assert.equal(s.def.binding.backendId,s.m.caseId);assert.equal(s.def.binding.generation,s.m.caseId);
  assert.notEqual(s.def.binding.hookArtifact,domain.scenario.atomicDefinition().binding.hookArtifact);
});
selected('B keeps a final real delete after asset and sale mutations; oracle rejects lost or wrong before-images',async()=>{
  const s=await setup();await s.apply('A');await s.apply('B');const candidate=(await s.candidates()).B;
  const last=candidate.mutations.at(-1);assert.equal(last.kind,'delete');assert.equal(stable(last.target),stable({kind:MARKER.kind,key:MARKER.key}));
  for(const kind of ['asset','market-sale'])assert.ok(candidate.mutations.slice(0,-1).some(m=>m.kind==='put'&&m.target.kind===kind));
  const p=await s.inspect('B');assert.equal(p.images.length,14);assert.equal(stable(await s.read()),stable(domain.response('B')));
  const bad=clone(p);bad.images.pop();await assert.rejects(async()=>verifyUndoInventory(bad,s.boundDomain,'B',await s.candidates(),v=>BSON.serialize(v).length,s.options,await s.adapter.recovery(s.d)));
  const marker=p.images.find(i=>i.target.kind===MARKER.kind&&i.blockId===hex(2));assert.equal(marker.before,stable(MARKER.value));
  assert.ok(s.f.native.some(n=>n.command==='delete'),'Actual adapter must execute its native delete call');
});
selected('controlled abort recovers the exact fixed candidate without reducers; fork and retention use original undo oracle',async()=>{
  const s=await setup();await s.apply('A');
  const wrapped={capabilities:s.adapter.capabilities};for(const name of ['open','read','inspect','markIncomplete'])wrapped[name]=s.adapter[name].bind(s.adapter);
  wrapped.apply=c=>{s.f.failTransaction='before';return s.adapter.apply(c);};
  await assert.rejects(sdk.executeStatefulBlock(s.d,s.boundDomain.source('B'),wrapped,s.custody,port=>domain.reduce(port,'B'),()=>{}),e=>e.code==='stateful.apply-unavailable');await s.inspect('A');
  await assert.rejects(s.adapter.open(s.d),e=>e.code==='stateful.incomplete');const saved=(await s.candidates()).B.digest;
  assert.equal((await sdk.executeStatefulBlock(s.d,s.boundDomain.source('B'),s.adapter,s.custody,()=>{throw Error('Recovery reran reducers');},()=>{})).status,'applied');
  assert.equal((await s.candidates()).B.digest,saved);await s.inspect('B');const old=await s.adapter.open(s.d);
  await s.adapter.rollback({declarationDigest:s.d.digest,revision:old.revision,operationId:hex(91),from:old.checkpoint,ancestor:point(1),maxBlocks:1});
  await s.inspect('A');await assert.rejects(s.host.read(old,domain.query),e=>e.code==='stateful.stale-view');
  await s.apply('C');const c=await s.inspect('C');assert.equal(c.images.length,13);assert.equal(stable(await s.read()),stable(domain.response('C')));
  const response=await s.read();assert.equal(response.asset.minted_at_block,'1');assert.equal(response.sale.created_at_block,'1');
  assert.equal(response.asset.collection.name,response.sale.collection.name);
  await s.apply('D');await s.inspect('D');await s.apply('E');const e=await s.inspect('E');assert.equal(e.images.length,0);
  const v=await s.adapter.open(s.d);await assert.rejects(s.adapter.rollback({declarationDigest:s.d.digest,revision:v.revision,operationId:hex(92),from:v.checkpoint,ancestor:point(1),maxBlocks:1}),err=>err.code==='stateful.rollback-unavailable');
  await assert.rejects(s.adapter.open(s.d),err=>err.code==='stateful.incomplete');
});
