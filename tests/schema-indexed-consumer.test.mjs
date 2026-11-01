import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {originalSchemaList,manifest} from './fixtures/schema-list-original.mjs';
import {prepared,schema,collection,pageRow,pageAnswer,parseSchemaListParameters,jsonbText,SCHEMA_LIST_MODEL_ID,SCHEMA_LIST_COMPARISON,limits} from './fixtures/schema-indexed-component.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
const clean=(status,body)=>{const copy=plain(body);if(copy.success){assert.equal(typeof copy.query_time,'number');delete copy.query_time;}return {status,body:copy};};
const sqlRow=(s=schema(),c=collection(),assets=0,metadata={name:'Cats',img:null,images:'["x", 1]'})=>({contract:s.contract,schema_name:s.schema_name,collection_name:s.collection_name,
 authorized_accounts:c.authorized_accounts,format:s.format,types:s.types,created_at_block:s.created_at_block,created_at_time:s.created_at_time,assets,
 collection:{collection_name:c.collection_name,...metadata,author:c.author,allow_notify:c.allow_notify,authorized_accounts:c.authorized_accounts,notify_accounts:c.notify_accounts,
 market_fee:c.market_fee,created_at_block:c.created_at_block,created_at_time:c.created_at_time}});
const listResult=(names,values,source='operator',generation='configured-one')=>({source,generation,entries:names.map(name=>({name,items:values[name]??[]}))});
async function query(input={},maximum) {return parseSchemaListParameters(input,'atomicassets',undefined,maximum);}

test('pinned original source and full SQL model use existing state kinds and selected budgets',async()=>{
 assert.equal(manifest.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(Object.keys(manifest.sources).length,15);
 const s=await prepared();try{
  assert.equal(s.registration.definition.records.length,21);assert.equal(s.registration.requiredIndexedQueries.length,1);
  assert.equal(s.model.model.id,SCHEMA_LIST_MODEL_ID);assert.equal(s.model.model.textComparison,SCHEMA_LIST_COMPARISON);
  assert.notEqual(SCHEMA_LIST_COMPARISON,'mongodb-simple-utf8-v1');
  assert.deepEqual(s.model.model.joins.map(x=>[x.kind,x.mode]),[['collection','inner-one'],['schema-asset-count','left-one']]);
  assert.ok(s.model.model.fields.find(x=>x.id==='authorized_accounts').operators.includes('array-contains'));
  assert.equal(s.model.model.fields.find(x=>x.id==='assets').nullable,true);
  assert.equal(s.requirement.limits.readAttempts,limits().readAttempts);assert.equal(s.requirement.limits.responseRecords,limits().responseRecords);
  assert.equal(s.requirement.limits.responseBytes,limits().responseBytes);assert.ok(s.requirement.limits.queryBytes<=limits().inputBytes);
 }finally{await s.close();}
});

test('actual original handler/builder/formatter and actual SDK/Fastify composition agree on the default page',async()=>{
 const original=originalSchemaList({rows:[sqlRow()]}),s=await prepared();try{
  const parsed=await query();s.plan(pageAnswer(),parsed.request);
  const expected=await original.response(),actual=await s.api.inject('/atomicassets/v1/schemas');
  assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));
  assert.match(original.calls[0].sql,/ORDER BY created_at_time desc NULLS LAST, schema_name ASC/);
  assert.deepEqual(original.calls[0].values,['atomicassets',100,0]);assert.equal(s.adapter.queryCalls,1);assert.equal(s.adapter.kindCalls,0);assert.equal(s.adapter.getCalls,0);
  assert.deepEqual(s.hostCalls,[{projectionId:'atomicassets',modelId:SCHEMA_LIST_MODEL_ID}]);
 }finally{await s.close();}
});

