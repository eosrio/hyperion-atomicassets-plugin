import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardCore,createPhysicalGuard,LIMITS} from './guard.mjs';
import {readFileSync} from 'node:fs';
const snapshot=()=>({utc:'2026-01-01T00:00:00Z',monotonicMS:1,bootId:'boot',pid:5,birth:'123',cpus:2,memoryTotalBytes:8*1024**3,memoryAvailableBytes:3*1024**3,diskAvailableBytes:5*1024**3,oom:{scope:'v2',oomKill:0}});
function setup(){let s=snapshot(),rows=[];const g=createGuardCore({deadlineMS:600000,persist:r=>{rows.push(r);},observe:()=>structuredClone(s)});return {g,rows,change:f=>f(s)};}
test('fresh checkpoints persist evidence and enforce phase-specific memory',()=>{const x=setup();x.g.checkpoint('before');x.change(s=>{s.monotonicMS++;s.memoryAvailableBytes=LIMITS.availableBytes;});x.g.guard();x.g.checkpoint('after');assert.deepEqual(x.rows.map(r=>r.status),['passed','passed','passed']);assert.equal(x.g.report().phase,'after');assert.throws(()=>x.g.checkpoint('before'),/available memory/);assert.equal(x.g.report().status,'failed');});
test('identity, resource, OOM and deadline changes refuse subsequent effects',()=>{for(const [change,reason] of [[s=>s.bootId='other',/identity/],[s=>s.birth='456',/identity/],[s=>s.pid++,/identity/],[s=>s.cpus=9,/CPU/],[s=>s.diskAvailableBytes=0,/disk/],[s=>s.memoryTotalBytes=33*1024**3,/total memory/],[s=>s.oom.oomKill++,/OOM/],[s=>s.monotonicMS=600001,/deadline/]]){const x=setup();change&&x.change(change);assert.throws(()=>x.g.guard(),reason);assert.equal(x.rows[0].status,'failed');}});
test('synchronous persistence is mandatory',()=>{const g=createGuardCore({deadlineMS:1,persist:()=>Promise.resolve(),observe:snapshot});assert.throws(()=>g.guard(),/synchronous/);assert.throws(()=>createGuardCore({deadlineMS:Infinity,persist:()=>{},observe:snapshot}),/deadline/);});
test('missing or invalid OOM observations fail closed in both the initial and later physical snapshots',()=>{
 const invalid=[undefined,null,{scope:'absent',oomKill:null},{scope:'unknown',oomKill:0},...[undefined,null,NaN,Infinity,-1,0.5,'0',Number.MAX_SAFE_INTEGER+1].map(oomKill=>({scope:'v2',oomKill}))];
 for(const value of invalid){
  const rows=[],g=createGuardCore({deadlineMS:600000,persist:r=>{rows.push(r);},observe:()=>({...snapshot(),oom:structuredClone(value)})});
  assert.throws(()=>g.checkpoint('before'),/OOM evidence/);assert.equal(rows[0].status,'failed');
  const x=setup();x.change(s=>{s.oom=structuredClone(value);});assert.throws(()=>x.g.guard(),/OOM evidence/);assert.equal(x.rows[0].status,'failed');
 }
});
test('actual production factory refuses non-Linux before resource reads on every test platform',()=>{const source=readFileSync(new URL('./guard.mjs',import.meta.url),'utf8'),start=source.indexOf('export function createPhysicalGuard(');assert(start>0);const run=new Function('assert','process',source.slice(start).replace('export ','')+';return createPhysicalGuard;')(assert,{platform:'win32'});assert.throws(()=>run({root:'.',deadlineMS:1,persist:()=>{}}),/Linux/);});
