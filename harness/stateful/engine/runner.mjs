import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {PHASES, hash, hex, point, stable, priorPhase, preflight, assertOwner, boundedJson, freshJson, processIdentity, validatePrior} from './guard.mjs';

const failureCode = e => typeof e?.code === 'string' && /^stateful\.[a-z-]{1,48}$/.test(e.code) ? e.code : 'fixture.assertion-or-native-failure';
const same = (a,b) => assert.equal(stable(a),stable(b));
const rejects = (operation,code) => assert.rejects(operation,e => e.code === code);
import {BRANCHES as UNDO_BRANCHES,FLOORS as UNDO_FLOORS,MARKER,validatePlan,validateDomainPins,loadDomain} from './domain.mjs';

/** Qualification-local durable custody, retained before apply; never a production source journal. */
class Custody {
    constructor(root,bound,sdk,declaration) {Object.assign(this,{root,bound,sdk,declaration});}
    path(d,s) {assert.match(d+s,/^[a-f0-9]{128}$/); return join(this.root,'candidate-'+d+'-'+s+'.json');}
    async load(d,s) {
        const p=this.path(d,s); if(!existsSync(p))return null;
        const value=boundedJson(p,this.bound); const fixed=await this.sdk.captureStatefulCandidate(this.declaration,value);
        assert.equal(fixed.declarationDigest,d);assert.equal(fixed.source.digest,s);return fixed;
    }
    async retain(value) {
        const fixed=await this.sdk.captureStatefulCandidate(this.declaration,value),p=this.path(fixed.declarationDigest,fixed.source.digest);
        if(existsSync(p)){assert.equal((await this.load(fixed.declarationDigest,fixed.source.digest)).digest,fixed.digest);return;}
        freshJson(p,fixed,this.bound);
    }
}


async function identity(client,m) {
    const admin=client.db('admin'),hello=await admin.command({hello:1});
    assert.equal(hello.setName,m.server.replicaSet);assert.equal(hello.isWritablePrimary,true);
    same(hello.hosts,[m.server.member]);assert.equal(hello.me,m.server.member);
    const build=await admin.command({buildInfo:1});assert.equal(build.version,m.server.version);
    const reply=await admin.command({replSetGetConfig:1}),config=reply.config;
    assert.equal(config._id,m.server.replicaSet);assert.equal(config.members.length,1);assert.equal(config.members[0].host,m.server.member);
    assert.equal(config.settings.replicaSetId.toHexString(),m.server.replicaSetId);
}

/** Separate primary client: one snapshot, with linearizable metadata checks around it. */
async function physical(client,m,d,guard) {
    guard();const db=client.db(m.databaseName),prefix=m.collectionPrefix+'_stateful';
    const meta=db.collection(prefix+'_metadata'),rows=db.collection(prefix+'_r_'+d.digest),images=db.collection(prefix+'_u_'+d.digest);
    const id=hash(JSON.stringify([d.definition.binding.chainId,d.definition.binding.backendId,d.definition.id]));
    const options={readPreference:'primary',readConcern:{level:'linearizable'},maxTimeMS:m.bounds.operationMS,timeoutMS:m.bounds.operationMS};
    const before=await meta.findOne({_id:id},options);guard();assert.ok(before);
    const session=client.startSession({causalConsistency:false});let result;
    try {result=await session.withTransaction(async()=>{
        const metadata=await meta.findOne({_id:id},{session});assert.equal(metadata.etag,before.etag);
        const values=await rows.find({},{session}).sort({_id:1}).limit(m.bounds.maxRecords+1).toArray();
        const undo=await images.find({},{session}).sort({_id:1}).limit(m.bounds.maxRecords+1).toArray();
        assert.ok(values.length<=m.bounds.maxRecords&&undo.length<=m.bounds.maxRecords);
        return {metadata,rows:values,images:undo};
    },{readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true},readPreference:'primary',timeoutMS:m.bounds.transactionMS,maxCommitTimeMS:m.bounds.operationMS});}
    finally {await session.endSession();}
    const after=await meta.findOne({_id:id},options);guard();assert.equal(result.metadata.etag,after.etag);
    assert.equal(result.metadata.declaration,JSON.stringify(d));assert.equal(result.metadata.declarationDigest,d.digest);
    for(const row of result.rows){assert.equal(row._id,hash(JSON.stringify([row.kind,row.key])));assert.equal(row.json,stable(JSON.parse(row.json)));}
    for(const image of result.images){assert.equal(image._id,hash(image.blockId+hash(JSON.stringify([image.target.kind,image.target.key]))));}
    return result;
}
const businessDigest=p=>hash(stable({rows:p.rows,images:p.images,checkpoint:p.metadata.checkpoint,receipts:p.metadata.receipts,undo:p.metadata.undo,
    revision:p.metadata.revision,floor:p.metadata.floor,floorReceipt:p.metadata.floorReceipt}));
