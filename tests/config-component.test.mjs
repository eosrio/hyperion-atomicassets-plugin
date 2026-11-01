import assert from 'node:assert/strict';
import test from 'node:test';
import {original,manifest} from './fixtures/config-original.mjs';
import {prepared,event,config,metadata,token,key,readAssetConfig} from './fixtures/config-component.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
const clean=response=>{const body=response.json();if(body.success){assert.ok(Number.isSafeInteger(body.query_time));delete body.query_time;}return {status:response.statusCode,body};};
const cleanOriginal=response=>{const body=plain(response.body);delete body.query_time;return {status:response.status,body};};
async function seeded(changes={},values=config(),version=metadata()){
 const s=await prepared(changes);await s.execute([event('config',values),event('tokenconfigs',version)]);return s;
}

test('source custody pins immutable 2.7.0 and labels the narrow unmerged upstream correction',()=>{
 assert.equal(manifest.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
 assert.equal(manifest.upstreamCorrection.commit,'febcd2fb6c849d8f075696f158b0d73de4c72c01');assert.equal(Object.keys(manifest.sources).length,13);
 assert.match(manifest.upstreamCorrection.status,/unmerged/);
});

test('actual original initialization prefix and SDK-captured candidate/query match config and token data',async()=>{
 const values=config([token('AAA',0),token('BBB',8,'other.token')],[{name:'author',type:'string',extra:{display:['雪',true,3.5]}}]);
 const s=await seeded({},values),o=original();try{
  await o.initialize(values,metadata());assert.deepEqual(await s.data(),await o.data());
  const response=await s.api.inject('/atomicassets/v1/config');assert.deepEqual(clean(response),cleanOriginal(await o.response()));
  assert.equal(s.adapter.kindCalls,0);assert.equal(s.adapter.getCalls,1);assert.equal(s.adapter.closed,1);assert.equal(s.adapter.nativeDataAttempts,1);
  assert.equal(s.registration.definition.records.length,21);assert.ok(s.registration.definition.selectors.some(row=>row.contract==='atomicassets'&&row.name==='tokenconfigs'));
  const candidate=s.candidates[0];assert.equal(candidate.source.sourceInputVersion,2);assert.equal(candidate.source.source.inputs.length,2);
  assert.deepEqual(plain(candidate.source.source.inputs[0].identity),{kind:'contract-row',scope:'atomicassets',primaryKey:'0'});
  assert.equal(candidate.mutations.at(-1).value.api_config.interfaceVersion,1);
 }finally{o.close();await s.close();}
});

test('config and tokenconfigs source rows initialize in either order without inventing empty state',async()=>{
 for(const events of [[event('config',config()),event('tokenconfigs',metadata())],[event('tokenconfigs',metadata()),event('config',config())]]){
  const s=await prepared();try{await s.execute(events);assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,200);}finally{await s.close();}
 }
 const s=await prepared();try{await s.execute([event('tokenconfigs',metadata())]);assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,503);
  await s.execute([event('config',config())]);assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,200);
 }finally{await s.close();}
});

test('complete empty supported tokens and formats are real empty arrays',async()=>{
 const s=await seeded({},config([])),o=original();try{await o.initialize(config([]),metadata());assert.deepEqual(await s.data(),await o.data());
  assert.deepEqual((await s.api.inject('/atomicassets/v1/config')).json().data.supported_tokens,[]);
 }finally{o.close();await s.close();}
});

test('covered missing config preserves original 500 wrapper and message',async()=>{
 const s=await prepared(),o=original();try{assert.deepEqual(clean(await s.api.inject('/atomicassets/v1/config')),cleanOriginal(await o.response()));
  assert.deepEqual(cleanOriginal(await o.response()),{status:500,body:{success:false,message:'Config not found'}});assert.equal(s.adapter.closed,1);
 }finally{o.close();await s.close();}
});

