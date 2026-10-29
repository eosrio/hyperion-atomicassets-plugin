import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,mkdirSync,mkdtempSync,realpathSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const MAX_STREAM_BYTES=2*1024**2,MAX_METADATA_BYTES=65536,MAX_PHASES=16;
export const SOURCE_PHASE_PREFIX='AA_PG_SOURCE_PHASE ';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>{const raw=Buffer.from(JSON.stringify(value,null,2)+'\n');assert.ok(raw.length<=MAX_METADATA_BYTES,'Source probe metadata bound');return raw;};
function phases(bytes){
  const observed=[];let malformed=0;
  for(const line of bytes?.toString('utf8').split('\n')??[]){
    if(!line.startsWith(SOURCE_PHASE_PREFIX))continue;
    try{const value=JSON.parse(line.slice(SOURCE_PHASE_PREFIX.length));
      assert.deepEqual(Object.keys(value).sort(),['elapsedNs','name','sequence']);
      assert.ok(typeof value.name==='string'&&value.name.length<=64&&/^[a-z-]+$/.test(value.name));
      assert.equal(value.sequence,observed.length+1);assert.ok(typeof value.elapsedNs==='string'&&/^(0|[1-9][0-9]*)$/.test(value.elapsedNs));
      assert.ok(observed.length<MAX_PHASES&&BigInt(value.elapsedNs)<=10n**18n);
      if(observed.length)assert.ok(BigInt(value.elapsedNs)>=BigInt(observed.at(-1).elapsedNs));
      observed.push(value);
    }catch{malformed++;}
  }
  return {observed,malformed,authority:'observational only; no acceptance or timeout waiver'};
}
function spawnError(error){
  if(error==null)return null;
  const result={};
  for(const name of ['name','message','stack','code','errno','syscall','path','spawnargs']){
    const value=error[name];
    if(value!==undefined)result[name]=value;
  }
  json(result);return result;
}

/** Called after the one real spawnSync returns, before assertions or temporary-CWD cleanup. */
export function persistSourceProbeTerminal(root,child,context){
  const outputs={stdout:child.stdout,stderr:child.stderr,fd3:child.output?.[3]},buffers={};
  for(const [name,value]of Object.entries(outputs)){
    assert.ok(value==null||Buffer.isBuffer(value),'Source probe returned a nonbyte stream');
    if(value!=null){assert.ok(value.length<=MAX_STREAM_BYTES,'Source probe stream retention bound');buffers[name]=value;}
  }
  const record={schemaVersion:1,context,spawnSyncReturned:true,pid:child.pid??null,status:child.status??null,signal:child.signal??null,
    returnedFields:Object.fromEntries(['pid','status','signal','error'].map(name=>[name,Object.hasOwn(child,name)])),
    spawnError:spawnError(child.error),normalProcessExit:child.error==null&&child.status===0&&child.signal===null,
    probeAcceptance:'not evaluated here; original assertions still apply',phaseEvidence:phases(buffers.stderr),streams:{}};
  json(record);mkdirSync(root,{recursive:true});assert.ok(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink(),'Ordinary source evidence root required');
  const directory=mkdtempSync(join(realpathSync(root),'source-probe-'));
  for(const name of Object.keys(outputs)){
    if(!Object.hasOwn(buffers,name)){record.streams[name]={available:false};continue;}
    const bytes=buffers[name],path=join(directory,name+'.bin');writeFileSync(path,bytes,{flag:'wx'});
    record.streams[name]={available:true,path,bytes:bytes.length,sha256:sha(bytes)};
  }
  const path=join(directory,'terminal.json'),raw=json(record);writeFileSync(path,raw,{flag:'wx'});
  return {directory,path,bytes:raw.length,sha256:sha(raw),record};
}

export function persistSourceProbeCleanup(directory,observed){
  const path=join(directory,'cleanup.json'),raw=json({schemaVersion:1,...observed});writeFileSync(path,raw,{flag:'wx'});
  return {path,bytes:raw.length,sha256:sha(raw)};
}