test('all required filters and boundary/greylist conjunctions map to the original SQL arguments',async()=>{
 const params={page:'2',limit:'2',sort:'assets',order:'asc',authorized_account:'alice',collection_name:'cats,dogs',schema_name:'one,two',match:'o',
 lower_bound:'aaa',upper_bound:'zzz',before:'00100',after:'0001',ids:'first,last',collection_whitelist:'cats,dogs',collection_blacklist:'dogs',account_blacklist:'ignored'};
 const expected=[{field:'contract',op:'eq',value:'atomicassets'},{field:'collection_name',op:'in',values:['cats','dogs']},
 {field:'schema_name',op:'in',values:['one','two']},{field:'authorized_accounts',op:'array-contains',value:'alice'},{field:'schema_name',op:'text-contains',value:'o'},
 {field:'schema_name',op:'in',values:['first','last','one','two']},{field:'schema_name',op:'gte',value:'aaa'},{field:'schema_name',op:'lt',value:'zzz'},
 {field:'created_at_time',op:'lt',value:'100'},{field:'created_at_time',op:'gt',value:'1'},{field:'collection_name',op:'in',values:['cats']}];
 const parsed=await query(params);assert.deepEqual(parsed.request.where,expected);assert.equal(parsed.request.offset,'2');
 const original=originalSchemaList();await original.response(params);const {sql,values}=original.calls[0];
 for(const part of ['= ANY(authorized_accounts)','POSITION(','schema_name >=','schema_name <','created_at_time <','created_at_time >','ORDER BY ac.assets asc NULLS LAST, schema_name ASC'])assert.ok(sql.includes(part),part);
 // QueryBuilder optimizes singleton equality and reuses the identical LIMIT/OFFSET parameter.
 assert.deepEqual(values,['atomicassets',['cats','dogs'],['one','two'],'alice','o',['first','last','one','two'],'aaa','zzz',100,1,'cats',2]);
 const s=await prepared();try{s.plan(pageAnswer([]),{...parsed.request,where:expected});assert.equal((await s.api.inject({url:'/atomicassets/v1/schemas',query:params})).statusCode,200);assert.equal(s.adapter.queryCalls,1);}finally{await s.close();}
});

test('every order/direction retains NULLS LAST and the source secondary term without a new tiebreak',async()=>{
 for(const sort of ['created','schema_name','assets'])for(const direction of ['asc','desc']){
  const params={sort,order:direction},parsed=await query(params),original=originalSchemaList();await original.response(params);
  const field=sort==='created'?'created_at_time':sort;assert.deepEqual(parsed.request.order,[{field,direction,nulls:'last'},...(sort==='schema_name'?[]:[{field:'schema_name',direction:'asc',nulls:'last'}])]);
  assert.match(original.calls[0].sql,new RegExp('ORDER BY '+(sort==='assets'?'ac\\.assets':field)+' '+direction+' NULLS LAST, schema_name ASC'));
 }
});

test('whitelist intersection can be empty while missing/empty filters are removed',async()=>{
 assert.deepEqual((await query({collection_whitelist:'cats',collection_blacklist:'cats'})).request.where.at(-1),{field:'collection_name',op:'in',values:[]});
 assert.deepEqual((await query({collection_blacklist:'cats'})).request.where.at(-1),{field:'collection_name',op:'not-in',values:['cats']});
 assert.deepEqual((await query({collection_name:'',schema_name:''})).request.where,[{field:'contract',op:'eq',value:'atomicassets'}]);
 const original=originalSchemaList();await original.response({collection_whitelist:'cats',collection_blacklist:'cats'});assert.deepEqual(original.calls[0].values[1],[]);
});

test('one request list provider preserves original field/token order, duplicates and one-pass expansion',async()=>{
 const values={cats:['cats'],schemas:['one','one'],missing:[],nested:['$list:cats']},calls=[];
 const s=await prepared({lists:async names=>{calls.push([...names]);return listResult(names,values);}});try{
  const params={collection_name:'$list:cats',schema_name:'$list:schemas',ids:'$list:schemas',collection_whitelist:'$list:missing'};
  const original=originalSchemaList({lists:values});await original.response(params);s.plan(pageAnswer([]));
  assert.equal((await s.api.inject({url:'/atomicassets/v1/schemas',query:params})).statusCode,200);
  assert.equal(s.listFactories.length,1);assert.deepEqual(calls,[['cats'],['schemas'],['missing']]);assert.deepEqual(original.listCalls,['cats','schemas','missing']);
  const bad=await s.api.inject({url:'/atomicassets/v1/schemas',query:{collection_name:'$list:nested'}});assert.equal(bad.statusCode,400);assert.equal(s.adapter.queryCalls,1);
  assert.equal(original.cacheOptions[0].maxAge,300000);assert.equal(original.cacheOptions[0].isPromise,true);
 }finally{await s.close();}
});