test('legacy decoder-only or partial config rows remain unavailable rather than complete empty config',async()=>{
 for(const events of [[event('config',{collection_format:[]})],[event('config',config())]]){
  const s=await prepared();try{await s.execute(events);const response=await s.api.inject('/atomicassets/v1/config');assert.equal(response.statusCode,503);assert.equal(response.json().success,false);
  }finally{await s.close();}
 }
});

test('neighbor contracts and forged source identity cannot supply this singleton',async()=>{
 const s=await seeded(),o=original();try{await o.initialize(config(),metadata());o.seedNeighbor('neighbor');
  const neighbor=structuredClone(s.adapter.rows.get('config').get(key('atomicassets')));neighbor.api_config.contract='neighbor';
  s.adapter.rows.get('config').set(key('neighbor'),neighbor);
  assert.deepEqual(await s.data(),await o.data());const r=await s.api.inject('/atomicassets/v1/config');assert.equal(r.statusCode,200);
  s.adapter.rows.get('config').set(key('atomicassets'),neighbor);assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,503);
 }finally{o.close();await s.close();}
});

test('GET and automatic HEAD preserve registration, wrapper and ignored parameter behavior; POST is not registered',async()=>{
 const s=await seeded(),o=original();try{await o.initialize(config(),metadata());
  const query={page:'bad',limit:'-1',count:'true',unknown:'$list:missing'};
  assert.deepEqual(clean(await s.api.inject({url:'/atomicassets/v1/config',query})),cleanOriginal(await o.response({query})));
  assert.deepEqual(clean(await s.api.inject({url:'/atomicassets/v1/config?count=bad',method:'GET',payload:{page:{invalid:true}},headers:{'content-type':'application/json'}})),cleanOriginal(await o.response({query:{count:'bad'},body:{page:{invalid:true}}})));
  const head=await s.api.inject({url:'/atomicassets/v1/config',method:'HEAD'});assert.equal(head.statusCode,200);assert.equal(head.body,'');assert.equal((await o.response({method:'HEAD'})).headBody,'');
  assert.equal((await s.api.inject({url:'/atomicassets/v1/config',method:'POST',payload:{}})).statusCode,404);assert.equal((await o.response({method:'POST'})).registered,false);
 }finally{o.close();await s.close();}
});

test('same-branch config additions, collection format growth and version updates match actual original callbacks',async()=>{
 const s=await seeded(),o=original();try{await o.initialize(config(),metadata());
  for(const [table,value] of [['config',config([token(),token('BBB')],[{name:'author',type:'string'}])],['tokenconfigs',metadata('1.2.1')],
   ['config',config([token(),token('BBB'),token('CCC')],[{name:'author',type:'string'},{name:'title',type:'string'}])]]){
   await s.execute([event(table,value)]);await o.apply(table,value);assert.deepEqual(await s.data(),await o.data());
  }
  assert.equal((await s.api.inject('/atomicassets/v1/config')).json().data.version,'1.2.1');
 }finally{o.close();await s.close();}
});

test('same-length format replacement preserves original persisted API format and updates decoder format',async()=>{
 const first=config([token()],[{name:'first',type:'string'}]),next=config([token()],[{name:'second',type:'string'}]);
 const s=await seeded({},first),o=original();try{await o.initialize(first,metadata());await s.execute([event('config',next)]);await o.apply('config',next);
  assert.deepEqual(await s.data(),await o.data());assert.equal((await s.data()).collection_format[0].name,'first');
  assert.equal(s.adapter.rows.get('config').get(key('atomicassets')).collection_format[0].name,'second');
 }finally{o.close();await s.close();}
});

test('same symbol insert conflicts and replay retain the original token row and numeric precision',async()=>{
 const initial=config([token('AAA',4),token('AAA',8,'other.token')]),s=await seeded({},initial),o=original();
 try{await o.initialize(initial,metadata());const next=config([...initial.supported_tokens,token('BBB',2)]);
  for(let i=0;i<2;i++){await s.execute([event('config',next)]);await o.apply('config',next);assert.deepEqual(await s.data(),await o.data());}
  assert.equal((await s.data()).supported_tokens[0].token_precision,4);assert.equal((await s.data()).supported_tokens[0].token_contract,'eosio.token');
 }finally{o.close();await s.close();}
});

