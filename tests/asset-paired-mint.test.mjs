import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {parseArgs} from '../harness/atomicassets/postgres/run.mjs';
import {mintSource,captureMint} from '../harness/atomicassets/paired-mint.mjs';
import {compareMintCaptures,differences,runComparison} from '../harness/atomicassets/paired-compare.mjs';
import * as assets from './fixtures/asset-domain-cases.mjs';
import * as scenario from '../harness/stateful/scenario.mjs';
import * as bridge from '../harness/stateful/bridge.mjs';
import * as assetModule from '../dist/atomicassets/internal/lifecycle.js';
import * as formatter from '../dist/atomicassets/asset.js';
import {capturePhysicalMint} from '../harness/stateful/engine/mint-capture.mjs';
const require=createRequire(import.meta.url);
const {loadInputProfile}=require('../harness/atomicassets/lifecycle-input.cjs');
const {MINT_CAPTURE,mintCaptureProfile,validateMintCapture}=require('../harness/atomicassets/mint-capture-profile.cjs');
const profile=()=>mintCaptureProfile(loadInputProfile('portable-safe-image').descriptor);

test('constructed profile preserves complete raw input identity and declares the original/applied chronology',()=>{
  const p=profile();assert.equal(p.originalBlock.blockNum,123456);assert.equal(p.appliedBlock.blockNum,1);
  assert.equal(p.appliedBlock.timeMs,String(Date.parse(p.originalBlock.timestamp+'Z')));
  assert.equal(p.rawInputRewritten,false);assert.equal(p.sourceAuthority,false);assert.equal(p.originalDefaultLifecycleQualified,false);
  assert.deepEqual(p.inputProfile.codecExceptions,{nul:'unresolved',literalBackslash:'unresolved'});
  assert.throws(()=>mintCaptureProfile(loadInputProfile().descriptor),/explicit safe-image/);
  for(const mutate of [p=>p.originalBlock.blockNum=1,p=>p.appliedBlock.blockNum=123456,p=>p.stage='burn',p=>p.inputProfile.inputsNormalized=true]){
    const bad=profile();mutate(bad);assert.throws(()=>validateMintCapture(bad));
  }
});

test('original CLI default is unchanged; the constructed mint requires the separately named safe profile',()=>{
  const base=['--execute','--admission','receipt','--reference-root','original','--evidence-parent','owned'];
  assert.deepEqual(parseArgs(base),{receipt:'receipt',referenceRoot:'original',evidenceParent:'owned'});
  assert.throws(()=>parseArgs([...base,'--capture-profile',MINT_CAPTURE]),/explicit safe-image/);
  const args=[...base,'--input-profile','portable-safe-image','--capture-profile',MINT_CAPTURE];
  assert.equal(parseArgs(args).captureProfile,MINT_CAPTURE);
  assert.throws(()=>parseArgs([...base,'--input-profile','portable-safe-image','--input-profile','portable-safe-image']));
});

test('portable source includes the identical config/mint/update stage and explicit sequence/chronology',()=>{
  const p=profile(),d=scenario.atomicDefinition(),s=mintSource(d,p,scenario,assets);
  assert.deepEqual(s.block,p.appliedBlock);assert.equal(s.previous.blockNum,0);assert.equal(s.inputs.length,5);
  assert.deepEqual(s.inputs.filter(i=>i.kind==='action').map(i=>[i.name,i.sequence,i.transactionId]),[
    ['logsetdata','9007199254741093',p.transactionId],['logmint','9007199254741094',p.transactionId]]);
  assert.deepEqual(s.inputs.find(i=>i.name==='config').data.value,p.configData);
  assert.deepEqual(s.inputs.map(i=>i.order),[0,1,2,3,4]);
  assert.throws(()=>mintSource(d,p,scenario,{...assets,input:{...assets.input,assetId:'1'}}),/same complete named input/);
});

