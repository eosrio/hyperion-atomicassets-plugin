import assert from 'node:assert/strict';
import test from 'node:test';
import {originalRules,manifest} from './fixtures/royalty-rule-original.mjs';
import {prepared,attribute,template,event,key,pageAnswer,parseRoyaltyAttributeParameters,limits,
 AtomicPlugin,ROYALTY_ATTRIBUTE_KIND,ROYALTY_TEMPLATE_KIND,ROYALTY_ATTRIBUTE_MODEL_ID,ROYALTY_ATTRIBUTE_COMPARISON,royaltyAttributeRows} from './fixtures/royalty-rule-component.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
const clean=(status,body)=>{const value=plain(body);if(value.success){assert.equal(typeof value.query_time,'number');delete value.query_time;}return{status,body:value};};
const publicRow=(table,row)=>{const{recordVersion,...data}=plain(row);assert.equal(recordVersion,1);if(table==='royaltyattr')data.source=Number(data.source);return data;};
const url=collection=>'/atomicmarket/v1/royalties/'+encodeURIComponent(collection)+'/attributes';
async function seeded(value=attribute(),options={}){const s=await prepared('royaltyattr',options);await s.execute([event(value)]);return s;}

test('two independent table declarations append without widening config or the21-kind compound',()=>{
 const plugin=new AtomicPlugin({limits:limits(),projectionId:'custom'}),r=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']});
 assert.deepEqual(r.projections.map(x=>x.definition.id),['custom','custom:royalty-config','custom:royalty-template-rules','custom:royalty-attribute-rules']);
 assert.equal(r.projections[0].definition.records.length,21);assert.equal(r.projections[1].definition.records.length,1);
 assert.deepEqual(r.projections[2].definition.records,[{kind:ROYALTY_TEMPLATE_KIND,integers:[]}]);assert.deepEqual(r.projections[3].definition.records,[{kind:ROYALTY_ATTRIBUTE_KIND,integers:[]}]);
 for(const[index,table]of [[2,'royaltytemp'],[3,'royaltyattr']]){const entry=r.projections[index];assert.deepEqual(entry.definition.selectors,[{id:'atomicmarket:table:'+table,contract:'atomicmarket',kind:'table',name:table}]);
  assert.deepEqual(entry.requiredSourceCapabilities,[]);assert.deepEqual(entry.limits,limits());}
 assert.equal(r.projections[2].requiredIndexedQueries,undefined);assert.equal(r.projections[3].requiredIndexedQueries.length,1);
});

