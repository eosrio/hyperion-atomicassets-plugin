import test from 'node:test';
import assert from 'node:assert/strict';
import {originalRules} from './fixtures/royalty-rule-original.mjs';
import {prepared,template,event,key,limits,AtomicPlugin,ROYALTY_TEMPLATE_MODEL_ID,ROYALTY_TEMPLATE_COMPARISON} from './fixtures/royalty-rule-component.mjs';
import {parseRoyaltyTemplateParameters} from '../dist/atomicmarket/internal/royalty-template-query.js';
const url='/atomicmarket/v1/royalties/collection/templates',clean=body=>{const result=JSON.parse(JSON.stringify(body));delete result.query_time;return result;};
const page=rows=>({kind:'page',complete:true,rows:rows.map(row=>({key:key(row.template_id,row.collection_name,row.market_contract),fields:{market_contract:row.market_contract,collection_name:row.collection_name,template_id:row.template_id},records:{rule:row}}))});
const publicRow=row=>{const {recordVersion,...value}=structuredClone(row);assert.equal(recordVersion,1);return value;};
const lists={more:['001','-2','-0'],empty:[]};
test('engineering opt-in changes only template query declaration; default does not register route',async()=>{
 const context={binding:{},sourceCapabilities:['original-action-authorization-v1']},base=new AtomicPlugin({limits:limits()}),on=new AtomicPlugin({limits:limits(),engineeringRoyaltyTemplateQuery:true});
 const a=base.getStatefulProjectionsV2(context).projections,b=on.getStatefulProjectionsV2(context).projections;
 assert.equal(a[2].requiredIndexedQueries,undefined);assert.equal(b[2].requiredIndexedQueries[0].model.id,ROYALTY_TEMPLATE_MODEL_ID);
 for(const i of [0,1,3])assert.deepEqual(a[i].definition,b[i].definition);
 const combined=new AtomicPlugin({limits:limits(),engineeringRoyaltyTemplateQuery:true,ownedSchemaCounts:true}).getStatefulProjectionsV2(context).projections;
 assert.ok(combined[0].definition.records.some(x=>x.kind==='owned-schema-count'));
 assert.ok(combined[0].requiredIndexedQueries.some(x=>x.model.id==='atomicassets-owned-schemas'));
 assert.equal(combined[2].requiredIndexedQueries[0].model.id,ROYALTY_TEMPLATE_MODEL_ID);
 const s=await prepared('royaltytemp');try{assert.equal((await s.api.inject(url)).statusCode,404);}finally{await s.close();}
});
function queryPort(rows){return async(sql,values)=>{let chosen=rows.slice();const membership=sql.match(/template_id = (?:ANY\(\$(\d+)\)|\$(\d+))/)||sql.match(/UNNEST\(\$(\d+)::BIGINT\[\]\)/);
 if(membership){const raw=values[Number(membership[1]||membership[2])-1],set=new Set((Array.isArray(raw)?raw:[raw]).map(v=>BigInt(v).toString()));chosen=chosen.filter(r=>set.has(r.template_id));}
 chosen.sort((a,b)=>BigInt(a.template_id)<BigInt(b.template_id)?-1:BigInt(a.template_id)>BigInt(b.template_id)?1:0);
 const offset=Number(values[Number(sql.match(/OFFSET \$(\d+)/)[1])-1]),limit=Number(values[Number(sql.match(/LIMIT \$(\d+)/)[1])-1]);return {rows:chosen.slice(offset,offset+limit).map(publicRow)};};}
