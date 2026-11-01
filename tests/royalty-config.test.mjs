import assert from 'node:assert/strict';
import test from 'node:test';
import {original,originalCache,manifest} from './fixtures/royalty-original.mjs';
import {prepared,event,value,key,readRoyaltyConfig,reduceRoyaltyConfig,ROYALTY_CONFIG_KIND,AtomicPlugin,limits} from './fixtures/royalty-component.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
const clean=response=>{const body=response.json();if(body.success){assert.ok(Number.isSafeInteger(body.query_time));delete body.query_time;}return {status:response.statusCode,body};};
const cleanOriginal=response=>{const body=plain(response.body);delete body.query_time;return {status:response.status,body};};
async function seeded(changes={},input=value(),options={}){const s=await prepared(changes,options);await s.execute([event(input,{contract:options.marketContract??'atomicmarket'})]);return s;}

test('pins the unchanged original source, callback, SQL types and wrapper',()=>{
 assert.equal(manifest.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(Object.keys(manifest.sources).length,12);
 assert.equal(manifest.sources['processor.ts'].path,'src/filler/handlers/atomicmarket/processors/royalties.ts');
});

test('actual constructor registers independent royalty projection and keeps the compound declaration',async()=>{
 const plugin=new AtomicPlugin({projectionId:'custom',limits:limits()}),r=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']});
 assert.equal(r.projections.length,4);assert.equal(r.projections[0].definition.id,'custom');assert.equal(r.projections[0].definition.records.length,21);
 assert.equal(r.projections[1].definition.id,'custom:royalty-config');assert.deepEqual(r.projections[1].definition.records,[{kind:ROYALTY_CONFIG_KIND,integers:[]}]);
 assert.deepEqual(r.projections[1].definition.selectors,[{id:'atomicmarket:table:royaltyconf',contract:'atomicmarket',kind:'table',name:'royaltyconf'}]);
 assert.deepEqual(r.projections[1].requiredSourceCapabilities,[]);assert.deepEqual(r.projections[1].limits,limits());
 assert.deepEqual(r.projections[1].requiredCompleteKindRead.limits,{readAttempts:64,responseRecords:16,responseBytes:65536});
});

test('real SDK captured source/candidate, original callback and counted ID route agree',async()=>{
 const s=await seeded(),o=original();try{
  await o.apply(value());assert.deepEqual(await s.data(),await o.data('collection'));
  assert.deepEqual(clean(await s.api.inject('/atomicmarket/v1/royalties/collection')),cleanOriginal(await o.response('collection')));
  assert.equal(s.adapter.kindCalls,0);assert.equal(s.adapter.getCalls,1);assert.equal(s.adapter.nativeDataAttempts,1);assert.equal(s.adapter.closed,1);
  assert.equal(s.candidates[0].source.sourceInputVersion,2);assert.equal(s.candidates[0].mutations[0].target.kind,ROYALTY_CONFIG_KIND);
 }finally{o.close();await s.close();}
});

test('replacement and equal-priority same-block changes retain first creation and replace founders',async()=>{
 const s=await prepared(),o=original();try{
  const a=value(),b=value({founders:[],split_founders:'5'}),c=value({founders:[{recipient:'second',weight:3}],attribute_mode:0});
  await s.execute([event(a),event(b)]);await o.apply(a);await o.apply(b);
  assert.deepEqual(await s.data(),await o.data('collection'));assert.deepEqual((await s.data()).founders,[]);
  await s.execute([event(c)]);await o.apply(c,{blockNum:2,timeMs:1700000002000});
  const actual=await s.data();assert.deepEqual(actual,await o.data('collection'));assert.equal(actual.created_at_block,'1');assert.equal(actual.updated_at_block,'2');
 }finally{o.close();await s.close();}
});

test('delete, unknown delete and recreate preserve original absence and new creation metadata',async()=>{
 const s=await seeded(),o=original();try{
  await o.apply(value());await s.execute([event(value(),{present:false})]);await o.apply(value(),{present:false,blockNum:2,timeMs:1700000002000});
  assert.equal(await s.data(),null);assert.deepEqual(clean(await s.api.inject('/atomicmarket/v1/royalties/collection')),cleanOriginal(await o.response('collection')));
  assert.equal((await o.response('collection')).body.message,'Royalty config not found');
  await s.execute([event(value(),{present:false})]);await o.apply(value(),{present:false,blockNum:3,timeMs:1700000003000});
  await s.execute([event(value())]);await o.apply(value(),{blockNum:4,timeMs:1700000004000});
  assert.deepEqual(await s.data(),await o.data('collection'));assert.equal((await s.data()).created_at_block,'4');
 }finally{o.close();await s.close();}
});

test('controlled rollback restores full before-image and canonical replacement uses current source',async()=>{
 const s=await seeded(),o=original();try{
  await o.apply(value());const before=o.snapshot(),orphan=value({founders:[{recipient:'orphan',weight:99}]});
  await s.execute([event(orphan)]);await o.apply(orphan,{blockNum:2,timeMs:1700000002000});
  s.rollback();o.rollback(before);const replacement=value({split_templates:777});
  await s.execute([event(replacement)]);await o.apply(replacement,{blockNum:2,timeMs:1700000002000});assert.deepEqual(await s.data(),await o.data('collection'));
  s.rollback();o.rollback(before);assert.deepEqual(await s.data(),await o.data('collection'));
 }finally{o.close();await s.close();}
});

test('domain replay at the same source block is idempotent without process-local state',async()=>{
 const rows=new Map(),stage={async get(kind,k){return rows.has(k)?{status:'present',value:rows.get(k)}:{status:'covered-absent'};},put(kind,k,v){rows.set(k,plain(v));},delete(kind,k){rows.delete(k);}};
 const b={contract:'atomicmarket',blockNum:'1',blockTimeMs:'1700000001000'};
 await reduceRoyaltyConfig(b,value(),true,stage);const before=plain([...rows]);await reduceRoyaltyConfig(b,value(),true,stage);assert.deepEqual(plain([...rows]),before);
 await reduceRoyaltyConfig(b,value(),false,stage);await reduceRoyaltyConfig(b,value(),false,stage);assert.equal(rows.size,0);
});

test('bigint boundaries are exact strings and smallint is a number in original responses',async()=>{
 for(const mode of[-32768,32767]){
  const input=value({attribute_mode:mode,split_founders:'9223372036854775807',split_templates:'-9223372036854775808',split_attributes:'-0'}),s=await seeded({},input),o=original();
  try{await o.apply(input);const row=await s.data();assert.deepEqual(row,await o.data('collection'));assert.equal(typeof row.attribute_mode,'number');assert.equal(row.split_attributes,'0');
   for(const k of['split_founders','split_templates','split_attributes','created_at_block','updated_at_time'])assert.equal(typeof row[k],'string');
  }finally{o.close();await s.close();}
 }
});

test('source storage overflow and inexact integers refuse the entire staged block',async()=>{
 for(const patch of[{attribute_mode:32768},{attribute_mode:-32769},{split_founders:'9223372036854775808'},{split_templates:'-9223372036854775809'},{split_attributes:9007199254740992},{split_founders:'1.5'}]){
  const s=await seeded();try{const before=plain([...s.adapter.rows]);await assert.rejects(s.execute([event(value({split_templates:99})),event(value(patch))]));assert.deepEqual(plain([...s.adapter.rows]),before);}finally{await s.close();}
 }
});

test('exact original JSON encoding applies only to founders, including nested NUL and scalar JSON',async()=>{
 for(const founders of[[],null,{nested:['x\0y',{key:'雪',weight:'9007199254740993'}]},[{recipient:'a\0b',weight:1}],false,3.5]){
  const input=value({founders}),s=await seeded({},input),o=original();try{await o.apply(input);assert.deepEqual(await s.data(),await o.data('collection'));}finally{o.close();await s.close();}
 }
});

test('literal backslash encoding failure and JSONB surrogate rejection do not become successful state',async()=>{
 for(const founders of[{text:'literal\\u0000'},['\ud800']]){
  const s=await prepared(),o=original();try{await assert.rejects(s.execute([event(value({founders}))]));await assert.rejects(o.apply(value({founders})));assert.equal(s.candidates.length,0);}finally{o.close();await s.close();}
 }
 const s=await prepared();try{await assert.rejects(s.execute([event(value({collection:'a\0b'}))]));}finally{await s.close();}
});

test('decoded deleted row identity is required; missing source never becomes a fabricated delete',async()=>{
 const s=await seeded();try{const before=plain([...s.adapter.rows]);await assert.rejects(s.execute([event(null,{present:false})]));assert.deepEqual(plain([...s.adapter.rows]),before);
  await assert.rejects(s.execute([event(value(),{contract:'neighbor'})]));assert.deepEqual(plain([...s.adapter.rows]),before);
 }finally{await s.close();}
});

test('custom contract/projection stays isolated and a foreign stored row is unavailable',async()=>{
 const s=await seeded({},value(),{marketContract:'othermarket',projectionId:'other'});try{
  assert.equal(s.id,'other:royalty-config');assert.equal((await s.data()).market_contract,'othermarket');
  const own=s.adapter.rows.get(ROYALTY_CONFIG_KIND).get(key('collection','othermarket'));s.adapter.rows.get(ROYALTY_CONFIG_KIND).set(key('collection','othermarket'),{...own,market_contract:'atomicmarket'});
  assert.equal((await s.api.inject('/atomicmarket/v1/royalties/collection')).statusCode,503);
 }finally{await s.close();}
});

test('incompatible persisted SQL types or extra fields are unavailable rather than silently coerced',async()=>{
 for(const patch of[{attribute_mode:'1'},{split_founders:10},{extra:true}]){
  const s=await seeded();try{const rows=s.adapter.rows.get(ROYALTY_CONFIG_KIND);rows.set(key(),{...rows.get(key()),...patch});
   assert.equal((await s.api.inject('/atomicmarket/v1/royalties/collection')).statusCode,503);
  }finally{await s.close();}
 }
});

test('literal path and ignored body/query values do not invoke name-list or indexed operations',async()=>{
 const s=await seeded(),o=original();try{
  await o.apply(value());const query={collection_name:'neighbor',page:'bad',limit:'-1',names:'@missing'},body={collection_name:'neighbor',filter:{$unknown:true}};
  const r=await s.api.inject({url:'/atomicmarket/v1/royalties/collection',method:'POST',query,payload:body});assert.deepEqual(clean(r),cleanOriginal(await o.response('collection',{query,body,method:'POST'})));
  assert.deepEqual(clean(await s.api.inject('/atomicmarket/v1/royalties/%40missing')),cleanOriginal(await o.response('@missing')));
  assert.equal(s.adapter.kindCalls,0);
 }finally{o.close();await s.close();}
});

test('original ALL registration, success/missing envelopes and automatic HEAD match the component',async()=>{
 const s=await seeded(),o=original();try{await o.apply(value());assert.equal(o.cachedOptions.length,6);assert.ok(o.cachedOptions.every(v=>v===undefined));
  for(const method of['GET','POST','PUT','PATCH','DELETE','OPTIONS']){
   assert.deepEqual(clean(await s.api.inject({url:'/atomicmarket/v1/royalties/collection',method})),cleanOriginal(await o.response('collection',{method})));
   assert.deepEqual(clean(await s.api.inject({url:'/atomicmarket/v1/royalties/missing',method})),cleanOriginal(await o.response('missing',{method})));
  }
  const head=await s.api.inject({url:'/atomicmarket/v1/royalties/collection',method:'HEAD'});assert.equal(head.statusCode,200);assert.equal(head.body,'');assert.equal((await o.response('collection',{method:'HEAD'})).headBody,'');
 }finally{o.close();await s.close();}
});

test('static payout route takes precedence and wildcard never returns a config row for payouts',async()=>{
 const s=await prepared(),o=original();try{
  assert.equal((await o.response('payouts')).outsideComponent,true);
  assert.equal((await s.api.inject('/atomicmarket/v1/royalties/payouts')).statusCode,503);assert.equal(s.adapter.getCalls,0);
 }finally{o.close();await s.close();}
 const second=await prepared();try{second.api.all('/atomicmarket/v1/royalties/payouts',()=>({outsideComponent:true}));
  assert.deepEqual((await second.api.inject('/atomicmarket/v1/royalties/payouts')).json(),{outsideComponent:true});assert.equal(second.adapter.getCalls,0);
 }finally{await second.close();}
});

test('unknown initialization, owner phases and unavailable keyed results never yield covered absence',async()=>{
 const s=await prepared();try{
  s.flags.incomplete=true;assert.equal((await s.api.inject('/atomicmarket/v1/royalties/missing')).statusCode,503);
  s.flags.incomplete=false;s.adapter.phase='recovering';assert.equal((await s.api.inject('/atomicmarket/v1/royalties/missing')).statusCode,503);
  s.adapter.phase='idle';s.adapter.beforeReturn=async(_label,row)=>{row.result={status:'unavailable',reason:'source gap'};};
  assert.equal((await s.api.inject('/atomicmarket/v1/royalties/missing')).statusCode,503);
  s.adapter.beforeReturn=undefined;assert.equal((await s.api.inject('/atomicmarket/v1/royalties/missing')).statusCode,416);
 }finally{await s.close();}
});

test('native retry attempts and UTF8 response budgets remain selected and enforced',async()=>{
 const a=await seeded({readAttempts:1});try{a.adapter.keyedAttempts=2;assert.equal((await a.api.inject('/atomicmarket/v1/royalties/collection')).statusCode,503);assert.equal(a.adapter.nativeDataAttempts,1);}finally{await a.close();}
 const b=await seeded({responseBytes:600},value({founders:['雪'.repeat(100)]}));try{assert.equal((await b.api.inject('/atomicmarket/v1/royalties/collection')).statusCode,503);assert.equal(b.adapter.kindCalls,0);}finally{await b.close();}
});

test('generation/cancellation guard survives awaited reads, serialization, onSend and retained cache metadata',async()=>{
 for(const point of['read','serialization','send','fork']){
  const s=await seeded();try{
   if(point==='read')s.adapter.beforeReturn=async()=>{await Promise.resolve();s.flags.cancelled=true;};
   if(point==='serialization')s.beforeSerialize=async()=>{s.flags.expired=true;};
   if(point==='send')s.beforeSend=async()=>{s.flags.retired=true;};
   if(point==='fork')s.beforeSerialize=async()=>{s.beforeSerialize=undefined;s.rollback();};
   assert.equal((await s.api.inject('/atomicmarket/v1/royalties/collection')).statusCode,503);assert.equal(s.adapter.acquired,s.adapter.closed);
  }finally{await s.close();}
 }
 const s=await seeded();try{const response=await s.api.inject('/atomicmarket/v1/royalties/collection');assert.equal(response.statusCode,200);
  const cachedGuard=s.retainedGuards.at(-1);cachedGuard();s.flags.retired=true;assert.throws(cachedGuard);assert.equal(s.adapter.acquired,s.adapter.closed);
 }finally{await s.close();}
});

test('original cache keys include ignored query/body data, share methods, retain TTL and skip failures',async()=>{
 const cache=await originalCache();const a=await cache.request({query:{x:1},body:{y:2}}),b=await cache.request({query:{x:2},body:{y:2}}),c=await cache.request({query:{x:1},body:{y:2},method:'POST'});
 assert.notEqual(a.key,b.key);assert.equal(a.key,c.key);assert.equal(c.nextCalled,false);assert.ok(Buffer.isBuffer(c.answer));assert.ok(cache.expiries.every(row=>row.seconds===5));
 const failed=await originalCache();await failed.request({status:416});assert.equal(failed.sets.length,0);
 const oversized=await originalCache({maxValueBytes:1});await oversized.request();assert.equal(oversized.sets.length,0);
});

test('existing compound market restriction still refuses a v2 config source',async()=>{
 const s=await prepared();try{const compound=s.registrations[0];let effects=0;
  await assert.rejects(compound.reduce({source:{block:{blockNum:1,timeMs:'1700000001000',blockId:'1'.repeat(64)},inputs:[{contract:'atomicmarket',kind:'table',name:'config',present:true,
   identity:{kind:'contract-row',scope:'atomicmarket',primaryKey:'0'},data:{version:'2.0.0',atomicassets_account:'atomicassets',supported_tokens:[],supported_symbol_pairs:[]},sourceEvidence:'x',abiDeployment:'y',abiSha256:'0'.repeat(64)}]},
   async get(){effects++;return {status:'covered-absent'};},put(){effects++;},delete(){effects++;}}),/Unsupported market config/);assert.equal(effects,0);
 }finally{await s.close();}
});