test('validation order keeps an earlier400 ahead of later unavailable lists',async()=>{
 const lists={late:new Error('reference source unavailable')},original=originalSchemaList({lists}),calls=[];
 const expected=await original.response({collection_name:'BAD',schema_name:'$list:late'});assert.equal(expected.status,400);assert.deepEqual(original.listCalls,[]);
 const s=await prepared({lists:async names=>{calls.push(names);throw lists.late;}});try{
  const actual=await s.api.inject({url:'/atomicassets/v1/schemas',query:{collection_name:'BAD',schema_name:'$list:late'}});
  assert.equal(actual.statusCode,400);assert.equal(actual.json().message,expected.body.message);assert.deepEqual(calls,[]);assert.equal(s.adapter.queryCalls,0);
 }finally{await s.close();}
});

test('whole-field source expansion is preserved; portable unavailable lists use the approved retry policy',async()=>{
 const original=originalSchemaList({lists:{late:new Error('source unavailable')}});assert.equal((await original.response({collection_name:'BAD,$list:late'})).status,400);assert.deepEqual(original.listCalls,['late']);
 const s=await prepared({lists:async()=>{throw new Error('unavailable');}});try{
  const r=await s.api.inject({url:'/atomicassets/v1/schemas',query:{collection_name:'BAD,$list:late'}});assert.equal(r.statusCode,503);assert.equal(r.headers['retry-after'],'1');assert.equal(r.headers['cache-control'],'no-store');assert.equal(s.adapter.queryCalls,0);
 }finally{await s.close();}
});

test('list source/generation or malformed/partial results refuse instead of mixing field data',async()=>{
 const invalid=[undefined,{source:'s',generation:'g',entries:[]},{source:'s',generation:'g',entries:[{name:'wrong',items:[]}]},
 {source:'s',generation:'g',entries:[{name:'a',items:[1]}]},{source:'',generation:'g',entries:[{name:'a',items:[]}]}];
 for(const answer of invalid){const s=await prepared({lists:async()=>answer});try{assert.equal((await s.api.inject({url:'/atomicassets/v1/schemas',query:{collection_name:'$list:a'}})).statusCode,503);assert.equal(s.adapter.queryCalls,0);}finally{await s.close();}}
 const s=await prepared({lists:async names=>listResult(names,{},'s',names[0])});try{assert.equal((await s.api.inject({url:'/atomicassets/v1/schemas',query:{collection_name:'$list:a',schema_name:'$list:b'}})).statusCode,503);assert.equal(s.adapter.queryCalls,0);}finally{await s.close();}
});

test('body overrides query and _count forces count after merge, preserving original validation',async()=>{
 const original=originalSchemaList({count:'5'}),s=await prepared();try{
  const query={page:'0',count:'bad',schema_name:'BAD'},body={page:'2',count:'false',schema_name:'one'};
  const expected=await original.response(query,body,true),parsed=await parseSchemaListParameters({...query,...body,count:'true'},'atomicassets');s.plan({kind:'count',exact:true,value:'5'},parsed.request);
  const actual=await s.api.inject({method:'POST',url:'/atomicassets/v1/schemas/_count',query,payload:body});assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body));
  assert.equal(original.calls.length,1);assert.ok(!original.calls[0].sql.includes('LIMIT'));assert.equal(s.adapter.queryCalls,1);
 }finally{await s.close();}
});