test('actual SDK captures a no-join attribute model with explicit requiredSQL profile and inherited budgets',async()=>{
 const s=await prepared();try{
  assert.equal(manifest.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(Object.keys(manifest.sources).length,15);
  assert.equal(s.model.model.id,ROYALTY_ATTRIBUTE_MODEL_ID);assert.deepEqual(s.model.model.joins,[]);assert.equal(s.model.model.textComparison,ROYALTY_ATTRIBUTE_COMPARISON);
  assert.notEqual(ROYALTY_ATTRIBUTE_COMPARISON,'mongodb-simple-utf8-v1');assert.deepEqual(s.model.model.orders,[[{field:'rule_id',direction:'asc',nulls:'last'}]]);
  assert.equal(s.requirement.limits.readAttempts,limits().readAttempts);assert.equal(s.requirement.limits.responseRecords,limits().responseRecords);assert.equal(s.requirement.limits.responseBytes,limits().responseBytes);
  assert.equal(s.requirement.limits.queryBytes,Math.min(limits().inputBytes,limits().responseBytes));assert.equal(s.requirement.limits.orderTerms,1);
 }finally{await s.close();}
});

for(const table of ['royaltytemp','royaltyattr'])test('real original '+table+' callback agrees on insert, replacement, first-created, delete/recreate',async()=>{
 const make=table==='royaltytemp'?template:attribute,s=await prepared(table),o=originalRules();try{
  for(const[value,present,number]of [[make(),true,1],[make({recipients:[{recipient:'bob',weight:6}]}),true,2],[make(),false,3],[make(),true,4]]){
   await s.execute([event(value,{present})],{number});await o.apply(table,value,{present,blockNum:number,timeMs:1700000000000+number*1000});
   const row=await s.data();assert.deepEqual(row?publicRow(table,row):null,o.data(table,'collection','1'));
   if(row)assert.equal(row.created_at_block,number<3?'1':'4');
  }
  assert.equal(s.candidates.length,4);assert.equal(s.candidates[2].mutations[0].kind,'delete');
 }finally{o.close();await s.close();}
});

for(const table of ['royaltytemp','royaltyattr'])test('same-block '+table+' delete/recreate preserves actual callback order',async()=>{
 const make=table==='royaltytemp'?template:attribute,s=await prepared(table),o=originalRules();try{
  const events=[event(make()),event(make({recipients:[]}),{present:false}),event(make({recipients:[{recipient:'last',weight:8}]}))];
  const candidate=await s.execute(events);for(const e of events)await o.apply(table,e.data,{present:e.present});
  assert.deepEqual(candidate.mutations.map(x=>x.kind),['put','delete','put']);assert.deepEqual(publicRow(table,await s.data()),o.data(table,'collection','1'));
  assert.equal((await s.data()).recipients[0].recipient,'last');
 }finally{o.close();await s.close();}
});

test('actual contract-row scope and configured market win over decoded collection-like fields',async()=>{
 for(const table of ['royaltytemp','royaltyattr']){const make=table==='royaltytemp'?template:attribute,s=await prepared(table,{options:{marketContract:'othermarket',projectionId:'other'}}),o=originalRules('othermarket');try{
  const value=make({collection:'wrong',collection_name:'wrong',scope:'wrong'});
  await s.execute([event(value,{scope:'cats'}),event(value,{scope:'dogs'})]);
  for(const scope of ['cats','dogs']){await o.apply(table,value,{scope});const row=await s.data('1',scope);assert.equal(row.collection_name,scope);assert.equal(row.market_contract,'othermarket');assert.deepEqual(publicRow(table,row),o.data(table,scope,'1'));}
  assert.equal(await s.data(),null);
 }finally{o.close();await s.close();}}
});

test('bigint boundaries remain strings while signed16 source becomes its original JSON number',async()=>{
 for(const[index,weight,source]of [['9223372036854775807','-9223372036854775808',-32768],['-9223372036854775808','9223372036854775807',32767],['+0001','00005',0]]){
  const value=attribute({index,weight,source}),s=await seeded(value),o=originalRules();try{
   await o.apply('royaltyattr',value);const id=BigInt(index).toString(),row=await s.data(id),expected=o.data('royaltyattr','collection',id);
   assert.deepEqual(publicRow('royaltyattr',row),expected);assert.equal(typeof row.rule_id,'string');assert.equal(typeof row.weight,'string');assert.equal(typeof row.source,'string');
   s.plan(pageAnswer([row]));const actual=await s.api.inject(url('collection'));assert.equal(actual.statusCode,200);assert.deepEqual(actual.json().data,[expected]);assert.equal(typeof actual.json().data[0].source,'number');
  }finally{o.close();await s.close();}
 }
});

test('original JSONB encoder sanitizes metadata at its field boundary, not scalar text',async()=>{
 const value=attribute({value:['string','a\0b'],recipients:[{recipient:'a\0b',weight:5}],field:'literal\\u0000'}),s=await seeded(value),o=originalRules();try{
  await o.apply('royaltyattr',value);assert.deepEqual(publicRow('royaltyattr',await s.data()),o.data('royaltyattr','collection','1'));
  assert.deepEqual((await s.data()).value,['string','a b']);assert.equal((await s.data()).field,'literal\\u0000');
 }finally{o.close();await s.close();}
 for(const value of [attribute({field:'x\0y'}),attribute({value:['string','literal\\u0000']}),attribute({value:['string','\ud800']})]){
  const bad=await prepared(),original=originalRules();try{await assert.rejects(bad.execute([event(value)]));await assert.rejects(original.apply('royaltyattr',value));assert.equal(bad.candidates.length,0);}finally{original.close();await bad.close();}
 }
});

test('lookup_hash uses real Buffer.from hex behavior without inventing SHA constraints',async()=>{
 for(const lookup_hash of ['AB'.repeat(32),'abc','zz','aaZZbb','']){
  const value=attribute({lookup_hash}),s=await seeded(value),o=originalRules();try{await o.apply('royaltyattr',value);
   const row=await s.data();assert.equal(row.lookup_hash,Buffer.from(lookup_hash,'hex').toString('hex'));assert.deepEqual(publicRow('royaltyattr',row),o.data('royaltyattr','collection','1'));
  }finally{o.close();await s.close();}
 }
});

test('malformed or overflowing later input discards the complete SDK candidate',async()=>{
 for(const bad of [attribute({index:'9223372036854775808'}),attribute({weight:'-9223372036854775809'}),attribute({source:32768}),attribute({weight:Number.MAX_SAFE_INTEGER+1})]){
  const s=await prepared();try{const before=structuredClone(s.adapter.rows);await assert.rejects(s.execute([event(attribute()),event(bad)]));assert.deepEqual(s.adapter.rows,before);assert.equal(s.candidates.length,0);}finally{await s.close();}
 }
});

test('scope-less KV, wrong contract and wrong table never masquerade as original scoped rows',async()=>{
 for(const change of [{identity:{kind:'kv-primary',tableId:1,keyHex:'00'}},{contract:'foreign'},{name:'royaltyconf'}]){
  const s=await prepared();try{await assert.rejects(s.execute([event(attribute(),change)]));assert.equal(s.candidates.length,0);assert.equal(s.adapter.rows.size,0);}finally{await s.close();}
 }
});

test('fresh replay captures identical candidates and controlled rollback replaces only the rule view',async()=>{
 const a=await prepared(),b=await prepared(),o=originalRules();try{
  const input=[event(attribute())];await a.execute(input);await b.execute(input);await o.apply('royaltyattr',attribute());assert.equal(a.candidates[0].digest,b.candidates[0].digest);
  const saved=o.snapshot();await a.execute([event(attribute({weight:7}))]);await o.apply('royaltyattr',attribute({weight:7}),{blockNum:2,timeMs:1700000002000});
  a.rollback();o.rollback(saved);assert.deepEqual(publicRow('royaltyattr',await a.data()),o.data('royaltyattr','collection','1'));
  await a.execute([event(attribute({weight:9}))]);await o.apply('royaltyattr',attribute({weight:9}),{blockNum:2,timeMs:1700000002000});assert.deepEqual(publicRow('royaltyattr',await a.data()),o.data('royaltyattr','collection','1'));
  const restarted=await prepared();try{restarted.adapter.rows=structuredClone(a.adapter.rows);restarted.adapter.view=structuredClone(a.adapter.view);
   assert.deepEqual(await restarted.data(),await a.data());await restarted.execute([event(attribute(),{present:false})]);assert.equal(await restarted.data(),null);
  }finally{await restarted.close();}
 }finally{o.close();await a.close();await b.close();}
});

test('default page uses one real SDK composition and the original raw selected row envelope',async()=>{
 const s=await seeded(),o=originalRules();try{await o.apply('royaltyattr',attribute());const row=await s.data(),expected=await o.response('collection',{rows:[o.data('royaltyattr','collection','1')]});
  const parsed=parseRoyaltyAttributeParameters({},'atomicmarket','collection');s.plan(pageAnswer([row]),parsed);
  const actual=await s.api.inject(url('collection'));assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));
  assert.deepEqual(o.calls[0].values,['atomicmarket','collection',100,0]);assert.match(o.calls[0].sql,/ORDER BY rule_id ASC/);
  assert.deepEqual(s.hostCalls,[{projectionId:s.id,modelId:ROYALTY_ATTRIBUTE_MODEL_ID}]);assert.equal(s.adapter.queryCalls,1);assert.equal(s.adapter.kindCalls,0);assert.equal(s.adapter.getCalls,0);
 }finally{o.close();await s.close();}
});

