/** Root-operated opt-in physical capture. Creates no service and performs no cleanup. */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {preflight,assertOwner,hash,stable,boundedJson,freshJson,processIdentity} from './guard.mjs';

class Custody {
  constructor(root,bound,sdk,declaration){Object.assign(this,{root,bound,sdk,declaration});}
  path(d,s){assert.match(d+s,/^[a-f0-9]{128}$/);return join(this.root,'mint-candidate-'+d+'-'+s+'.json');}
  async load(d,s){const path=this.path(d,s);return existsSync(path)?this.sdk.captureStatefulCandidate(this.declaration,boundedJson(path,this.bound)):null;}
  async retain(value){const c=await this.sdk.captureStatefulCandidate(this.declaration,value),path=this.path(c.declarationDigest,c.source.digest);
    if(existsSync(path)){assert.equal((await this.load(c.declarationDigest,c.source.digest)).digest,c.digest);return;}
    freshJson(path,c,this.bound);
  }
}
async function identity(client,m){
  const admin=client.db('admin'),hello=await admin.command({hello:1});
  assert.equal(hello.setName,m.server.replicaSet);assert.equal(hello.isWritablePrimary,true);
  assert.deepEqual(hello.hosts,[m.server.member]);assert.equal(hello.me,m.server.member);
  assert.equal((await admin.command({buildInfo:1})).version,m.server.version);
  const {config}=await admin.command({replSetGetConfig:1});
  assert.equal(config._id,m.server.replicaSet);assert.equal(config.members.length,1);assert.equal(config.members[0].host,m.server.member);
  assert.equal(config.settings.replicaSetId.toHexString(),m.server.replicaSetId);
}
/** Independent client and actual native snapshot, fenced by linearizable metadata observations. */
export async function capturePhysicalMint(client,m,d,guard){
  guard();const db=client.db(m.databaseName),prefix=m.collectionPrefix+'_stateful';
  const metadata=db.collection(prefix+'_metadata'),rows=db.collection(prefix+'_r_'+d.digest),undo=db.collection(prefix+'_u_'+d.digest);
  const id=hash(JSON.stringify([d.definition.binding.chainId,d.definition.binding.backendId,d.definition.id]));
  const options={readPreference:'primary',readConcern:{level:'linearizable'},maxTimeMS:m.bounds.operationMS,timeoutMS:m.bounds.operationMS};
  const before=await metadata.findOne({_id:id},options);guard();assert.ok(before);
  const session=client.startSession({causalConsistency:false});let result;
  try{result=await session.withTransaction(async()=>{
    const meta=await metadata.findOne({_id:id},{session});assert.equal(meta.etag,before.etag);
    const records=await rows.find({},{session}).sort({_id:1}).limit(m.bounds.maxRecords+1).toArray();
    const images=await undo.find({},{session}).sort({_id:1}).limit(m.bounds.maxRecords+1).toArray();
    assert.ok(records.length<=m.bounds.maxRecords&&images.length<=m.bounds.maxRecords);
    return {metadata:meta,rows:records,undo:images};
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true},readPreference:'primary',timeoutMS:m.bounds.transactionMS,maxCommitTimeMS:m.bounds.operationMS});}
  finally{await session.endSession();}
  const after=await metadata.findOne({_id:id},options);guard();assert.equal(result.metadata.etag,after.etag);
  assert.equal(result.metadata.declarationDigest,d.digest);return result;
}