function values(p) {return p.rows.map(r=>({kind:r.kind,key:r.key,value:JSON.parse(r.json)})).sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0);}
function verifyRows(p,domain,stage) {same(values(p),domain.rows(stage));}

function assertReceipt(p,candidate) {
    const r=p.metadata.receipts.find(r=>r.blockId===candidate.source.source.block.blockId);assert.ok(r);
    assert.equal(r.sourceDigest,candidate.source.digest);assert.equal(r.candidateDigest,candidate.digest);
}

/** Detached typed identity from this pinned driver's native command; never Number coercion. */
export function captureTransactionIdentity(command,BSON) {
    if(command.autocommit!==false)return null;
    assert.deepEqual(Object.keys(command.lsid??{}),['id'],'Complete native session identity required');
    const id=command.lsid.id,number=command.txnNumber;
    assert.ok(id instanceof BSON.Binary&&id.sub_type===BSON.Binary.SUBTYPE_UUID,'Native UUID session subtype required');
    const bytes=Buffer.from(id.value());assert.equal(bytes.length,16);
    assert.ok(number instanceof BSON.Long&&number.unsigned===false,'Exact signed BSON int64 transaction number required');
    const decimal=number.toString();assert.match(decimal,/^(0|[1-9][0-9]*)$/);assert.ok(BigInt(decimal)<=9223372036854775807n);
    return Object.freeze({lsid:Object.freeze({id:Object.freeze({type:'binary',subtype:'04',hex:bytes.toString('hex')})}),
        txnNumber:Object.freeze({type:'int64',decimal})});
}
function checkedTransactionIdentity(value) {
    assert.deepEqual(Object.keys(value??{}).sort(),['lsid','txnNumber']);
    assert.deepEqual(Object.keys(value.lsid??{}),['id']);
    assert.deepEqual(Object.keys(value.lsid.id??{}).sort(),['hex','subtype','type']);
    assert.equal(value.lsid.id.type,'binary');assert.equal(value.lsid.id.subtype,'04');assert.match(value.lsid.id.hex,/^[0-9a-f]{32}$/);
    assert.deepEqual(Object.keys(value.txnNumber??{}).sort(),['decimal','type']);assert.equal(value.txnNumber.type,'int64');
    assert.match(value.txnNumber.decimal,/^(0|[1-9][0-9]*)$/);assert.ok(BigInt(value.txnNumber.decimal)<=9223372036854775807n);
    return stable(value);
}

