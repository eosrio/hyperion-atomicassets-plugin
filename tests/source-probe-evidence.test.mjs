import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {persistSourceProbeTerminal,persistSourceProbeCleanup,SOURCE_PHASE_PREFIX} from '../harness/atomicassets/postgres/source-probe-evidence.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const context={execution:'explicit controlled terminal result; no original source authority',requestedTimeoutMs:60000,requestedMaxBufferBytes:2*1024**2,elapsedNs:'123'};
const marker=(sequence,name,elapsedNs)=>SOURCE_PHASE_PREFIX+JSON.stringify({sequence,name,elapsedNs})+'\n';
function owned(work){const root=mkdtempSync(join(tmpdir(),'aa-source-evidence-unit-'));try{return work(root);}finally{
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(root.includes('aa-source-evidence-unit-'));rmSync(root,{recursive:true});}}
const outcome=(extra={})=>({pid:42,status:0,signal:null,stdout:Buffer.from('stdout\0bytes'),stderr:Buffer.from('ordinary log\n'+marker(1,'start','1')),
  output:[null,null,null,Buffer.from('{"proof":"complete"}')],...extra});

test('native pipe-four success and nonzero children retain their actual returned bytes before assertions',()=>owned(root=>{
  for(const status of [0,7]){
    const script="require('node:fs').writeSync(1,Buffer.from([0,255,10]));require('node:fs').writeSync(2,'native stderr');require('node:fs').writeSync(3,'{\"native\":true}');process.exit("+status+")";
    const child=spawnSync(process.execPath,['-e',script],{stdio:['pipe','pipe','pipe','pipe'],timeout:60000,maxBuffer:2*1024**2,windowsHide:true});
    assert.ifError(child.error);assert.equal(child.status,status);
    const saved=persistSourceProbeTerminal(root,child,{...context,execution:'actual quick native pipe-four fixture'});
    assert.equal(saved.record.status,status);assert.equal(saved.record.normalProcessExit,status===0);
    for(const [name,raw]of [['stdout',child.stdout],['stderr',child.stderr],['fd3',child.output[3]]]){
      const pin=saved.record.streams[name];assert.equal(pin.available,true);assert.equal(pin.bytes,raw.length);assert.equal(pin.sha256,sha(raw));assert.deepEqual(readFileSync(pin.path),raw);}
    assert.equal(saved.record.probeAcceptance,'not evaluated here; original assertions still apply');
  }
}));

test('controlled timeout retains partial streams, exact error/status/signal and completed markers without granting success',()=>owned(root=>{
  const error=Object.assign(new Error('spawnSync controlled ETIMEDOUT'),{code:'ETIMEDOUT',errno:-110,syscall:'spawnSync',path:'controlled-node',spawnargs:['controlled-child']});
  const stderr=Buffer.from(marker(1,'start','1')+marker(2,'final-proof-after','60000000000'));
  const saved=persistSourceProbeTerminal(root,outcome({status:null,signal:'SIGTERM',error,stdout:Buffer.from('partial stdout'),stderr,
    output:[null,null,null,Buffer.from('{partial')] }),context);
  assert.equal(saved.record.status,null);assert.equal(saved.record.signal,'SIGTERM');assert.equal(saved.record.spawnError.code,'ETIMEDOUT');
  assert.equal(saved.record.spawnError.errno,-110);assert.deepEqual(saved.record.spawnError.spawnargs,['controlled-child']);
  assert.equal(saved.record.normalProcessExit,false);assert.equal(saved.record.phaseEvidence.observed.at(-1).name,'final-proof-after');
  assert.deepEqual(readFileSync(saved.record.streams.fd3.path),Buffer.from('{partial'));
  assert.throws(()=>assert.ifError(error));assert.ok(readFileSync(saved.path).length>0,'Evidence exists after a later assertion fails');
}));

test('unavailable stream/status fields remain distinct from returned empty bytes and null terminal fields',()=>owned(root=>{
  const a=persistSourceProbeTerminal(root,{stdout:null,stderr:null,output:[null,null,null,null]},context);
  assert.equal(a.record.normalProcessExit,false);assert.equal(a.record.returnedFields.status,false);assert.equal(a.record.streams.fd3.available,false);
  const b=persistSourceProbeTerminal(root,outcome({stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),output:[null,null,null,Buffer.alloc(0)]}),context);
  assert.equal(b.record.returnedFields.status,true);assert.equal(b.record.streams.fd3.available,true);assert.equal(b.record.streams.fd3.bytes,0);
  assert.equal(b.record.streams.fd3.sha256,sha(Buffer.alloc(0)));assert.notEqual(a.directory,b.directory);
}));

test('malformed, decreasing or excess phase telemetry is retained as data and never changes the process verdict',()=>owned(root=>{
  const lines=[marker(1,'start','10'),marker(2,'source-capture-before','9'),SOURCE_PHASE_PREFIX+'not json\n'];
  for(let n=2;n<=18;n++)lines.push(marker(n,'module-load-after',String(10+n)));
  const raw=Buffer.from(lines.join('')),saved=persistSourceProbeTerminal(root,outcome({stderr:raw,status:7}),context);
  assert.equal(saved.record.normalProcessExit,false);assert.equal(saved.record.phaseEvidence.observed.length,16);assert.equal(saved.record.phaseEvidence.malformed,4);
  assert.deepEqual(readFileSync(saved.record.streams.stderr.path),raw);
}));

test('receipt files cannot overwrite earlier terminals or cleanup observations',()=>owned(root=>{
  const first=persistSourceProbeTerminal(root,outcome(),context),before=readFileSync(first.path);
  const second=persistSourceProbeTerminal(root,outcome({status:7}),context);assert.notEqual(first.path,second.path);assert.deepEqual(readFileSync(first.path),before);
  const cleanup=persistSourceProbeCleanup(first.directory,{status:'removed',temporaryCwd:'controlled-owned-cwd',error:null});
  assert.equal(JSON.parse(readFileSync(cleanup.path)).status,'removed');assert.throws(()=>persistSourceProbeCleanup(first.directory,{status:'removed'}),/EEXIST/);
}));

test('diagnostic retention refuses oversized streams and metadata without inventing a successful record',()=>owned(root=>{
  assert.throws(()=>persistSourceProbeTerminal(root,outcome({stdout:Buffer.alloc(2*1024**2+1)}),context),/retention bound/);
  assert.throws(()=>persistSourceProbeTerminal(root,outcome(),{...context,unexpected:'x'.repeat(65536)}),/metadata bound/);
  assert.deepEqual(readdirSync(root),[]);
}));

test('raw diagnostic bytes survive temporary SQL-CWD cleanup and a subsequent assertion error',()=>owned(root=>{
  const cwd=mkdtempSync(join(root,'owned-sql-'));writeFileSync(join(cwd,'original.sql'),'controlled SQL');
  const saved=persistSourceProbeTerminal(root,outcome({status:9}),{...context,cwd});
  assert.equal(dirname(resolve(cwd)),resolve(root));rmSync(cwd,{recursive:true});persistSourceProbeCleanup(saved.directory,{status:'removed',temporaryCwd:cwd,error:null});
  assert.throws(()=>assert.equal(saved.record.status,0));assert.deepEqual(readFileSync(saved.record.streams.stdout.path),Buffer.from('stdout\0bytes'));
}));
