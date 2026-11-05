import assert from 'node:assert/strict';
import {readFileSync, statfsSync} from 'node:fs';
import {cpus} from 'node:os';
import {join} from 'node:path';

export const LIMITS = Object.freeze({maximumDeadlineMS:600000, maximumCPUs:8, maximumMemoryBytes:32*1024**3, beforeAvailableBytes:2*1024**3, availableBytes:1024**3, diskBytes:4*1024**3});
const fail = message => { throw new Error('physical guard: '+message); };
function birth(stat) { const end=stat.lastIndexOf(')'); if(end<0) fail('invalid proc stat'); const fields=stat.slice(end+2).trim().split(/\s+/); if(!/^\d+$/.test(fields[19]??'')) fail('invalid process birth'); return fields[19]; }
function memory(raw) { const field=name=>{const m=raw.match(new RegExp('^'+name+':\\s+(\\d+) kB$', 'm')); if(!m) fail('missing '+name); return Number(m[1])*1024;}; return {memoryTotalBytes:field('MemTotal'),memoryAvailableBytes:field('MemAvailable')}; }
function oom(read) {
 const cg=read('/proc/self/cgroup'); const v2=cg.split('\n').find(s=>s.startsWith('0::'));
 if(v2) { const path=v2.slice(3); if(!path.startsWith('/')||path.split('/').includes('..')) fail('invalid cgroup path'); const raw=read(join('/sys/fs/cgroup',path,'memory.events')); const m=raw.match(/^oom_kill\s+(\d+)$/m); if(!m) fail('unreadable cgroup oom counter'); return {scope:'v2',oomKill:Number(m[1])}; }
 const v1=cg.split('\n').find(s=>/^\d+:[^:]*\bmemory\b[^:]*:/.test(s));
 if(v1) { const path=v1.slice(v1.indexOf(':',v1.indexOf(':')+1)+1); if(!path.startsWith('/')||path.split('/').includes('..')) fail('invalid cgroup path'); const raw=read(join('/sys/fs/cgroup/memory',path,'memory.oom_control')); const m=raw.match(/^oom_kill\s+(\d+)$/m); if(!m) fail('unreadable cgroup oom counter'); return {scope:'v1',oomKill:Number(m[1])}; }
 return {scope:'absent',oomKill:null,note:'No memory cgroup scope exposed by /proc/self/cgroup'};
}
export function evaluateSnapshot(s, phase, baseline, deadlineMS) {
 if(!Number.isFinite(s.monotonicMS)||s.monotonicMS<baseline.monotonicMS||s.monotonicMS-baseline.monotonicMS>=deadlineMS) fail('deadline or monotonic clock');
 if(!s.bootId||!Number.isInteger(s.pid)||s.pid<=0||!/^\d+$/.test(s.birth)) fail('invalid process identity');
 if(s.bootId!==baseline.bootId||s.pid!==baseline.pid||s.birth!==baseline.birth) fail('process identity changed');
 if(!Number.isInteger(s.cpus)||s.cpus<2||s.cpus>LIMITS.maximumCPUs) fail('CPU capacity');
 if(!Number.isSafeInteger(s.memoryTotalBytes)||s.memoryTotalBytes<=0||s.memoryTotalBytes>LIMITS.maximumMemoryBytes) fail('total memory');
 if(!Number.isSafeInteger(s.memoryAvailableBytes)||s.memoryAvailableBytes<(phase==='before'?LIMITS.beforeAvailableBytes:LIMITS.availableBytes)) fail('available memory');
 if(!Number.isSafeInteger(s.diskAvailableBytes)||s.diskAvailableBytes<LIMITS.diskBytes) fail('available disk');
 for(const value of [baseline.oom,s.oom]) if(!value||!['v1','v2'].includes(value.scope)||!Number.isSafeInteger(value.oomKill)||value.oomKill<0) fail('missing or invalid cgroup OOM evidence');
 if(s.oom.scope!==baseline.oom.scope||s.oom.oomKill!==baseline.oom.oomKill) fail('cgroup OOM counter changed');
}
// Internal pure core: callers must provide inert observations; production never accepts these ports.
export function createGuardCore({deadlineMS,persist,observe}) {
 assert(Number.isFinite(deadlineMS)&&deadlineMS>0&&deadlineMS<=LIMITS.maximumDeadlineMS,'finite bounded deadline required'); assert.equal(typeof persist,'function'); assert.equal(typeof observe,'function');
 const baseline=observe(); let latest, firstFailure, failed=false;
 const latch=error=>{if(!failed){failed=true;firstFailure=error;}};
 function sample(phase) {
  if(failed)throw firstFailure;
  let row,s;
  try {s=observe();evaluateSnapshot(s,phase,baseline,deadlineMS);row={phase,status:'passed',snapshot:s,baseline,limits:LIMITS,deadlineMS};}
  catch(error){latch(error);row={phase,status:'failed',error:String(error?.message??error),snapshot:s??null,baseline,limits:LIMITS,deadlineMS};}
  try {const result=persist(row);assert.equal(result,undefined,'persist must be synchronous and return undefined');}
  catch(error){latch(error);row={...row,status:'failed',error:row.error??String(firstFailure?.message??firstFailure),persistenceFailure:String(error?.message??error)};}
  latest=row;
  if(failed)throw firstFailure;
  return row;
 }
 return Object.freeze({guard:()=>sample('during'),checkpoint:phase=>{if(failed)throw firstFailure;assert(['before','after'].includes(phase)); return sample(phase);},report:()=>latest});
}
export function createPhysicalGuard({root,deadlineMS,persist}) {
 assert.equal(process.platform,'linux','physical guard requires Linux'); assert.equal(typeof root,'string');
 const read=path=>readFileSync(path,'utf8');
 const observe=()=>{const disk=statfsSync(root); return {utc:new Date().toISOString(),monotonicMS:Number(process.hrtime.bigint()/1000000n),bootId:read('/proc/sys/kernel/random/boot_id').trim(),pid:process.pid,birth:birth(read('/proc/self/stat')),cpus:cpus().length,...memory(read('/proc/meminfo')),diskAvailableBytes:Number(disk.bavail)*Number(disk.bsize),oom:oom(read)};};
 return createGuardCore({deadlineMS,persist,observe});
}