test('valid append-only competing branches reproduce the baseline defect and match the upstream correction',async()=>{
 for(const canonical of ['BBB','CCC']){
  const s=await seeded(),baseline=original(),fixed=original({fixed:true});try{
   await baseline.initialize(config(),metadata());await fixed.initialize(config(),metadata());const old=baseline.snapshot(),corrected=fixed.snapshot();
   const orphan=config([token(),token('BBB')]);await s.execute([event('config',orphan)]);await baseline.apply('config',orphan);await fixed.apply('config',orphan);
   s.rollback();baseline.rollback(old);fixed.rollback(corrected);await baseline.notifyFork();await fixed.notifyFork();
   const replacement=config([token(),token(canonical)]);await s.execute([event('config',replacement)]);await baseline.apply('config',replacement);await fixed.apply('config',replacement);
   assert.deepEqual(await s.data(),await fixed.data());assert.deepEqual((await s.data()).supported_tokens.map(row=>row.token_symbol),['AAA',canonical]);
   assert.deepEqual((await baseline.data()).supported_tokens.map(row=>row.token_symbol),['AAA']);
  }finally{baseline.close();fixed.close();await s.close();}
 }
});

test('fork restoration without a canonical config delta and reopening retain canonical data',async()=>{
 const s=await seeded(),o=original({fixed:true});try{await o.initialize(config(),metadata());const before=o.snapshot();
  const orphan=config([token(),token('BBB')],[{name:'orphan',type:'string'}]);await s.execute([event('config',orphan),event('tokenconfigs',metadata('1.2.1'))]);await o.apply('config',orphan);await o.apply('tokenconfigs',metadata('1.2.1'));
  s.rollback();o.rollback(before);await o.notifyFork();await s.execute([]);assert.deepEqual(await s.data(),await o.data());
  await o.restart();assert.deepEqual(await s.data(),await o.data());assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,200);
 }finally{o.close();await s.close();}
});

test('source erasure and malformed replacement refuse the whole SDK candidate',async()=>{
 const bad=[event('config',config(), 'atomicassets',false),event('tokenconfigs',metadata(),'atomicassets',false),
  event('config',{collection_format:[]}),event('config',config([{sym:'no-comma',contract:'eosio.token'}])),
  event('config',config([{sym:'2147483648,TOO',contract:'eosio.token'}])),event('tokenconfigs',metadata('x'.repeat(65)))];
 for(const input of bad){const s=await seeded();try{const before=s.snapshot(),count=s.candidates.length;await assert.rejects(s.execute([input]));
  assert.deepEqual(s.snapshot(),before);assert.equal(s.candidates.length,count);
 }finally{await s.close();}}
});

test('initial wrong standard and incomplete/missing token input do not gain API initialization',async()=>{
 const s=await prepared();try{await assert.rejects(s.execute([event('config',config()),event('tokenconfigs',{standard:'other',version:'1.2.0'})]));
  assert.equal(await s.data(),null);assert.equal(s.candidates.length,0);
 }finally{await s.close();}
});

test('original source NUL/type/range frontier refuses without coalescing corrupt persisted data',async()=>{
 for(const change of [state=>{state.version=null;},state=>{state.contract='other';},state=>{state.supported_tokens[0].token_precision='4';},
  state=>{state.collection_format=[{name:'x',type:7}];},state=>{state.cached_tokens=null;},state=>{state.version='bad\0version';}]){
  const s=await seeded();try{change(s.adapter.rows.get('config').get(key('atomicassets')).api_config);assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,503);
  }finally{await s.close();}}
});