test('source zero, literal field and numeric page order map to exact original SQL arguments',async()=>{
 const params={source:'000',field:'$list:literal',page:'2',limit:'2'},o=originalRules(),s=await prepared();try{
  const expected=await o.response('collection',{query:params}),query=parseRoyaltyAttributeParameters(params,'atomicmarket','collection');
  assert.deepEqual(query.where,[{field:'market_contract',op:'eq',value:'atomicmarket'},{field:'collection_name',op:'eq',value:'collection'},{field:'source',op:'eq',value:'0'},{field:'field',op:'eq',value:'$list:literal'}]);
  assert.equal(query.offset,'2');assert.deepEqual(query.order,[{field:'rule_id',direction:'asc',nulls:'last'}]);s.plan(pageAnswer(),query);
  const actual=await s.api.inject({url:url('collection'),query:params});assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));
  assert.deepEqual(o.calls[0].values,['atomicmarket','collection',0,'$list:literal',2]);assert.ok(o.calls[0].sql.includes('source = $3'));assert.ok(o.calls[0].sql.includes('field = $4'));
 }finally{o.close();await s.close();}
});

test('original400 field precedence survives ordinary Fastify before host or indexed reads',async()=>{
 for(const params of [{source:'bad',page:'0',limit:'0'},{source:'-1'},{source:'9007199254740992'},{page:'0',limit:'0'},{limit:'101'},{page:'1.5'}]){
  const o=originalRules(),s=await prepared();try{
   const expected=await o.response('collection',{query:params}),actual=await s.api.inject({url:url('collection'),query:params});
   assert.equal(expected.status,400);assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));assert.equal(o.calls.length,0);assert.equal(s.hostCalls.length,0);assert.equal(s.adapter.queryCalls,0);
  }finally{o.close();await s.close();}
 }
});