/** Observation verifier only: constructed controls cannot establish that MongoDB executed it. */
export function verifyFailureTrace(trace,{rowCollection,metadataCollection,metadataId,candidateDigest,sourceDigest},domainRows) {
    const failed=trace.find(e=>e.event==='commandFailed'&&e.command==='delete'&&e.code===2);assert.ok(failed,'Native marker failpoint must fire');
    assert.ok(!failed.labels.includes('TransientTransactionError'));
    const started=trace.find(e=>e.requestId===failed.requestId&&e.event==='commandStarted');assert.equal(started.transactional,true);
    const transaction=checkedTransactionIdentity(started.transaction);
    const sameTransaction=s=>s.transactional&&checkedTransactionIdentity(s.transaction)===transaction;
    assert.ok(trace.some(e=>e.seq<started.seq&&e.command==='update'&&e.event==='commandSucceeded'&&e.writeErrors.length===0&&
        trace.some(s=>s.requestId===e.requestId&&s.event==='commandStarted'&&!s.transactional&&s.collection===metadataCollection&&
            s.targets.includes(metadataId)&&s.pending.some(p=>p?.candidateDigest===candidateDigest&&p.sourceDigest===sourceDigest))),
        'Exact durable pending-candidate intent must precede transaction');
    const markerId=hash(JSON.stringify([MARKER.kind,MARKER.key]));
    assert.equal(started.collection,rowCollection);same(started.targets,[markerId]);
    for(const row of domainRows.filter(r=>['asset','market-sale'].includes(r.kind))) {
        const target=hash(JSON.stringify([row.kind,row.key]));
        assert.ok(trace.some(e=>e.seq<started.seq&&e.event==='commandSucceeded'&&e.command==='update'&&e.writeErrors.length===0&&
            trace.some(s=>s.requestId===e.requestId&&s.event==='commandStarted'&&sameTransaction(s)&&
                s.collection===rowCollection&&s.targets.includes(target))),'Actual domain replacement must succeed in the failed transaction before marker DELETE');
    }
    assert.ok(trace.some(e=>e.command==='abortTransaction'&&e.event==='commandSucceeded'&&e.seq>failed.seq&&
        trace.some(s=>s.requestId===e.requestId&&s.event==='commandStarted'&&sameTransaction(s))));
    return failed;
}

