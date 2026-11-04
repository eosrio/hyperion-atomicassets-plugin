import test from 'node:test';
import assert from 'node:assert/strict';
import {stageOwnedSchemaTransition as transition} from '../dist/atomicassets/internal/owned-schema-count.js';

const contract='atomicassets',key=(...v)=>JSON.stringify(v),asset=(id,schema,owner)=>({contract,asset_id:id,collection_name:'collect',schema_name:schema,owner});
const a=key(contract,'collect','a'),b=key(contract,'collect','b');
function fixture(){let rows=new Map(),known=new Set(),fail=false;
 const mark=k=>known.add(k),seed=(k,n)=>{mark(k);const [,collection_name,schema_name]=JSON.parse(k);rows.set(k,{contract,collection_name,schema_name,owned:String(n)});};
 const run=async fn=>{const candidate=structuredClone(rows);await fn({async get(kind,k){assert.equal(kind,'owned-schema-count');return !known.has(k)?{status:'unavailable',reason:'unknown'}:candidate.has(k)?{status:'present',value:candidate.get(k)}:{status:'covered-absent'};},put(kind,k,v){candidate.set(k,v);if(fail)throw Error('injected');},delete(){throw Error('unexpected');}});rows=candidate;};
 return {mark,seed,run,fail(v){fail=v;},snapshot:()=>structuredClone(rows),restore(v){rows=structuredClone(v);},count:k=>rows.get(k)?.owned};}

test('mint, transfer, burn, replay and replacement update only owned contributions',async()=>{
 const f=fixture();f.mark(a);f.mark(b);let old=null;
 async function apply(next){await f.run(s=>transition(s,contract,'1',old,next));old=next;}
 await apply(asset('1','a','alice'));assert.equal(f.count(a),'1');
 await apply(asset('1','a','bob'));assert.equal(f.count(a),'1');
 await apply(asset('1','a','bob'));assert.equal(f.count(a),'1');
 const before=f.snapshot(),previous=old;
 await apply(asset('1','a',null));assert.equal(f.count(a),'0');
 await apply(asset('1','a',null));assert.equal(f.count(a),'0');
 f.restore(before);old=previous;await apply(asset('1','b','bob'));assert.equal(f.count(a),'0');assert.equal(f.count(b),'1');
 await apply(null);assert.equal(f.count(b),'0');
});
test('multiple assets keep membership until the last owned asset burns',async()=>{
 const f=fixture();f.mark(a);const one=asset('1','a','alice'),two=asset('2','a','bob');
 await f.run(async s=>{await transition(s,contract,'1',null,one);await transition(s,contract,'2',null,two);});assert.equal(f.count(a),'2');
 await f.run(s=>transition(s,contract,'1',one,{...one,owner:null}));assert.equal(f.count(a),'1');
 await f.run(s=>transition(s,contract,'2',two,{...two,owner:null}));assert.equal(f.count(a),'0');
});
test('unknown coverage, inconsistent seed, overflow and candidate failure refuse without publication',async()=>{
 const x=fixture();await assert.rejects(x.run(s=>transition(s,contract,'1',null,asset('1','a','alice'))));
 x.mark(a);await assert.rejects(x.run(s=>transition(s,contract,'1',asset('1','a','alice'),null)));
 x.seed(a,'9223372036854775807');const before=x.snapshot();await assert.rejects(x.run(s=>transition(s,contract,'1',null,asset('1','a','alice'))));assert.deepEqual(x.snapshot(),before);
 x.seed(a,1);const seeded=x.snapshot();x.fail(true);await assert.rejects(x.run(s=>transition(s,contract,'1',asset('1','a','alice'),null)));assert.deepEqual(x.snapshot(),seeded);
 await assert.rejects(x.run(s=>transition(s,contract,'1',null,asset('2','a','alice'))));
});