// Deliberately controlled report objects: these controls qualify only the differ/admission logic.
function pair(){
  const p=profile(),value={asset_id:'9007199254740993',name:'image hash',owner:'alice',created_at_block:'1'};
  const original={status:'passed',node:'v26.4.0',identity:{pid:101},originalConnectionEnded:true,
    reference:{commit:'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e'},inputProfile:p.inputProfile,captureProfile:p,
    result:{inputProfile:p.inputProfile,captureProfile:p,scope:{realPostgres:true,originalViewAndHttp:true},stages:[{name:p.stage,
      asset:{asset_id:value.asset_id},mints:[],view:{},collections:[],schemas:[],http:{status:200,headers:{'x-original':'retained'},
        rawText:JSON.stringify({success:true,data:value,query_time:8}),body:{success:true,data:value,query_time:8}}}]}};
  const terminal={pid:101,node:original.node,exitCode:0,signal:null,error:null,reaped:true,pidAbsent:true,groupAbsent:true,
    inputProfile:p.inputProfile,captureProfile:p};
  const portable={kind:'atomicassets-constructed-mint-capture',status:'captured',node:original.node,clientsClosed:true,
    inputProfile:p.inputProfile,captureProfile:p,scope:{actualMongo:true,fullParity:false,sourceAuthority:false},
    coherentRead:{view:{checkpoint:{blockNum:1,blockId:p.appliedBlock.blockId}},value:structuredClone(value)},
    publicHTTP:{status:'unimplemented',response:null}};
  return {original,terminal,portable};
}
test('matched coherent values retain raw HTTP and all35 API paths without inventing public parity',()=>{
  const p=pair(),r=compareMintCaptures(p.original,p.terminal,p.portable);
  assert.equal(r.comparison.coherentValue,'matched');assert.deepEqual(r.comparison.originalHTTP,p.original.result.stages[0].http);
  assert.equal(r.matrix.length,35);assert.ok(r.matrix.every(e=>e.publicAPI==='unimplemented'));
  assert.equal(r.summary.fullParity,false);assert.equal(r.summary.parityPercentage,null);assert.equal(r.summary.publicHTTP,'unimplemented');
  assert.deepEqual(r.summary.normalizedResponseFields,[]);
  const selected=r.matrix.find(e=>e.path==='/atomicassets/v1/assets/:asset_id');
  assert.deepEqual(selected.selectedCases.slice(1).map(c=>c.status),['blocked','blocked']);
  assert.equal(compareMintCaptures(p.original,p.terminal,null).comparison.coherentValue,'not-run');
});
test('NUL, literal escapes, missing/null, integer type and ordering differences are retained exactly',()=>{
  for(const [left,right]of [['image\0hash','image hash'],['image\\u0000hash','image hash'],['9007199254740993',9007199254740992],
    [{a:null},{}],[[1,2],[2,1]]])assert.ok(differences(left,right).length);
  const p=pair();p.portable.coherentRead.value.owner=null;
  assert.equal(compareMintCaptures(p.original,p.terminal,p.portable).comparison.coherentValue,'different');
  p.terminal.reaped=false;assert.throws(()=>compareMintCaptures(p.original,p.terminal,p.portable));
  const q=pair();q.portable.captureProfile.originalBlock.blockNum=1;assert.throws(()=>compareMintCaptures(q.original,q.terminal,q.portable));
});
test('comparison CLI binds raw parent report bytes and never overwrites an earlier result',()=>{
  const root=mkdtempSync(join(tmpdir(),'aa-paired-mint-'));
  try{
    const p=pair(),raw=Buffer.from(JSON.stringify(p.original));
    p.terminal.reportBytes=raw.length;p.terminal.reportSha256=createHash('sha256').update(raw).digest('hex');
    writeFileSync(join(root,'report.json'),raw);writeFileSync(join(root,'terminal.json'),JSON.stringify(p.terminal));
    const output=join(root,'comparison.json'),r=runComparison({originalDirectory:root,output});
    assert.equal(r.comparison.coherentValue,'not-run');assert.equal(r.summary.fullParity,false);
    assert.throws(()=>runComparison({originalDirectory:root,output}));
    writeFileSync(join(root,'report.json'),Buffer.concat([raw,Buffer.from(' ')]));
    assert.throws(()=>runComparison({originalDirectory:root,output:join(root,'drift.json')}),/byte binding differs/);
  }finally{assert.ok(root.startsWith(join(tmpdir(),'aa-paired-mint-')));rmSync(root,{recursive:true});}
});
test('actual child refuses a forged mint chronology before reference inspection or SQL',()=>{
  const p=profile();p.appliedBlock.blockNum=123456;
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../harness/atomicassets/postgres/child.cjs',import.meta.url))],{
    input:JSON.stringify({inputProfile:p.inputProfile,captureProfile:p,parentPid:process.pid,receipt:{},referenceRoot:'must-not-be-read'}),
    stdio:['pipe','pipe','pipe','pipe'],windowsHide:true,timeout:10000,maxBuffer:2*1024**2});
  assert.equal(result.status,1);assert.equal(result.error,undefined);assert.equal(result.signal,null);
  const report=JSON.parse(result.output[3]);assert.match(report.error.message,/chronology binding differs/);
  assert.equal(report.reference,undefined);assert.equal(report.originalConnectionEnded,false);
});
test('physical mint entry refuses absent explicit opt-in before any manifest/client access',()=>{
  const env={...process.env};delete env.HYPERION_AA_MINT_CAPTURE;
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../harness/stateful/engine/mint-capture.mjs',import.meta.url)),
    '--execute','must-not-be-read','0'.repeat(64)],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(result.status,1);assert.equal(result.error,undefined);assert.match(result.stderr,/Explicit HYPERION_AA_MINT_CAPTURE=1/);
});