test('original400 parameter names/order and nonstring/empty defaults match without query access',async()=>{
 for(const [parameter,value]of [['page','0'],['limit','1001'],['sort','other'],['order','ASC'],['authorized_account','BAD'],['collection_name','BAD'],['schema_name','BAD'],['match','BAD'],['count','yes'],['before','0'],['after','0'],['collection_blacklist','BAD'],['account_blacklist','BAD']]){
  const original=originalSchemaList(),expected=await original.response({[parameter]:value}),s=await prepared();try{
   const actual=await s.api.inject({url:'/atomicassets/v1/schemas',query:{[parameter]:value}});assert.deepEqual(clean(actual.statusCode,actual.json()),clean(expected.status,expected.body),parameter);assert.equal(s.adapter.queryCalls,0);
  }finally{await s.close();}
 }
 const parsed=await query({page:2,limit:0,sort:[],collection_name:[],count:true});assert.equal(parsed.request.kind,'page');assert.equal(parsed.request.limit,100);assert.equal(parsed.request.offset,'0');
});

test('original namespace maximum is separate from unchanged selected read ceilings',async()=>{
 const s=await prepared({options:{apiLimits:{schemas:2}}}),original=originalSchemaList({maximum:2});try{
  const parsed=await query({},2);assert.equal(parsed.request.limit,2);s.plan(pageAnswer([]),parsed.request);
  assert.equal((await s.api.inject('/atomicassets/v1/schemas')).statusCode,200);await original.response();assert.deepEqual(original.calls[0].values,['atomicassets',2,0]);
  const r=await s.api.inject('/atomicassets/v1/schemas?limit=3');assert.equal(r.statusCode,400);assert.equal(s.adapter.queryCalls,1);assert.equal(s.requirement.limits.responseRecords,limits().responseRecords);
 }finally{await s.close();}
});

test('offset retains actual original arithmetic, while count-only never evaluates pagination overflow',async()=>{
 const params={page:String(Number.MAX_SAFE_INTEGER),limit:'1000'},parsed=await query(params),original=originalSchemaList();await original.response(params);
 assert.equal(parsed.request.offset,String(original.calls[0].values.at(-1)));
 const s=await prepared({options:{apiLimits:{schemas:2000}}});try{
  const r=await s.api.inject({url:'/atomicassets/v1/schemas',query:{...params,limit:'2000'}});assert.equal(r.statusCode,503);assert.equal(r.headers['cache-control'],'no-store');assert.equal(s.adapter.queryCalls,0);
  s.plan({kind:'count',exact:true,value:'5'});assert.equal((await s.api.inject({url:'/atomicassets/v1/schemas/_count',query:{...params,limit:'2000'}})).json().data,'5');
 }finally{await s.close();}
});

test('count-only returns exact decimal strings and performs no formatter/counted-kind work',async()=>{
 for(const value of ['0','5','9223372036854775807']){const s=await prepared(),original=originalSchemaList({count:value});try{
  s.plan({kind:'count',exact:true,value});const a=await s.api.inject('/atomicassets/v1/schemas/_count?page=99&limit=1&sort=assets'),o=await original.response({page:'99',limit:'1',sort:'assets'},{},true);
  assert.deepEqual(clean(a.statusCode,a.json()),clean(o.status,o.body));assert.equal(typeof a.json().data,'string');assert.equal(s.adapter.kindCalls,0);assert.equal(s.adapter.getCalls,0);
 }finally{await s.close();}}
});

test('zero versus absent aggregates retain distinct query values and the original numeric display',async()=>{
 const a=pageRow(schema({schema_name:'zero'}),collection(),{contract:'atomicassets',collection_name:'cats',schema_name:'zero',assets:'0'}),b=pageRow(schema({schema_name:'missing'}));
 const original=originalSchemaList({rows:[sqlRow(a.records.schema,a.records.collection),sqlRow(b.records.schema,b.records.collection)]}),s=await prepared();try{
  s.plan(pageAnswer([a,b]));const r=await s.api.inject('/atomicassets/v1/schemas?sort=assets');assert.deepEqual(clean(r.statusCode,r.json()),clean(200,(await original.response({sort:'assets'})).body));
  assert.equal(a.fields.assets,'0');assert.equal(b.fields.assets,null);assert.ok(r.json().data.every(row=>row.assets===0));
 }finally{await s.close();}
});