test('body overrides query while ignored count, sort, boundaries and template lists stay ignored',async()=>{
 const query={source:'bad',page:'0',count:'bad',sort:'bad',order:'bad',before:'bad',template_id:'$list:unavailable'},body={source:'0',page:'2',limit:'2'};
 const s=await prepared(),o=originalRules();try{const expected=await o.response('collection',{query,body}),parsed=parseRoyaltyAttributeParameters({...query,...body},'atomicmarket','collection');s.plan(pageAnswer(),parsed);
  const actual=await s.api.inject({method:'POST',url:url('collection'),query,payload:body});assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));assert.equal(s.adapter.queryCalls,1);assert.equal(parsed.kind,'page');
 }finally{o.close();await s.close();}
});

test('original nonstring/empty defaults and configured royalties maximum do not raise selected budgets',async()=>{
 const s=await prepared('royaltyattr',{options:{apiLimits:{royalties:2}}}),o=originalRules('atomicmarket',{maximum:2});try{
  const body={source:{bad:true},field:[],page:5,limit:0},query=parseRoyaltyAttributeParameters(body,'atomicmarket','collection',2);assert.equal(query.limit,2);assert.equal(query.offset,'0');assert.equal(query.where.length,2);s.plan(pageAnswer(),query);
  const expected=await o.response('collection',{body}),actual=await s.api.inject({method:'POST',url:url('collection'),payload:body});assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));
  assert.equal((await s.api.inject(url('collection')+'?limit=3')).statusCode,400);assert.equal(s.adapter.queryCalls,1);assert.equal(s.requirement.limits.readAttempts,limits().readAttempts);
 }finally{o.close();await s.close();}
 const parsed=parseRoyaltyAttributeParameters({source:'',field:''},'atomicmarket','collection',0);assert.equal(parsed.limit,100);assert.equal(parsed.where.length,2);
});

test('literal path collection is not name-validated or overridden by query/body',async()=>{
 for(const collection of ['BAD','payouts','longcollectionvalue']){
  const s=await prepared(),o=originalRules();try{const params={collection_name:'different',market_contract:'different'},query=parseRoyaltyAttributeParameters(params,'atomicmarket',collection);s.plan(pageAnswer(),query);
   const expected=await o.response(collection,{query:params}),actual=await s.api.inject({url:url(collection),query:params});assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));assert.equal(o.calls[0].values[1],collection);
  }finally{o.close();await s.close();}
 }
});

test('ALL methods and automatic HEAD preserve attribute bodies without adding count routes',async()=>{
 const s=await prepared(),o=originalRules();try{
  assert.equal(o.bindings.length,6);assert.ok(o.cachedOptions.every(x=>x===undefined));
  for(const method of ['GET','POST','PUT','PATCH','DELETE','OPTIONS']){s.plan();const expected=await o.response('collection',{method}),actual=await s.api.inject({method,url:url('collection')});assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));}
  s.plan();const head=await s.api.inject({method:'HEAD',url:url('collection')});assert.equal(head.statusCode,200);assert.equal(head.body,'');
  const before=s.adapter.queryCalls;assert.equal((await s.api.inject(url('collection')+'/_count')).statusCode,404);assert.equal(s.adapter.queryCalls,before);
 }finally{o.close();await s.close();}
});

test('ordinary Fastify early unavailable policy is503 retry/no-store and HEAD suppressed',async()=>{
 for(const options of [{withIndexed:false},{comparison:null}]){
  const s=await prepared('royaltyattr',options);try{const result=await s.api.inject(url('collection'));assert.equal(result.statusCode,503);assert.equal(result.headers['retry-after'],'1');assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.json().success,false);assert.equal(s.adapter.queryCalls,0);
   const head=await s.api.inject({method:'HEAD',url:url('collection')});assert.equal(head.statusCode,503);assert.equal(head.body,'');
   assert.equal((await s.api.inject(url('collection')+'?source=bad')).statusCode,400);assert.equal(s.adapter.queryCalls,0);
  }finally{await s.close();}
 }
});

test('covered empty page differs from incomplete source, pending fork and unavailable owner',async()=>{
 const ready=await prepared();try{ready.plan();const r=await ready.api.inject(url('collection'));assert.equal(r.statusCode,200);assert.deepEqual(r.json().data,[]);}finally{await ready.close();}
 for(const flag of ['incomplete','recovering','retired']){const s=await prepared();try{
  if(flag==='recovering')s.adapter.phase='recovering';else s.flags[flag]=true;
  assert.equal((await s.api.inject(url('collection'))).statusCode,503);assert.equal(s.adapter.queryCalls,0);
 }finally{await s.close();}}
});