/** Independent plan-derived inventory, never an observed post-write snapshot as its own oracle. */
export function verifyUndoInventory(p,domain,stage,candidates,bsonSize,policy,recovery) {
    assert.ok(Object.hasOwn(UNDO_BRANCHES,stage));
    const labels=UNDO_BRANCHES[stage],floorLabel=UNDO_FLOORS[stage];
    const UNDO_INPUTS=Object.fromEntries(['A','B','C','D','E'].map(label=>[label,domain.source(label)]));
    const checkpoint=label=>{const {blockNum,blockId}=UNDO_INPUTS[label].block;return {blockNum,blockId};};
    const ordered=images=>[...images].sort((a,b)=>a._id<b._id?-1:a._id>b._id?1:0);
    const image=(label,kind,key,before)=>({_id:hash(UNDO_INPUTS[label].block.blockId+hash(JSON.stringify([kind,key]))),
        blockId:UNDO_INPUTS[label].block.blockId,
        // The reviewed SDK captures target object keys in canonical lexical order.
        target:{key,kind},before:before===null?null:stable(before)});
    const priorRows={A:[],B:domain.rows('A'),C:domain.rows('A'),D:domain.rows('C'),E:domain.rows('C')};
    const touched={A:domain.rows('A').map(r=>({kind:r.kind,key:r.key})),
        B:[...domain.rows('B').filter(r=>['asset','market-sale'].includes(r.kind)).map(r=>({kind:r.kind,key:r.key})),{kind:MARKER.kind,key:MARKER.key}],
        C:domain.rows('C').filter(r=>['schema','collection'].includes(r.kind)).map(r=>({kind:r.kind,key:r.key})),D:[],E:[]};
    const originals=Object.fromEntries(Object.entries(touched).map(([label,targets])=>[label,targets.map(t=>{
        const old=priorRows[label].find(r=>r.kind===t.kind&&r.key===t.key);return image(label,t.kind,t.key,old?.value??null);
    })]));
    const fixed=label=>{const candidate=candidates[label];assert.ok(candidate);
        const block=candidate.source.source.block,expected=UNDO_INPUTS[label].block;
        same({blockNum:block.blockNum,blockId:block.blockId,previousBlockId:block.previousBlockId},
            {blockNum:expected.blockNum,blockId:expected.blockId,previousBlockId:expected.previousBlockId});
        assert.match(candidate.digest,/^[a-f0-9]{64}$/);assert.match(candidate.source.digest,/^[a-f0-9]{64}$/);return candidate;};
    const receipt=label=>({...checkpoint(label),sourceDigest:fixed(label).source.digest,candidateDigest:fixed(label).digest});
    const undo=labels.map(label=>{const images=ordered(originals[label]),{blockNum,blockId,previousBlockId}=UNDO_INPUTS[label].block;
        return {block:{blockNum,blockId,previousBlockId},digest:fixed(label).digest,sourceDigest:fixed(label).source.digest,
            count:images.length,imageBytes:images.reduce((bytes,value)=>bytes+bsonSize(value),0),imagesHash:hash(JSON.stringify(images))};});
    const images=ordered(labels.flatMap(label=>originals[label])),floor=floorLabel?checkpoint(floorLabel):point(0);
    // Full equality rejects extra/orphan records and unknown fields as well as missing images.
    assert.deepEqual(ordered(p.images),images);assert.deepEqual(p.metadata.undo,undo);
    assert.deepEqual(p.metadata.floor,floor);assert.deepEqual(p.metadata.floorReceipt,floorLabel?receipt(floorLabel):null);
    assert.deepEqual(p.metadata.checkpoint,checkpoint(stage));assert.deepEqual(p.metadata.receipts,labels.map(receipt));
    const retainedBytes=bsonSize({undo})-bsonSize({undo:[]})+undo.reduce((bytes,u)=>bytes+u.imageBytes,0);
    assert.ok(undo.length<=policy.rollbackRetentionBlocks&&retainedBytes<=policy.rollbackRetentionBytes);
    for(const u of undo)assert.ok(bsonSize({undo:[u]})-bsonSize({undo:[]})+u.imageBytes<=policy.rollbackMaxBlockBytes);
    assert.equal(recovery.view.revision,p.metadata.revision);same(recovery.view.checkpoint,p.metadata.checkpoint);
    // Public SDK recovery captures use detached null-prototype JSON objects.
    same(recovery.coverage,{floor,retainedBlocks:undo.length,retainedBytes,
        maxBlocks:policy.rollbackRetentionBlocks,maxBytes:policy.rollbackRetentionBytes});
}

