import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import Fastify from 'fastify';
import {executeReferenceFixture} from '../harness/shared/reference.mjs';
import {registerAtomicIdRoutes} from '../dist/http/id-routes.js';
const contract='atomicmarket', key=name=>JSON.stringify([contract,name]);
const rows=[{market_contract:contract,marketplace_name:'one',creator:'bob',created_at_block:'9007199254740993',created_at_time:'1700000000000'}, {market_contract:contract,marketplace_name:'two',creator:'alice',created_at_block:'123',created_at_time:'1700000000001'}];
const selected=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='market_contract'));
const sort=a=>[...a].sort((a,b)=>a.marketplace_name.localeCompare(b.marketplace_name));
const fixture=JSON.parse(await readFile(new URL('../fixtures/harness/atomicmarket/marketplace.input.json',import.meta.url)));
async function appFor(records, fail=false){const app=Fastify(); app.setErrorHandler((_e,_q,r)=>r.code(503).send({success:false}));
 registerAtomicIdRoutes(app,{atomicassets:{projectionId:'p',contract:'atomicassets'},atomicmarket:{projectionId:'p',contract},queryHost:()=>{throw Error('wrong host');},
  completeKindQueryHost:async(_request,id)=>{assert.equal(id,'p');return {async compose(_id,cb){if(fail)throw Error('unavailable');return {value:await cb({all:async kind=>{assert.equal(kind,'marketplace');return records;}})};}};}});return app;}
const records=values=>values.map(value=>({key:key(value.marketplace_name),value}));
test('pinned original SQL callback and HTTP compare empty and multiple complete rows; ignored inputs and methods',async()=>{
 const receipts=[];
 for(const values of [[],rows]) for(const method of ['GET','POST','HEAD']){
  const f=structuredClone(fixture);f.request={method,path:'/atomicmarket/v1/marketplaces?limit=1&sort=bad'};
  if(method==='POST')f.request.body={limit:1,sort:'bad',marketplace_name:'missing'};
  f.queries[1]={sql:'SELECT marketplace_name, creator, created_at_block, created_at_time FROM atomicmarket_marketplaces WHERE market_contract = $1',parameters:[contract],rows:values.map(selected)};
  const original=await executeReferenceFixture({referenceRoot:process.env.AA_REFERENCE_ROOT,fixture:f});
  const app=await appFor(records(values));try{const response=await app.inject({method,url:f.request.path,...(f.request.body ? {payload:f.request.body} : {})});
   assert.equal(response.statusCode,original.response.status);if(method!=='HEAD'){const body=response.json();assert.equal(body.success,true);assert.deepEqual(sort(body.data),sort(original.response.body.data));}
   receipts.push({original,plugin:{status:response.statusCode,body:method==='HEAD'?null:response.json()}});
  }finally{await app.close();}
 }
 await mkdir('out/marketplace-list',{recursive:true});await writeFile('out/marketplace-list/receipts-'+process.version+'.json',JSON.stringify(receipts,null,2));
});
test('foreign, malformed, wrong key and unavailable reads cannot yield partial success',async()=>{
 for(const bad of [[{...rows[0],market_contract:'other'}],[{...rows[0],created_at_time:42}],[{...rows[0],creator:null}]]){
  const app=await appFor(records(bad));try{assert.equal((await app.inject('/atomicmarket/v1/marketplaces')).statusCode,503);}finally{await app.close();}}
 const app=await appFor([{key:'wrong',value:rows[0]}]);try{assert.equal((await app.inject('/atomicmarket/v1/marketplaces')).statusCode,503);}finally{await app.close();}
 const unavailable=await appFor([],true);try{assert.equal((await unavailable.inject('/atomicmarket/v1/marketplaces')).statusCode,503);}finally{await unavailable.close();}
});