test('numeric rule order and exact IDs are backend-returned, not application-sorted or coerced',async()=>{
 const s=await prepared();try{await s.execute([event(attribute({index:'9007199254740993'})),event(attribute({index:'10'})),event(attribute({index:'2'}))]);
  const rows=await Promise.all(['2','10','9007199254740993'].map(id=>s.data(id)));s.plan(pageAnswer(rows));const r=await s.api.inject(url('collection'));
  assert.equal(r.statusCode,200);assert.deepEqual(r.json().data.map(x=>x.rule_id),['2','10','9007199254740993']);assert.equal(typeof r.json().data[2].rule_id,'string');
 }finally{await s.close();}
});

test('wrong/partial results, canonical identity and unsafe attempts poison composition into unavailable',async()=>{
 for(const alter of [result=>{result.result.complete=false;},result=>{result.result={kind:'count',exact:true,value:'1'};},result=>{result.attempts=0;},
  result=>{result.view.revision='e'.repeat(64);},result=>{result.result.rows[0].key='foreign';},result=>{result.result.rows[0].records.rule.recordVersion=2;},
  result=>{result.result.rows[0].records.rule.lookup_hash='ABC';},result=>{result.result.rows[0].records.rule.source='01';}]){
  const s=await seeded();try{s.plan(pageAnswer([await s.data()])).alter=alter;assert.equal((await s.api.inject(url('collection'))).statusCode,503);assert.equal(s.adapter.acquired,s.adapter.closed);assert.equal(s.adapter.kindCalls,0);}finally{await s.close();}
 }
});

test('attempt/row/UTF8 budgets retain existing ceilings and never publish a truncated page',async()=>{
 const a=await seeded(attribute(),{bounds:{readAttempts:1}});try{a.plan(pageAnswer([await a.data()])).attempts=2;assert.equal((await a.api.inject(url('collection'))).statusCode,503);}finally{await a.close();}
 const b=await prepared('royaltyattr',{bounds:{responseRecords:1}});try{await b.execute([event(attribute()),event(attribute({index:'2'}))]);b.plan(pageAnswer([await b.data(),await b.data('2')]));assert.equal((await b.api.inject(url('collection'))).statusCode,503);}finally{await b.close();}
 const c=await seeded(attribute({value:['string','雪'.repeat(500)]}),{bounds:{responseBytes:1000}});try{c.plan(pageAnswer([await c.data()]));assert.equal((await c.api.inject(url('collection'))).statusCode,503);}finally{await c.close();}
});

test('request/owner/fork/publication guards survive awaits, serialization, onSend and retained cache metadata',async()=>{
 for(const point of ['await','serialize','send','fork']){
  const s=await seeded();try{s.plan(pageAnswer([await s.data()]),undefined,point==='await'?async()=>{await Promise.resolve();s.flags.cancelled=true;}:undefined);
   if(point==='serialize')s.beforeSerialize=async()=>{s.flags.retired=true;};if(point==='send')s.beforeSend=async()=>{s.flags.expired=true;};if(point==='fork')s.beforeSerialize=async()=>{s.adapter.view={...s.adapter.view,revision:'f'.repeat(64)};};
   const r=await s.api.inject(url('collection'));assert.equal(r.statusCode,503);assert.equal(r.headers['retry-after'],'1');assert.equal(r.headers['cache-control'],'no-store');assert.equal(s.adapter.acquired,s.adapter.closed);
  }finally{await s.close();}
 }
 const s=await seeded();try{s.plan(pageAnswer([await s.data()]));assert.equal((await s.api.inject(url('collection'))).statusCode,200);const guard=s.retained.at(-1);guard();s.flags.retired=true;assert.throws(guard);}finally{await s.close();}
});

test('static payout route before or after registration keeps its own precedence and ownership',async()=>{
 for(const before of [true,false]){const s=await prepared('royaltyattr',{...(before?{beforeRoutes:api=>api.all('/atomicmarket/v1/royalties/payouts',()=>({outside:true}))}:{})});try{
  if(!before)s.api.all('/atomicmarket/v1/royalties/payouts',()=>({outside:true}));
  assert.deepEqual((await s.api.inject('/atomicmarket/v1/royalties/payouts')).json(),{outside:true});assert.equal(s.adapter.queryCalls,0);
  s.plan();assert.equal((await s.api.inject(url('payouts'))).statusCode,200);assert.equal(s.adapter.queryCalls,1);
 }finally{await s.close();}}
});