test('counted keyed read refuses zero response slots, retry overflow and byte overflow',async()=>{
 for(const [changes,mutate] of [[{responseRecords:0},()=>{}],[{readAttempts:1},s=>{s.adapter.keyedAttempts=2;}],[{responseBytes:512},()=>{}]]){
  const s=await seeded(changes);try{mutate(s);const r=await s.api.inject('/atomicassets/v1/config');assert.equal(r.statusCode,503);assert.equal(s.adapter.closed,1);assert.equal(s.adapter.kindCalls,0);
  }finally{await s.close();}
 }
});

test('native response envelope and final body share the selected byte total, including UTF8',async()=>{
 const values=config([token()],[{name:'title',type:'string',display:'雪\n"\\'}]),s=await seeded({},values);let raw;
 try{s.adapter.beforeReturn=async(_kind,answer)=>{raw=structuredClone(answer);};const r=await s.api.inject('/atomicassets/v1/config');assert.equal(r.statusCode,200);
  const total=Buffer.byteLength(JSON.stringify(raw))+Buffer.byteLength(JSON.stringify(r.json()));
  for(const [bytes,status] of [[total,200],[total-1,503]]){const bounded=await seeded({responseBytes:bytes},values);try{assert.equal((await bounded.api.inject('/atomicassets/v1/config')).statusCode,status);}finally{await bounded.close();}}
 }finally{await s.close();}
});

test('SDK source/candidate limits refuse before any partial config commit',async()=>{
 const s=await prepared({inputOccurrences:1});try{await assert.rejects(s.execute([event('config',config()),event('tokenconfigs',metadata())]));assert.equal(s.candidates.length,0);assert.equal(await s.data(),null);}finally{await s.close();}
 const bounded=await prepared({mutations:1});try{await assert.rejects(bounded.execute([event('config',config()),event('tokenconfigs',metadata())]));assert.equal(await bounded.data(),null);}finally{await bounded.close();}
});

test('raw/pending/gap/recovery phases and cancelled/expired requests never serve config',async()=>{
 for(const phase of ['raw','pending','gap','rollback']){const s=await seeded();try{s.adapter.phase=phase;assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,503);assert.equal(s.adapter.acquired,0);}finally{await s.close();}}
 for(const flag of ['expired','cancelled','retired']){const s=await seeded();try{s.adapter.beforeReturn=async()=>{s.flags[flag]=true;};assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,503);assert.equal(s.adapter.closed,1);}finally{await s.close();}}
});

test('same request authority fences final serializer and onSend after the completed capability closes',async()=>{
 for(const hook of ['beforeSerialize','beforeSend']){const s=await seeded();try{s[hook]=async()=>{s.flags.expired=true;};
  const response=await s.api.inject('/atomicassets/v1/config');assert.equal(response.statusCode,503);assert.equal(response.json().success,false);assert.equal(s.adapter.closed,1);
 }finally{await s.close();}}
});

test('fork and owner replacement at the native or final publication boundary refuse stale config',async()=>{
 for(const hook of ['native','beforeSend']){const s=await seeded();try{const move=async()=>{s.adapter.identity.generation='replacement';s.adapter.view.revision='f'.repeat(64);};
  if(hook==='native')s.adapter.beforeReturn=move;else s.beforeSend=move;
  assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,503);assert.equal(s.adapter.closed,1);
 }finally{await s.close();}}
});

test('unknown source coverage is unavailable, never covered absence',async()=>{
 await assert.rejects(readAssetConfig({async get(){return {status:'unavailable',reason:'no seed coverage'};}},'atomicassets'),/coverage/);
 const s=await seeded();try{s.adapter.beforeReturn=async(_kind,answer)=>{answer.result={status:'unavailable',reason:'missing seed coverage'};};
  assert.equal((await s.api.inject('/atomicassets/v1/config')).statusCode,503);assert.equal(s.adapter.closed,1);
 }finally{await s.close();}
});
