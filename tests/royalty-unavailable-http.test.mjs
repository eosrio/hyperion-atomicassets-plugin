// Ordinary Fastify error handling: no global remapping or physical services.
import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {AtomicPlugin,limits} from './fixtures/royalty-component.mjs';

function server(withCountedHost,before) {
 const api=Fastify(),counts={host:0,compositions:0,keyed:0};
 before?.(api);
 new AtomicPlugin({limits:limits()}).addRoutes(api,{
  statefulQueryHost(){throw new Error('The early royalty refusal must not use another query host');},
  ...(withCountedHost?{async statefulCompleteKindQueryHost(){counts.host++;return {
   async compose(_id,read){counts.compositions++;return {value:await read({async get(){counts.keyed++;return {status:'covered-absent'};}})};},
  };}}:{}),
 });
 return {api,counts};
}

for(const [withCountedHost,path,message] of [
  [true,'payouts','Royalty payouts are outside the configuration component'],
  [false,'collection','Counted royalty query host unavailable'],
])test('ordinary Fastify returns retryable Atomic unavailability before querying '+path,async()=>{
  const {api,counts}=server(withCountedHost);
  try {
   for(const method of ['GET','HEAD']) {
    const response=await api.inject({url:'/atomicmarket/v1/royalties/'+path,method});
    assert.equal(response.statusCode,503);assert.equal(response.headers['retry-after'],'1');
    assert.equal(response.headers['cache-control'],'no-store');assert.match(response.headers['content-type'],/^application\/json\b/);
    if(method==='HEAD')assert.equal(response.body,'');else assert.deepEqual(response.json(),{success:false,message});
    assert.deepEqual(counts,{host:0,compositions:0,keyed:0});
   }
  } finally {await api.close();}
});

test('ordinary Fastify retains static payout precedence before and after the wildcard',async()=>{
 for(const first of [true,false]) {
  const body={success:true,data:{outsideRoyaltyConfig:true}},staticRoute=api=>api.get('/atomicmarket/v1/royalties/payouts',()=>body);
  const {api,counts}=server(true,first?staticRoute:undefined);
  if(!first)staticRoute(api);
  try {for(const method of ['GET','HEAD']) {const r=await api.inject({url:'/atomicmarket/v1/royalties/payouts',method});
    assert.equal(r.statusCode,200);assert.equal(r.headers['retry-after'],undefined);
    if(method==='HEAD')assert.equal(r.body,'');else assert.deepEqual(r.json(),body);
  }assert.deepEqual(counts,{host:0,compositions:0,keyed:0});} finally {await api.close();}
 }
});