test('pinned original handler and SDK/Fastify agree on canonical integer one-of, boundaries, lists and paging',async()=>{
 const s=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true},lists:()=>({async resolve(names){return {source:'fixture',generation:'one',entries:names.map(name=>({name,items:lists[name]??[]}))};}})}),rows=[];
 try{for(const id of ['-2','0','1','2','10','9223372036854775807']){await s.execute([event(template({template_id:id,recipients:[]}))]);rows.push(await s.data(id));}
  assert.equal(s.model.model.id,ROYALTY_TEMPLATE_MODEL_ID);assert.equal(s.model.model.textComparison,ROYALTY_TEMPLATE_COMPARISON);assert.deepEqual(s.model.model.fields.find(f=>f.id==='template_id').operators,['eq','in']);
  for(const query of [{},{template_id:'1'},{template_id:'1,2'},{template_id:'1,2,3,4,5,6,7,8,9,10'},{template_id:'1,2,3,4,5,6,7,8,9,10,11'},
   {template_id:'001,-2,-0'},{template_id:'1,1,2'},{template_id:'$list:more'},{template_id:'$list:empty'},{page:'2',limit:'2'},{count:'true',sort:'bad'}]){
   const o=originalRules('atomicmarket',{lists,queryPort:queryPort(rows)});try{const expected=await o.response('collection',{route:'templates',query});assert.equal(expected.status,200);
    const ids=expected.body.data.map(r=>r.template_id),selected=ids.map(id=>rows.find(r=>r.template_id===id));s.plan(page(selected));
    const actual=await s.api.inject({url,query});assert.equal(actual.statusCode,200);assert.deepEqual(clean(actual.json()),clean(expected.body));
    if(query.template_id?.includes(',')){const kind=query.template_id.split(',').length;assert.match(o.calls[0].sql,kind>10?/UNNEST/:/ANY/);}
    const predicate=s.queries.at(-1).where.find(x=>x.field==='template_id');
    if(query.template_id==='1')assert.deepEqual(predicate,{field:'template_id',op:'eq',value:'1'});
    if(query.template_id==='001,-2,-0')assert.deepEqual(predicate,{field:'template_id',op:'in',values:['1','-2','0']});
    if(query.template_id==='1,1,2')assert.deepEqual(predicate,{field:'template_id',op:'in',values:['1','1','2']});
    if(query.template_id==='1,2,3,4,5,6,7,8,9,10,11')assert.equal(predicate.values.length,11);
   }finally{o.close();}
  }
  assert.equal(s.adapter.kindCalls,0);assert.equal(s.adapter.getCalls,0);
 }finally{await s.close();}
});
test('body override, supported methods and list identity changes preserve bounded behavior',async()=>{
 let generation='one';const s=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true},lists:()=>({async resolve(names){return {source:'fixture',generation,entries:names.map(name=>({name,items:['1']}))};}})});
 try{await s.execute([event(template())]);const value=await s.data();s.plan(page([value]));
  const r=await s.api.inject({method:'POST',url:url+'?template_id=bad',payload:{template_id:'001',page:'1'}});assert.equal(r.statusCode,200);assert.deepEqual(s.queries.at(-1).where.at(-1),{field:'template_id',op:'eq',value:'1'});
  s.plan(page([]));const head=await s.api.inject({method:'HEAD',url});assert.equal(head.statusCode,200);assert.equal(head.body,'');
  let calls=0;const mismatch=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true},lists:()=>({async resolve(names){return {source:'fixture',generation:++calls===1?'one':'two',entries:names.map(name=>({name,items:['1']}))};}})});
  try{const failed=await mismatch.api.inject({url,query:{template_id:'$list:a,$list:b'}});assert.equal(failed.statusCode,503);assert.equal(mismatch.adapter.queryCalls,0);}finally{await mismatch.close();}
 }finally{await s.close();}
});
test('validation precedes unavailable DB outcomes, list provider and late host publication remain fenced',async()=>{
 const s=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true},lists:()=>({async resolve(names){return {source:'fixture',generation:'one',entries:names.map(name=>({name,items:lists[name]??[]}))};}})});
 try{for(const [query,status] of [[{template_id:'+1',page:'0'},400],[{template_id:'null',page:'0'},400],[{template_id:'null'},503],[{template_id:'9223372036854775808'},503]]){
   const r=await s.api.inject({url,query});assert.equal(r.statusCode,status);if(status===400)assert.match(r.json().message,/template_id|page/);}
  s.plan(page([]));s.beforeSend=()=>{s.flags.retired=true;};const r=await s.api.inject(url);assert.equal(r.statusCode,503);assert.equal(r.headers['cache-control'],'no-store');
 }finally{await s.close();}
});
test('raw bytes and token count refuse before provider creation or token expansion',async()=>{
 let providers=0;const host=()=>{providers++;throw Error('provider must not run');},bounds={queryBytes:16,setValues:2};
 for(const input of ['$list:x,1,2','$list:'+('x'.repeat(20)),'雪'.repeat(6)])
  await assert.rejects(parseRoyaltyTemplateParameters({template_id:input},'atomicmarket','collection',bounds,host),e=>e.code==='stateful.unavailable');
 assert.equal(providers,0);
});
test('pagination raw bytes are charged before list provider and only once',async()=>{
 let providers=0;const host=()=>{providers++;return {async resolve(names){return {source:'s',generation:'g',entries:[{name:names[0],items:['1']}]};}};};
 for(const name of ['page','limit']) await assert.rejects(parseRoyaltyTemplateParameters({template_id:'$list:a',[name]:'0'.repeat(64)+'1'},'atomicmarket','collection',{queryBytes:64,setValues:2},host),e=>e.code==='stateful.unavailable');
 assert.equal(providers,0);
 const result=await parseRoyaltyTemplateParameters({template_id:'1',page:'01',limit:'2'},'atomicmarket','collection',{queryBytes:4,setValues:2});
 assert.equal(result.offset,'0');assert.equal(result.limit,2);
 const s=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true},bounds:{inputBytes:64},lists:host});
 try{const response=await s.api.inject({url,query:{template_id:'$list:a',page:'0'.repeat(64)+'1'}});assert.equal(response.statusCode,503);assert.equal(providers,0);assert.equal(s.adapter.queryCalls,0);}finally{await s.close();}
});
test('expanded list counts and UTF8 bytes are cumulative before further providers or conversion',async()=>{
 let calls=0,reads=0;const huge=Array(3);Object.defineProperty(huge,0,{get(){reads++;throw Error('unexpected item read');}});
 const over=()=>({async resolve(names){calls++;return {source:'s',generation:'g',entries:[{name:names[0],items:huge}]};}});
 await assert.rejects(parseRoyaltyTemplateParameters({template_id:'$list:x,$list:y'},'atomicmarket','collection',{queryBytes:100,setValues:2},over),e=>e.code==='stateful.unavailable');
 assert.equal(calls,1);assert.equal(reads,0);
 calls=0;const repeated=()=>({async resolve(names){calls++;return {source:'s',generation:'g',entries:[{name:names[0],items:['1','2']}]};}});
 await assert.rejects(parseRoyaltyTemplateParameters({template_id:'$list:x,$list:x'},'atomicmarket','collection',{queryBytes:100,setValues:3},repeated),e=>e.code==='stateful.unavailable');assert.equal(calls,1);
 const wide=()=>({async resolve(names){return {source:'s',generation:'g',entries:[{name:names[0],items:['雪雪']}]};}});
 await assert.rejects(parseRoyaltyTemplateParameters({template_id:'$list:x'},'atomicmarket','collection',{queryBytes:14,setValues:2},wide),e=>e.code==='stateful.unavailable');
});
test('within bounds reference validation order remains intact and scalar equality permits zero set budget',async()=>{
 const bounds={queryBytes:100,setValues:0};
 const query=await parseRoyaltyTemplateParameters({template_id:'001'},'atomicmarket','collection',bounds);assert.deepEqual(query.where.at(-1),{field:'template_id',op:'eq',value:'1'});
 const zeros=await parseRoyaltyTemplateParameters({template_id:'-'.concat('0'.repeat(200),'1')},'atomicmarket','collection',{queryBytes:256,setValues:0});assert.equal(zeros.where.at(-1).value,'-1');
 await assert.rejects(parseRoyaltyTemplateParameters({template_id:'9'.repeat(20)},'atomicmarket','collection',bounds),e=>e.code==='stateful.unavailable');
 await assert.rejects(parseRoyaltyTemplateParameters({template_id:'bad',page:'0'},'atomicmarket','collection',bounds),/parameter template_id/);
 await assert.rejects(parseRoyaltyTemplateParameters({template_id:'null',page:'0'},'atomicmarket','collection',bounds),/parameter page/);
 await assert.rejects(parseRoyaltyTemplateParameters({template_id:'1',page:'01'},'atomicmarket','collection',{queryBytes:2,setValues:1}),e=>e.code==='stateful.unavailable');
});
test('route forwards parser budgets and refuses excess before indexed host or list resolution',async()=>{
 let calls=0;const selected=limits(),s=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true},bounds:{value:{...selected.value,arrayElements:2}},lists:()=>({async resolve(){calls++;throw Error('must not run');}})});
 try{const response=await s.api.inject({url,query:{template_id:'$list:a,1,2'}});assert.equal(response.statusCode,503);assert.equal(response.headers['cache-control'],'no-store');assert.equal(calls,0);assert.equal(s.adapter.queryCalls,0);}finally{await s.close();}
});