test('page int32 aggregate overflow returns original500 while exact count remains available',async()=>{
 const s=await prepared(),a={contract:'atomicassets',collection_name:'cats',schema_name:'one',assets:'2147483648'};try{
  s.plan(pageAnswer([pageRow(schema(),collection(),a)]));const r=await s.api.inject('/atomicassets/v1/schemas?sort=assets');assert.equal(r.statusCode,500);assert.deepEqual(r.json(),{success:false,message:'Internal Server Error'});
  s.plan({kind:'count',exact:true,value:'5'});assert.equal((await s.api.inject('/atomicassets/v1/schemas/_count?sort=assets')).json().data,'5');
 }finally{await s.close();}
});

test('typed descriptors, nontext SQL extraction and literal schema backslashes match original formatting',async()=>{
 const c=collection({data:{name:{a:1},img:true,images:[1,'x']}}),row=schema({format:[{name:'literal\\u0000',type:'string'},{name:'image',type:'string'}],types:[{name:'image',mediatype:'video',info:'exact'}]}),
 original=originalSchemaList({rows:[sqlRow(row,c,0,{name:'{"a": 1}',img:'true',images:'[1, "x"]'})]}),s=await prepared();try{
  s.plan(pageAnswer([pageRow(row,c)]));const a=await s.api.inject('/atomicassets/v1/schemas'),o=await original.response();assert.deepEqual(clean(a.statusCode,a.json()),clean(o.status,o.body));assert.deepEqual(a.json().data[0].types,row.types);
 }finally{await s.close();}
});

test('JSONB view text vectors follow pinned engine layout without changing query collation',()=>{
 for(const [input,expected]of [[null,null],[42,'42'],[false,'false'],['literal\\u0000','literal\\u0000'],[[1,'x'],'[1, "x"]'],[{long:1,b:2,aa:3},'{"b": 2, "aa": 3, "long": 1}'],[1e21,'1000000000000000000000'],[1e-7,'0.0000001'],[-0,'0']])assert.equal(jsonbText(input),expected);
 for(const input of ['\0','\ud800',Infinity])assert.throws(()=>jsonbText(input));
});

test('original null authored types/format produce empty arrays instead of invented descriptors',async()=>{
 const row=schema({format:null,types:null}),original=originalSchemaList({rows:[sqlRow(row)]}),s=await prepared();try{
  s.plan(pageAnswer([pageRow(row)]));const a=await s.api.inject('/atomicassets/v1/schemas'),o=await original.response();
  assert.deepEqual(clean(a.statusCode,a.json()),clean(o.status,o.body));assert.deepEqual(a.json().data[0].types,[]);assert.deepEqual(a.json().data[0].format,[]);
 }finally{await s.close();}
});

test('empty/past-end pages and equal-key peers keep the adapter window/order exactly',async()=>{
 const s=await prepared();try{
  s.plan(pageAnswer([]));assert.deepEqual((await s.api.inject('/atomicassets/v1/schemas?page=99')).json().data,[]);
  const peers=[pageRow(schema({collection_name:'dogs'}),collection({collection_name:'dogs'})),pageRow()];s.plan(pageAnswer(peers));const r=await s.api.inject('/atomicassets/v1/schemas');assert.deepEqual(r.json().data.map(x=>x.collection.collection_name),['dogs','cats']);
 }finally{await s.close();}
});

test('missing host and unsupported comparison profile return ordinary retryable503 without scans',async()=>{
 for(const mode of ['missing','profile']){const s=await prepared({withIndexed:mode!=='missing'});try{
  if(mode==='profile')s.adapter.indexedCapabilities.comparisonProfiles=['mongodb-simple-utf8-v1'];
  for(const method of ['GET','HEAD']){const r=await s.api.inject({url:'/atomicassets/v1/schemas',method});assert.equal(r.statusCode,503);assert.equal(r.headers['retry-after'],'1');assert.equal(r.headers['cache-control'],'no-store');if(method==='HEAD')assert.equal(r.body,'');else assert.equal(r.json().success,false);}
  assert.equal(s.adapter.queryCalls,0);assert.equal(s.adapter.getCalls,0);assert.equal(s.adapter.kindCalls,0);
 }finally{await s.close();}}
});

