import assert from 'node:assert/strict';
import test from 'node:test';
import {originalRules} from './fixtures/royalty-rule-original.mjs';

async function request(query={},options={}) {
 const o=originalRules('atomicmarket',{lists:{empty:[],ids:['001','-2','001'],nested:['$list:ids']}});
 try {const result=await o.response('collection',{route:'templates',query,...options});return {result,calls:o.calls};} finally{o.close();}
}
const one=async q=>(await request({template_id:q}));
test('pinned template builder preserves cardinality branches and literal operands',async()=>{
 for(const [input,fragment,expected] of [
  ['001','template_id = $3','001'],['001,-2','template_id = ANY($3)',['001','-2']],
  [Array(10).fill('1').join(','),'template_id = ANY($3)',Array(10).fill('1')],
  [Array(11).fill('1').join(','),'UNNEST($3::BIGINT[])',Array(11).fill('1')],
  [['NULL',...Array(10).fill('1')].join(','),'UNNEST($3::TEXT[])',['null',...Array(10).fill('1')]],
  ['9223372036854775808','template_id = $3','9223372036854775808'],
 ]) {const {result,calls}=await one(input);assert.equal(result.status,200);assert.match(calls[0].sql,new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.deepEqual(calls[0].values[2],expected);}
});
test('list expansion is one pass, preserves duplicates and absent lists remove membership',async()=>{
 let x=await one('$list:ids');assert.deepEqual(x.calls[0].values[2],['001','-2','001']);
 for(const input of ['$list:empty','$list:missing','']) {x=await one(input);assert.equal(x.result.status,200);assert.doesNotMatch(x.calls[0].sql,/template_id =/);}
 x=await one('$list:nested');assert.equal(x.result.status,400);assert.equal(x.calls.length,0);
});
test('validation order, ignored parameters, body precedence and numeric defaults are source-observed',async()=>{
 for(const input of ['+1','1.0','1,,2',' 1']) {const x=await one(input);assert.equal(x.result.status,400);assert.equal(x.result.body.message,'Invalid value for parameter template_id');assert.equal(x.calls.length,0);}
 let x=await request({template_id:'bad',page:'0',limit:'0'});assert.equal(x.result.body.message,'Invalid value for parameter template_id');
 x=await request({template_id:'1',page:'0',limit:'0'});assert.equal(x.result.body.message,'Invalid value for parameter page');
 x=await request({template_id:'1',page:'2',limit:'3',count:'true',sort:'bad',order:'bad',lower_bound:'bad',upper_bound:'bad'},{body:{template_id:'2'},method:'POST',rows:[{template_id:'2'}]});
 assert.equal(x.result.status,200);assert.deepEqual(x.result.body.data,[{template_id:'2'}]);assert.deepEqual(x.calls[0].values,['atomicmarket','collection','2',3]);assert.match(x.calls[0].sql,/ORDER BY template_id ASC/);
 x=await request({template_id:123,page:2,limit:3});assert.deepEqual(x.calls[0].values,['atomicmarket','collection',100,0]);
 x=await request({page:'9007199254740991',limit:'100'});assert.equal(x.result.status,200);assert.equal(x.calls[0].values.at(-1),(9007199254740991-1)*100);assert.equal(Number.isSafeInteger(x.calls[0].values.at(-1)),false);
});


test('attribute list access remains forbidden and template list reads are accounted',async()=>{
 const o=originalRules('atomicmarket',{lists:{ids:['1']}});try{
  await assert.rejects(o.assertAttributeListGuard(),/Attribute handler must not read operator lists/);
  await o.response('collection',{route:'attributes',query:{source:'1'}});assert.equal(o.listReads,0);
  const reply=await o.response('collection',{route:'templates',query:{template_id:'$list:ids'}});
  assert.equal(reply.status,200);assert.equal(o.listReads,1);
  await assert.rejects(o.assertAttributeListGuard(),/Attribute handler must not read operator lists/);
 }finally{o.close();}
});