export async function runMintCapture(manifestPath,manifestSha256){
  assert.equal(process.env.HYPERION_AA_MINT_CAPTURE,'1','Explicit HYPERION_AA_MINT_CAPTURE=1 required before preflight');
  const start=Date.now(),{manifest:m,input:plan}=preflight(manifestPath,manifestSha256);
  assert.deepEqual(Object.keys(plan).sort(),['captureProfile','kind','pluginRoot','schemaVersion']);
  assert.equal(plan.schemaVersion,1);assert.equal(plan.kind,'atomicassets-constructed-mint-capture');assert.equal(plan.pluginRoot,'atomic-plugin');
  assert.equal(fileURLToPath(import.meta.url),join(m.modules.root,m.modules.entries.runner));
  assert.equal(fileURLToPath(new URL('./guard.mjs',import.meta.url)),join(m.modules.root,m.modules.entries.guard));
  const guard=()=>{assert.ok(Date.now()-start<m.bounds.phaseMS,'Original bounded phase deadline exceeded');assertOwner(m);};
  const load=path=>import(pathToFileURL(join(m.modules.root,path)).href),plugin=path=>load(plan.pluginRoot+'/'+path);
  const profileModule=await plugin('harness/atomicassets/mint-capture-profile.cjs');
  const captureProfile=profileModule.default.validateMintCapture(plan.captureProfile);guard();
  const [sdk,adapterSdk,adapterModule,driver,bridge,scenario,assets,assetModule,formatter,core]=await Promise.all([
    load(m.modules.entries.sdk),load(m.modules.entries.adapterSdk),load(m.modules.entries.adapter),load(m.modules.entries.driver),
    plugin('harness/stateful/bridge.mjs'),plugin('harness/stateful/scenario.mjs'),plugin('tests/fixtures/asset-domain-cases.mjs'),
    plugin('dist/atomicassets/internal/lifecycle.js'),plugin('dist/atomicassets/asset.js'),plugin('harness/atomicassets/paired-mint.mjs')]);
  guard();assert.notEqual(sdk,adapterSdk);
  const definition=scenario.atomicDefinition();definition.id='atomicassets-paired-mint';
  Object.assign(definition.binding,{backendId:m.caseId,generation:m.caseId,mappingRevision:m.input.sha256,
    hookArtifact:hash(stable(m.modules.files)),hookRevision:m.modules.files.find(f=>f.path===m.modules.entries.guard).sha256});
  const limits={...scenario.atomicLimits,candidateBytes:m.bounds.candidateBytes,
    envelope:{...scenario.atomicLimits.envelope,stringBytes:m.bounds.candidateBytes,recordBytes:m.bounds.candidateBytes}};
  const configured=await sdk.captureStatefulDeclaration(definition,limits);guard();
  const make=role=>new driver.MongoClient(m.uri,{appName:m.caseId+'-'+role,directConnection:true,retryWrites:false,maxPoolSize:2,
    serverSelectionTimeoutMS:m.bounds.operationMS,connectTimeoutMS:m.bounds.operationMS,timeoutMS:m.bounds.operationMS});
  const writer=make('mint-writer'),oracle=make('mint-oracle');let report,primary;
  const file=name=>join(m.caseRoot,name+'.json');
  freshJson(file('mint.intent'),{manifestSha256,captureProfile,process:processIdentity(process.pid)},m.bounds.outputBytes);
  try{
    await writer.connect();guard();await identity(writer,m);guard();await oracle.connect();guard();await identity(oracle,m);guard();
    assert.equal((await writer.db(m.databaseName).listCollections({},{nameOnly:true}).toArray()).length,0,'Mint capture requires a fresh empty owned database');guard();
    const adapter=await adapterModule.createMongoDbStatefulAdapter({client:writer,databaseName:m.databaseName,backendId:m.caseId,
      collectionPrefix:m.collectionPrefix,declaration:configured,...m.policy,operationTimeoutMS:m.bounds.operationMS,transactionTimeoutMS:m.bounds.transactionMS});
    const declaration=await sdk.negotiateStatefulProjection(definition,limits,{family:sdk.STATEFUL_FAMILY,interfaceVersion:1,
      supported:sdk.STATEFUL_HOST_CAPABILITIES,limits},adapter.capabilities);guard();
    await adapter.initialize(declaration);guard();
    const custody=new Custody(m.caseRoot,m.bounds.candidateBytes,sdk,declaration);
    const capture=await core.captureMint({sdk,declaration,adapter,custody,guard,bridge,scenario,assets,assetModule,formatter,profile:captureProfile});
    const source=freshJson(file('mint.source'),capture.source,m.bounds.candidateBytes),observed=await capturePhysicalMint(oracle,m,declaration,guard);
    assert.deepEqual(observed.metadata.checkpoint,capture.application.progress.checkpoint);
    assert.equal(observed.metadata.revision,capture.coherentRead.view.revision);
    assert.equal(observed.metadata.pending,null);assert.equal(observed.metadata.gap,null);
    assert.deepEqual(observed.rows.map(r=>r.kind).sort(),['asset','collection','config','mint','schema']);
    assert.equal(observed.undo.length,5);assert.ok(observed.undo.every(r=>r.before===null),'Fresh mint must retain original absence before-images');
    assert.equal(JSON.parse(observed.rows.find(r=>r.kind==='asset').json).asset_id,assets.input.assetId);
    const receipt=observed.metadata.receipts.find(r=>r.blockId===captureProfile.appliedBlock.blockId);
    assert.ok(receipt);assert.equal(receipt.sourceDigest,capture.source.digest);assert.equal(receipt.candidateDigest,capture.candidateDigest);
    const snapshot=freshJson(file('mint.physical'),driver.BSON.EJSON.serialize(observed,{relaxed:false}),m.bounds.outputBytes);
    report={schemaVersion:1,kind:'atomicassets-constructed-mint-capture',status:'captured',node:process.version,manifestSha256,
      process:processIdentity(process.pid),inputProfile:capture.inputProfile,captureProfile,coherentRead:capture.coherentRead,
      source,candidateDigest:capture.candidateDigest,physical:snapshot,assembly:{adapterHead:m.adapterHead,sdkHead:m.sdkHead,
        modulesSha256:hash(stable(m.modules.files)),declarationDigest:declaration.digest},
      publicHTTP:{status:'unimplemented',response:null},scope:{actualMongo:true,constructedInputs:true,sourceAuthority:false,
        originalDefaultLifecycleQualified:false,physicalCleanupVerified:false,fullParity:false}};
  }catch(error){primary=error;}finally{
    const closed=await Promise.allSettled([writer.close(),oracle.close()]);
    const errors=closed.filter(r=>r.status==='rejected').map(r=>r.reason);
    if(errors.length)throw new AggregateError([...(primary?[primary]:[]),...errors],'Mongo clients did not close; preserve failed capture');
  }
  if(primary)throw primary;
  guard();report.clientsClosed=true;freshJson(file('mint.capture'),report,m.bounds.outputBytes);return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{assert.equal(process.argv.length,5);assert.equal(process.argv[2],'--execute');
    console.log(JSON.stringify(await runMintCapture(process.argv[3],process.argv[4])));
  }catch(error){console.error(error);process.exitCode=1;}
}
