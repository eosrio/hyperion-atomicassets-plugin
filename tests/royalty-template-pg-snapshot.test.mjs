import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepared,template,event,key} from './fixtures/royalty-rule-component.mjs';
const snapshot=JSON.parse(await readFile(new URL('./fixtures/royalty-template-pg16-ci-snapshot.json',import.meta.url)));
const empty=()=>({kind:'page',complete:true,rows:[]});
const asPage=rows=>({kind:'page',complete:true,rows:rows.map(row=>({key:key(row.template_id,row.collection_name,row.market_contract),fields:{market_contract:row.market_contract,collection_name:row.collection_name,template_id:row.template_id},records:{rule:row}}))});
// Independent finite evaluator of the SDK request; it is not a MongoDB adapter or a physical query.
function evaluate(request,rows){
 assert.equal(request.kind,'page');assert.deepEqual(request.order,[{field:'template_id',direction:'asc',nulls:'last'}]);
 let result=rows.filter(row=>request.where.every(p=>p.op==='eq'?row[p.field]===p.value:p.op==='in'&&p.values.includes(row[p.field])));
 result.sort((a,b)=>BigInt(a.template_id)<BigInt(b.template_id)?-1:BigInt(a.template_id)>BigInt(b.template_id)?1:0);
 const start=BigInt(request.offset);return asPage(start>BigInt(rows.length)?[]:result.slice(Number(start),Number(start)+request.limit));
}
test('candidate HTTP over a simulated indexed reader agrees with retained physical PostgreSQL successes',async()=>{
 assert.equal(snapshot.provenance.head,'a537b5eb533d507077c52b4cd06b8267f374e618');
 assert.deepEqual(snapshot.provenance.artifacts.map(x=>x.artifactId),['13300421049','13300146695']);
 const pg=snapshot.royaltyTemplate;assert.equal(pg.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(pg.metadata.server_version,'16.15');
 const names=['none','scalar','two','ten','eleven','weak','duplicates','safe-offset','unsafe-offset','ignored'];
 const state=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true}});
 try{
  const ids=pg.physicalRows.map(x=>x.template_id);assert.deepEqual(ids,['-2','0','1','2','10','9223372036854775807']);
  await state.execute(ids.map(id=>event(template({template_id:id,recipients:[]}),{scope:'oracle'})),{number:1,timeMs:'1'});
  const rows=[];for(const id of ids)rows.push(await state.data(id,'oracle'));
  for(const name of names){
   const original=pg.results.find(x=>x.name===name);assert.ok(original);assert.equal(original.http.status,200);
   const plan=state.plan(empty());plan.before=({request})=>{plan.answer=evaluate(request,rows);};
   const response=await state.api.inject({url:'/atomicmarket/v1/royalties/oracle/templates',query:original.query});
   assert.equal(response.statusCode,200,name);const body=response.json();assert.equal(typeof body.query_time,'number');delete body.query_time;
   assert.deepEqual(body,original.http.body,name);
  }
  assert.equal(state.adapter.queryCalls,names.length);assert.equal(state.adapter.kindCalls,0);assert.equal(state.adapter.getCalls,0);
 }finally{await state.close();}
});
test('physical SQL errors remain explicit unavailable rather than fabricated parity',async()=>{
 const pg=snapshot.royaltyTemplate,state=await prepared('royaltytemp',{options:{engineeringRoyaltyTemplateQuery:true}});
 try{
  for(const [name,code] of [['null-one','22P02'],['null-two','22P02'],['null-eleven','42883'],['overflow-one','22003'],['overflow-two','22003'],['overflow-eleven','22003']]){
   const original=pg.results.find(x=>x.name===name);assert.equal(original.http.status,500);assert.equal(original.dbError.code,code);
   const response=await state.api.inject({url:'/atomicmarket/v1/royalties/oracle/templates',query:original.query});assert.equal(response.statusCode,503,name);assert.equal(response.headers['cache-control'],'no-store');
  }
  const invalid=pg.results.find(x=>x.name==='invalid-before-sql');assert.equal(invalid.http.status,400);assert.equal(invalid.sql,null);
  const response=await state.api.inject({url:'/atomicmarket/v1/royalties/oracle/templates',query:invalid.query});assert.equal(response.statusCode,400);
  assert.equal(state.adapter.queryCalls,0);
 }finally{await state.close();}
});
test('finite reader rejects foreign scope and applies membership, numeric order and offset',()=>{
 const rows=[{market_contract:'atomicmarket',collection_name:'oracle',template_id:'10'},{market_contract:'atomicmarket',collection_name:'oracle',template_id:'2'},{market_contract:'other',collection_name:'oracle',template_id:'2'},{market_contract:'atomicmarket',collection_name:'other',template_id:'2'}];
 const request={kind:'page',where:[{field:'market_contract',op:'eq',value:'atomicmarket'},{field:'collection_name',op:'eq',value:'oracle'},{field:'template_id',op:'in',values:['10','2']}],order:[{field:'template_id',direction:'asc',nulls:'last'}],offset:'1',limit:1};
 assert.deepEqual(evaluate(request,rows).rows.map(row=>row.fields.template_id),['10']);
});
