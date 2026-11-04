import test from 'node:test';
import assert from 'node:assert/strict';
import {originalRules} from './fixtures/royalty-rule-original.mjs';
import {prepared,template,event,key,limits,AtomicPlugin,ROYALTY_TEMPLATE_MODEL_ID,ROYALTY_TEMPLATE_COMPARISON} from './fixtures/royalty-rule-component.mjs';
const url='/atomicmarket/v1/royalties/collection/templates',clean=body=>{const result=JSON.parse(JSON.stringify(body));delete result.query_time;return result;};
const page=rows=>({kind:'page',complete:true,rows:rows.map(row=>({key:key(row.template_id,row.collection_name,row.market_contract),fields:{market_contract:row.market_contract,collection_name:row.collection_name,template_id:row.template_id},records:{rule:row}}))});
const publicRow=row=>{const {recordVersion,...value}=structuredClone(row);assert.equal(recordVersion,1);return value;};
const lists={more:['001','-2','-0'],empty:[]};
test('engineering opt-in changes only template query declaration; default does not register route',async()=>{
 const context={binding:{},sourceCapabilities:['original-action-authorization-v1']},base=new AtomicPlugin({limits:limits()}),on=new AtomicPlugin({limits:limits(),engineeringRoyaltyTemplateQuery:true});
 const a=base.getStatefulProjectionsV2(context).projections,b=on.getStatefulProjectionsV2(context).projections;
 assert.equal(a[2].requiredIndexedQueries,undefined);assert.equal(b[2].requiredIndexedQueries[0].model.id,ROYALTY_TEMPLATE_MODEL_ID);
 for(const i of [0,1,3])assert.deepEqual(a[i].definition,b[i].definition);
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