export async function runPhase(phase,manifestPath,manifestSha256) {
    assert.ok(PHASES.includes(phase));const start=Date.now(),{manifest:m,input:plan}=preflight(manifestPath,manifestSha256);
    validatePlan(plan);
    const pins=boundedJson(join(m.modules.root,'qualification/source-pins.json'),65536);
    const build=boundedJson(join(m.modules.root,plan.buildPath),65536);
    validateDomainPins(m,plan,pins,build);
    const originalDomain=await loadDomain(join(m.modules.root,plan.pluginRoot));
    assert.equal(fileURLToPath(import.meta.url),join(m.modules.root,m.modules.entries.runner));
    assert.equal(fileURLToPath(new URL('./guard.mjs',import.meta.url)),join(m.modules.root,m.modules.entries.guard));
    let traceOverflow=false,traceIdentityInvalid=false;
    const guard=()=>{assert.ok(!traceOverflow,'Command observation bound exceeded');assert.ok(!traceIdentityInvalid,'Incomplete native transaction observation');assert.ok(Date.now()-start<m.bounds.phaseMS,'Phase deadline exceeded; no retry/kill/cleanup authorized');assertOwner(m);};
    const file=n=>join(m.caseRoot,n+'.json');
    let prior=null;if(priorPhase(phase))prior=validatePrior(boundedJson(file(priorPhase(phase)),m.bounds.outputBytes),phase,manifestSha256);
    freshJson(file(phase+'.intent'),{phase,manifestSha256,process:processIdentity(process.pid)},m.bounds.outputBytes);
    const load=entry=>import(pathToFileURL(join(m.modules.root,m.modules.entries[entry])).href);
    const sdk=await load('sdk'),adapterSdk=await load('adapterSdk'),{createMongoDbStatefulAdapter}=await load('adapter'),{MongoClient,BSON}=await load('driver');guard();
    assert.notEqual(sdk,adapterSdk,'Distinct SDK module instances are required');
    const requested=originalDomain.limits(m),hookArtifact=hash(stable(m.modules.files.filter(f=>f.path.startsWith('qualification/')||f.path.startsWith(plan.pluginRoot+'/')))),
        definition=originalDomain.definition(m,hookArtifact,m.modules.files.find(f=>f.path===m.modules.entries.guard).sha256),configured=await sdk.captureStatefulDeclaration(definition,requested);
    const domain={...originalDomain,source:label=>originalDomain.source(label,definition)};
    const UNDO_INPUTS=Object.fromEntries(['A','B','C','D','E'].map(label=>[label,domain.source(label)]));
    const source=(n,id=n)=>domain.source(id===99?'conflict-B':n===1?'A':n===3?'D':n===4?'E':id===3?'C':'B');
    const trace=[];let seq=0;
    const make=role=>new MongoClient(m.uri,{appName:m.caseId+'-'+role,directConnection:true,retryWrites:false,maxPoolSize:2,
        monitorCommands:role==='writer',serverSelectionTimeoutMS:m.bounds.operationMS,connectTimeoutMS:m.bounds.operationMS,timeoutMS:m.bounds.operationMS});
    const writer=make('writer'),oracle=make('oracle'),clients=[writer,oracle];
    for(const event of ['commandStarted','commandSucceeded','commandFailed'])writer.on(event,e=>{
        if(!['insert','update','delete','commitTransaction','abortTransaction'].includes(e.commandName))return;
        if(trace.length>=128){traceOverflow=true;return;}
        let transaction=null;if(event==='commandStarted')try {transaction=captureTransactionIdentity(e.command,BSON);}catch {traceIdentityInvalid=true;}
        trace.push({seq:++seq,event,command:e.commandName,requestId:e.requestId,
            ...(event==='commandStarted'?{transactional:e.command.autocommit===false,transaction,
                collection:e.command[e.commandName]??null,targets:(e.command.updates??e.command.deletes??[]).map(v=>v.q?._id??null),
                pending:(e.command.updates??[]).map(v=>v.u?.$set?.pending??null)}:{}),
            ...(event==='commandFailed'?{code:e.failure?.code??null,labels:e.failure?.errorLabels??[]}:{}),
            ...(event==='commandSucceeded'?{writeErrors:(e.reply?.writeErrors??[]).map(x=>x.code)}:{})});
    });
    let failpointOwned=false,failpointCount=null;const failData={failCommands:['delete'],errorCode:2,errorLabels:[],appName:m.caseId+'-writer'};
    const failStatus=async()=>{const reply=await oracle.db('admin').command({getParameter:1,'failpoint.failCommand':1});return reply['failpoint.failCommand'];};
    const off=async()=>{assertOwner(m);const current=await failStatus();same(current.data,failData);
        const result=await oracle.db('admin').command({configureFailPoint:'failCommand',mode:'off'});failpointOwned=false;assert.ok(result.count>=failpointCount+1);assert.equal((await failStatus()).mode,0);return result.count;};
    let receipt;
    try {
        await writer.connect();guard();await identity(writer,m);await oracle.connect();guard();await identity(oracle,m);
        const adapter=await createMongoDbStatefulAdapter({client:writer,databaseName:m.databaseName,backendId:m.caseId,collectionPrefix:m.collectionPrefix,
            declaration:configured,...m.policy,operationTimeoutMS:m.bounds.operationMS,transactionTimeoutMS:m.bounds.transactionMS});
        const d=await sdk.negotiateStatefulProjection(definition,requested,{family:sdk.STATEFUL_FAMILY,interfaceVersion:1,supported:sdk.STATEFUL_HOST_CAPABILITIES,limits:requested},adapter.capabilities);
        assert.throws(()=>adapterSdk.canonicalStatefulRecord(d,'asset',{}),/Recapture/,'Foreign DTO must not become a local execution handle');
        assert.throws(()=>sdk.canonicalStatefulRecord(structuredClone(d),'asset',{}),/Recapture/);
        const custody=new Custody(m.caseRoot,m.bounds.candidateBytes,sdk,d);
        const hook=label=>freshJson(file('hook-'+label),{label,manifestSha256,process:processIdentity(process.pid)},m.bounds.outputBytes);
        const execute=(input,fn)=>sdk.executeStatefulBlock(d,input,adapter,custody,fn,guard);
        const inspect=async stage=>{assert.ok(Object.hasOwn(UNDO_BRANCHES,stage));
            const candidates={};
            for(const label of new Set([...UNDO_BRANCHES[stage],...(UNDO_FLOORS[stage]?[UNDO_FLOORS[stage]]:[])]))
                candidates[label]=await custody.load(d.digest,(await sdk.captureStatefulSource(d,UNDO_INPUTS[label])).digest);
            const observed=await physical(oracle,m,d,guard),recovery=await adapter.recovery(d);guard();
            verifyUndoInventory(observed,domain,stage,candidates,value=>BSON.serialize(value).length,m.policy,recovery);return observed;};
        const view=()=>adapter.open(d);
        const host=domain.bridge.createAtomicStatefulHost({sdk,declaration:d,adapter,custody,guard,codec:domain.codec});
        const read=v=>host.read(v,domain.query);
        const readCurrent=async stage=>{const result=await read(await view());same(result.value,domain.response(stage));return result;};
        const snapshot=(label,p)=>freshJson(file('physical-'+label),{schemaVersion:1,label,manifestSha256,process:processIdentity(process.pid),physical:p},m.bounds.outputBytes);
        let p,extra={};
        if(phase==='a') {
            assert.equal((await writer.db(m.databaseName).listCollections({},{nameOnly:true}).toArray()).length,0,'Never adopt an existing database');
            await adapter.initialize(d);await execute(source(1),async port=>{hook('a');await domain.reduce(port,'A');});
            p=await inspect('A');verifyRows(p,domain,'A');same(p.metadata.checkpoint,point(1));assert.equal(p.images.length,11);
            assert.ok(p.images.every(i=>i.before===null));assert.equal(p.metadata.undo[0].count,11);snapshot('A',p);
            const fixed=await custody.load(d.digest,(await sdk.captureStatefulSource(d,source(1))).digest);assertReceipt(p,fixed);
            await readCurrent('A');extra={view:await view(),businessDigest:businessDigest(p)};
        } else if(phase==='fail-b') {
            const before=await inspect('A');verifyRows(before,domain,'A');assert.equal(businessDigest(before),prior.businessDigest);
            const current=await failStatus();assert.equal(current.mode,0);same(current.data,{});
            // Retain local ownership intent before the native command: its acknowledgment may
            // be lost. Cleanup then inspects the exact appName/data before touching the setting.
            failpointOwned=true;failpointCount=m.server.failpointBaselineCount;
            const enabled=await oracle.db('admin').command({configureFailPoint:'failCommand',mode:{times:1},data:failData});
            assert.equal(enabled.count,m.server.failpointBaselineCount);failpointCount=enabled.count;
            try {await rejects(execute(source(2),async port=>{hook('b');await domain.reduce(port,'B');}), 'stateful.apply-unavailable');
                await oracle.db('admin').command({waitForFailPoint:'failCommand',timesEntered:failpointCount+1,maxTimeMS:m.bounds.operationMS});
            } finally {extra.failpointEntered=await off();}
            const rowCollection=m.collectionPrefix+'_stateful_r_'+d.digest;
            const fixed=await custody.load(d.digest,(await sdk.captureStatefulSource(d,source(2))).digest);assert.ok(fixed);
            const failed=verifyFailureTrace(trace,{rowCollection,metadataCollection:m.collectionPrefix+'_stateful_metadata',
                metadataId:hash(JSON.stringify([d.definition.binding.chainId,d.definition.binding.backendId,d.definition.id])),
                candidateDigest:fixed.digest,sourceDigest:fixed.source.digest},domain.rows('B'));
            p=await inspect('A');assert.equal(businessDigest(p),businessDigest(before));verifyRows(p,domain,'A');assert.ok(p.metadata.pending);snapshot('failed-B-A',p);
            await rejects(view(),'stateful.incomplete');await rejects(read(prior.view),'stateful.incomplete');
            assert.equal(p.metadata.pending.candidateDigest,fixed.digest);extra={...extra,view:prior.view,businessDigest:businessDigest(p),candidateDigest:fixed.digest,
                failedDeleteCode:failed.code,transactionAborted:true,hookB:hash(readFileSync(file('hook-b')))};
        } else if(phase==='recover-b') {
            assert.notDeepEqual(processIdentity(process.pid),prior.process,'Recovery must be a new application invocation');
            if(existsSync('/proc/'+prior.process.pid))assert.notEqual(processIdentity(prior.process.pid).birthTicks,prior.process.birthTicks,'Old application is still alive');
            const beforeHook=hash(readFileSync(file('hook-b')));assert.equal(beforeHook,prior.hookB);
            const outcome=await execute(source(2),async()=>{throw new Error('Recovery reran a hook');});assert.equal(outcome.status,'applied');
            p=await inspect('B');verifyRows(p,domain,'B');same(p.metadata.checkpoint,point(2));assert.equal(p.metadata.pending,null);
            assert.equal(hash(readFileSync(file('hook-b'))),beforeHook);const fixed=await custody.load(d.digest,(await sdk.captureStatefulSource(d,source(2))).digest);assert.equal(fixed.digest,prior.candidateDigest);assertReceipt(p,fixed);snapshot('B',p);
            const images=p.images.filter(i=>i.blockId===hex(2));assert.equal(images.length,3);assert.equal(new Set(images.map(i=>stable(i.target))).size,3);
            for(const image of images){const original=domain.rows('A').find(r=>r.kind===image.target.kind&&r.key===image.target.key);
                assert.equal(image.before,original?stable(original.value):null);}
            const before=businessDigest(p);assert.equal((await execute(source(2),async()=>{throw Error('Duplicate reran hook');})).status,'duplicate');
            await rejects(execute(source(2,99),async()=>{throw Error('Conflict ran hook');}),'stateful.replay-conflict');assert.equal(businessDigest(await inspect('B')),before);
            await rejects(read(prior.view),'stateful.stale-view');await readCurrent('B');extra={view:await view(),businessDigest:before,originalCandidateReused:true,appRestart:true};
        } else if(phase==='fork-c') {
            p=await inspect('B');verifyRows(p,domain,'B');assert.equal(businessDigest(p),prior.businessDigest);const b=await view();
            const request={declarationDigest:d.digest,revision:b.revision,operationId:hex(50),from:b.checkpoint,ancestor:point(1),maxBlocks:1};freshJson(file('rollback-plan'),request,m.bounds.outputBytes);
            assert.equal((await adapter.rollback(request)).status,'rolled-back');p=await inspect('A');verifyRows(p,domain,'A');same(p.metadata.checkpoint,point(1));snapshot('rollback-A',p);
            await rejects(read(b),'stateful.stale-view');const oldA=boundedJson(file('a'),m.bounds.outputBytes).view;await rejects(read(oldA),'stateful.stale-view');
            await execute(source(2,3,point(1)),async port=>{hook('c');await domain.reduce(port,'C');});
            p=await inspect('C');verifyRows(p,domain,'C');same(p.metadata.checkpoint,point(2,hex(3)));snapshot('C',p);const before=businessDigest(p);
            assertReceipt(p,await custody.load(d.digest,(await sdk.captureStatefulSource(d,source(2,3,point(1)))).digest));
            assert.equal((await adapter.rollback(request)).status,'duplicate');assert.equal(businessDigest(await inspect('C')),before);
            const retained=await adapter.retainedCheckpoints(d,p.metadata.revision);same(retained.checkpoints,[point(2,hex(3)),point(1),point(0)]);
            await readCurrent('C');extra={view:await view(),businessDigest:before,rollbackComplete:true,replacementBranch:true};
        } else {
            p=await inspect('C');verifyRows(p,domain,'C');assert.equal(businessDigest(p),prior.businessDigest);
            await execute(source(3,4,point(2,hex(3))),async()=>{hook('d');});
            p=await inspect('D');verifyRows(p,domain,'C');snapshot('D',p);
            await execute(source(4,5,point(3,hex(4))),async()=>{hook('e');});
            const before=await inspect('E'),v=await view();snapshot('E',before);same(before.metadata.floor,point(2,hex(3)));assert.equal(before.metadata.undo.length,2);
            for(const input of [source(3,4,point(2,hex(3))),source(4,5,point(3,hex(4)))])
                assertReceipt(before,await custody.load(d.digest,(await sdk.captureStatefulSource(d,input)).digest));
            const request={declarationDigest:d.digest,revision:v.revision,operationId:hex(60),from:v.checkpoint,ancestor:point(1),maxBlocks:1};
            await rejects(adapter.rollback(request),'stateful.rollback-unavailable');await rejects(view(),'stateful.incomplete');
            p=await inspect('E');verifyRows(p,domain,'C');snapshot('unavailable-E',p);same(p.rows,before.rows);same(p.images,before.images);same(p.metadata.checkpoint,before.metadata.checkpoint);
            assert.equal(p.metadata.rollback.status,'unavailable');assert.notEqual(p.metadata.revision,v.revision);
            extra={retentionUnavailable:true,readinessRefused:true};
        }
        guard();receipt={schemaVersion:1,phase,status:'passed',manifestSha256,process:processIdentity(process.pid),actualMongo:true,
            engineCrash:false,unknownTransportCommit:false,sourceAuthority:false,fullParity:false,elapsedMS:Date.now()-start,
            counts:{rows:p.rows.length,images:p.images.length,receipts:p.metadata.receipts.length,undo:p.metadata.undo.length},
            physicalDigest:hash(stable(p)),commandTraceDigest:hash(stable(trace)),...extra};
    } finally {
        try {if(failpointOwned)await off();}
        finally {const closed=await Promise.allSettled(clients.map(c=>c.close()));
            const failed=closed.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
    }
    guard();receipt.commandTraceDigest=hash(stable(trace));receipt.elapsedMS=Date.now()-start;
    receipt.commandTraceFile=freshJson(file(phase+'.commands'),{phase,observations:trace},m.bounds.outputBytes);
    freshJson(file(phase),receipt,m.bounds.outputBytes);
    return receipt;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(pathToFileURL(process.argv[1]))) {
    const [, ,phase,manifestPath,manifestSha256]=process.argv;
    try {assert.equal(process.argv.length,5);const r=await runPhase(phase,manifestPath,manifestSha256);
        console.log(JSON.stringify({phase:r.phase,status:r.status,counts:r.counts,physicalDigest:r.physicalDigest,actualMongo:true,
            engineCrash:false,fullParity:false}));}
    catch(e){console.error(JSON.stringify({phase:PHASES.includes(phase)?phase:'invalid',status:'failed',code:failureCode(e),engineQualification:false}));process.exitCode=1;}
}