test('the declared unsupported indexed model leaves existing get and complete-kind ID ports usable',async()=>{
 const s=await prepared(),api=Fastify();try{
  const c=collection({data:{name:'Cats',img:null,images:'gallery'}}),r=schema();
  s.adapter.rows.set('collection',new Map([[JSON.stringify(['atomicassets','cats']),c]]));
  s.adapter.rows.set('schema',new Map([[JSON.stringify(['atomicassets','cats','one']),r]]));
  const requirement=s.registration.requiredCompleteKindRead;s.adapter.completeKindCapabilities=requirement;
  const selection=owner.negotiateStatefulCompleteKindV1(s.declaration,requirement.limits,requirement,requirement);
  s.plugin.addRoutes(api,{statefulQueryHost:()=>({compose:(_id,use)=>owner.composeStatefulOwnerReadV2(s.declaration,s.adapter,s.adapter.identity,s.adapter.view,use,s.adapter.guard)}),
   statefulCompleteKindQueryHost:async()=>({completeKindCapabilities:requirement,compose:(_id,use)=>owner.composeStatefulOwnerCompleteKindReadV1(selection,s.adapter,s.adapter.identity,s.adapter.view,use,s.adapter.guard)}),
   statefulIndexedQueryHost:async()=>{throw new Error('Full SQL comparison is not offered');}});
  assert.equal((await api.inject('/atomicassets/v1/collections/cats')).statusCode,200);
  assert.equal((await api.inject('/atomicassets/v1/schemas/cats/one')).statusCode,200);
  assert.equal((await api.inject('/atomicassets/v1/schemas')).statusCode,503);assert.equal(s.adapter.queryCalls,0);
  assert.ok(s.adapter.getCalls>0);assert.equal(s.adapter.kindCalls,1);
 }finally{await api.close();await s.close();}
});

test('all methods and automatic successful HEAD retain the original list/count envelope',async()=>{
 const s=await prepared();try{for(const method of ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD']){s.plan(pageAnswer([]));const r=await s.api.inject({url:'/atomicassets/v1/schemas',method});assert.equal(r.statusCode,200);if(method==='HEAD')assert.equal(r.body,'');else assert.deepEqual(r.json().data,[]);}
 }finally{await s.close();}
});

test('SDK rejects malformed/partial/foreign windows and keeps selected totals',async()=>{
 for(const alter of [a=>{a.result.complete=false;},a=>{a.result.rows[0].records.collection.contract='other';},a=>{a.attempts=65;},a=>{a.view.generation='other';}]){const s=await prepared();try{
  s.plan().alter=alter;assert.equal((await s.api.inject('/atomicassets/v1/schemas')).statusCode,503);assert.equal(s.adapter.acquired,s.adapter.closed);assert.equal(s.adapter.kindCalls,0);
 }finally{await s.close();}}
 const s=await prepared({bounds:{responseRecords:1}});try{s.plan(pageAnswer([pageRow(),pageRow(schema({schema_name:'two'}))]));assert.equal((await s.api.inject('/atomicassets/v1/schemas')).statusCode,503);}finally{await s.close();}
});

test('request/list/view and final publication guards survive awaited query, serialization and retained cache metadata',async()=>{
 for(const point of ['await','serialize','send','fork']){const s=await prepared();try{
  s.plan(pageAnswer(),undefined,point==='await'?async()=>{await Promise.resolve();s.flags.cancelled=true;}:undefined);
  if(point==='serialize')s.beforeSerialize=async()=>{s.flags.retired=true;};
  if(point==='send')s.beforeSend=async()=>{s.flags.expired=true;};
  if(point==='fork')s.beforeSerialize=async()=>{s.adapter.view={...s.adapter.view,revision:'f'.repeat(64)};};
  const r=await s.api.inject('/atomicassets/v1/schemas');assert.equal(r.statusCode,503);assert.equal(r.headers['cache-control'],'no-store');assert.equal(s.adapter.acquired,s.adapter.closed);
 }finally{await s.close();}}
 const s=await prepared();try{s.plan();assert.equal((await s.api.inject('/atomicassets/v1/schemas')).statusCode,200);const guard=s.retained.at(-1);guard();s.flags.retired=true;assert.throws(guard);}finally{await s.close();}
});