const component=process.env.ATOMIC_STATEFUL_COMPONENT_ROOT;
(component?test:test.skip)('actual SDK/adapter with controlled Mongo transport executes and coherently reads the new same-input mint profile',async()=>{
  const pins=JSON.parse(readFileSync(new URL('../harness/stateful/component-pins.json',import.meta.url)));
  for(const [name,p]of Object.entries(pins.files)){
    const raw=readFileSync(join(component,name));assert.equal(raw.length,p.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),p.sha256);
  }
  const sdk=await import(pathToFileURL(join(component,'node_modules/@eosrio/hyperion-sdk/dist/projection-stateful.js')));
  const {createMongoDbStatefulAdapter}=await import(pathToFileURL(join(component,'dist/stateful.js')));
  const {databaseFixture}=await import(pathToFileURL(join(component,'tests/fixture.mjs'))),f=databaseFixture();
  const d=scenario.atomicDefinition(),limits=scenario.atomicLimits,configured=await sdk.captureStatefulDeclaration(d,limits);
  const adapter=await createMongoDbStatefulAdapter({client:f.client,databaseName:'atomic_paired_control',backendId:d.binding.backendId,
    collectionPrefix:'paired',declaration:configured,receiptRetention:8,rollbackRetentionBlocks:8,rollbackRetentionBytes:4194304,
    rollbackMaxBlockBytes:1048576,operationTimeoutMS:1000,transactionTimeoutMS:2000});
  const declaration=await sdk.negotiateStatefulProjection(d,limits,{family:sdk.STATEFUL_FAMILY,interfaceVersion:1,supported:sdk.STATEFUL_HOST_CAPABILITIES,limits},adapter.capabilities);
  await adapter.initialize(declaration);const bytes=new Map();
  const custody={async load(d,s){return bytes.has(d+s)?JSON.parse(bytes.get(d+s)):null;},async retain(c){const key=c.declarationDigest+c.source.digest;
    assert.ok(!bytes.has(key));bytes.set(key,JSON.stringify(c));}};
  const result=await captureMint({sdk,declaration,adapter,custody,guard:()=>{},bridge,scenario,assets,assetModule,formatter,profile:profile()});
  assert.equal(result.application.status,'applied');assert.equal(result.coherentRead.view.checkpoint.blockNum,1);
  assert.equal(result.coherentRead.value.asset_id,'9007199254740993');assert.equal(result.coherentRead.value.minted_at_block,'1');
  assert.equal(result.coherentRead.value.collection.created_at_block,'1');assert.equal(result.coherentRead.value.schema.created_at_block,'1');
  assert.equal(result.coherentRead.value.mutable_data.name,'replacement mutable');assert.equal(bytes.size,1);
  const expected=structuredClone(assets.fixture.stages[0].formatted);
  for(const name of ['minted_at_block','updated_at_block','transferred_at_block'])if(expected[name]!==null)expected[name]='1';
  expected.collection.created_at_block='1';expected.schema.created_at_block='1';
  assert.deepEqual(result.coherentRead.value,expected,'Pinned original-derived response under the explicitly declared engineering block profile');
  const rows=[...f.storage].filter(([name])=>name.includes('_r_')).flatMap(([,values])=>[...values.values()]);
  assert.deepEqual(rows.map(r=>r.kind).sort(),['asset','collection','config','mint','schema']);
  const physical=await capturePhysicalMint(f.client,{databaseName:'atomic_paired_control',collectionPrefix:'paired',
    bounds:{operationMS:1000,transactionMS:2000,maxRecords:8}},declaration,()=>{});
  assert.equal(physical.metadata.checkpoint.blockNum,1);assert.equal(physical.rows.length,5);assert.equal(physical.undo.length,5);
});
