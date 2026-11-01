import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {OperatorListError} from '@eosrio/hyperion-sdk/operator-lists';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const dist=resolve(process.env.ATOMIC_PLUGIN_DIST_ROOT ?? 'dist');
const {registerAtomicIdRoutes}=await import(pathToFileURL(resolve(dist,'http/id-routes.js')));
const {schemaFilters}=await import(pathToFileURL(resolve(dist,'atomicassets/internal/schema-query.js')));
const key=(...v)=>JSON.stringify(v), contract='atomicassets';
const collection={contract,collection_name:'cats',data:{name:'Cats',img:'i'},author:'alice',allow_notify:true,authorized_accounts:['alice'],notify_accounts:[],market_fee:0.1,created_at_block:'1',created_at_time:'1'};
const row=(name,time)=>({contract,collection_name:'cats',schema_name:name,format:[],types:[],created_at_block:'1',created_at_time:String(time)});
function fixture(withLists=true){
 const app=Fastify(); let compositions=0, calls=[]; const schemas=[row('old',1),row('zebra',3),row('alpha',3)];
 const reader={async all(kind){assert.equal(kind,'schema');return schemas.map(value=>({key:key(contract,'cats',value.schema_name),value}));},
   async get(kind,k){if(kind==='collection') return k===key(contract,'cats')?{status:'present',value:collection}:{status:'covered-absent'};
     if(kind==='schema-asset-count') return {status:'covered-absent'}; throw Error(kind);}};
 const host={async compose(id,fn){compositions++;return {value:await fn(reader)}}};
 const options={atomicassets:{projectionId:'p',contract},atomicmarket:{projectionId:'p',contract:'market'},queryHost:()=>host,completeKindQueryHost:async()=>host};
 if(withLists)options.operatorLists=()=>({async resolve(names){calls.push([...names]);return {source:'s',generation:'g',entries:names.map(name=>({name,items:name==='catslist'?['cats']:name==='missing'?[]:['zebra','alpha']}))}}});
 registerAtomicIdRoutes(app,options);return {app,calls,get compositions(){return compositions}};
}
const url=(a,b)=>`/atomicassets/v1/schemas/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;
test('schema route applies complete set, list batch, ordering and pinned wrapper',async()=>{
 const f=fixture();try{
  let r=await f.app.inject(url('$list:catslist','$list:schemas'));assert.equal(r.statusCode,200);const body=r.json();
  assert.equal(body.data.schema_name,'alpha');assert.equal(body.data.assets,0);assert.deepEqual(body.data.types,[]);assert.equal(body.data.collection.name,'Cats');
  assert.deepEqual(f.calls,[['catslist','schemas']]);assert.equal(f.compositions,1);
  r=await f.app.inject(url('$list:missing','old'));assert.equal(r.json().data.schema_name,'old');
  r=await f.app.inject(url('cats','absent'));assert.equal(r.statusCode,200);assert.equal(Object.hasOwn(r.json(),'data'),false);
  r=await f.app.inject(url('cats','BAD'));assert.equal(r.statusCode,400);assert.equal(r.json().message,'Invalid value for parameter schema_name');
 }finally{await f.app.close()}
});
test('literal only needs no list host; dynamic source absent returns retryable unavailable',async()=>{
 const f=fixture(false);try{assert.equal((await f.app.inject(url('cats','old'))).statusCode,200);const r=await f.app.inject(url('$list:x','old'));assert.equal(r.statusCode,503);assert.equal(r.json().code,'operator-list.unavailable');assert.equal(f.compositions,1)}finally{await f.app.close()}
});
test('mixed tokens, duplicates, nonrecursive expansion and malformed items',async()=>{
 const host={async resolve(names){assert.deepEqual(names,['x']);return {source:'s',generation:'g',entries:[{name:'x',items:['cats','cats']}]}}};
 await assert.rejects(schemaFilters('BAD','$list:x'),error=>error.parameter==='collection_name');
 assert.deepEqual(await schemaFilters('$list:x,cats,$list:x','old',host),{collections:['cats','cats','cats','cats','cats'],schemas:['old']});
 await assert.rejects(schemaFilters('$list:x','old',{async resolve(){return {source:'s',generation:'g',entries:[{name:'x',items:['$list:nested']}]}}}),/Invalid value/);
 await assert.rejects(schemaFilters('$list:x','old',{async resolve(){return {source:'s',generation:'g',entries:[]}}}),/Incomplete/);
});

test('collection validation precedes later list host construction, but same-field lists expand first',async()=>{
  const app=Fastify();let constructed=0, resolved=0, composed=0;
  const host={async compose(id,fn){composed++;return {value:await fn({async all(){return []}})}}};
  registerAtomicIdRoutes(app,{atomicassets:{projectionId:'p',contract},atomicmarket:{projectionId:'p',contract:'market'},queryHost:()=>host,
    completeKindQueryHost:async()=>host,operatorLists:()=>{constructed++;return {async resolve(){resolved++;throw Error('source unavailable')}}}});
  try {
    let response=await app.inject(url('BAD','$list:x'));assert.equal(response.statusCode,400);assert.equal(response.json().message,'Invalid value for parameter collection_name');
    assert.equal(constructed,0);assert.equal(resolved,0);assert.equal(composed,0);
    response=await app.inject(url('BAD,$list:x','old'));assert.equal(response.statusCode,500);assert.equal(constructed,1);assert.equal(resolved,1);assert.equal(composed,0);
    response=await app.inject(url('cats','old'));assert.equal(response.statusCode,200);assert.equal(constructed,1);assert.equal(resolved,1);assert.equal(composed,1);
  } finally {await app.close()}
});
test('same list name across both fields is resolved once before validation',async()=>{
  let calls=0;
  const filters=await schemaFilters('$list:x','$list:x',{async resolve(names){calls++;assert.deepEqual(names,['x']);return {source:'s',generation:'g',entries:[{name:'x',items:['cats']}]}}});
  assert.equal(calls,1);assert.deepEqual(filters,{collections:['cats'],schemas:['cats']});
});

test('SDK unavailability from factory or resolver maps to 503 and retains cause',async()=>{
  for(const fromFactory of [true,false]) {
    const app=Fastify(), original=new OperatorListError('unavailable'); let composed=0, observed;
    app.setErrorHandler((error,request,reply)=>{observed=error; reply.send(error)});
    const host={async compose(){composed++;throw Error('unexpected composition')}};
    registerAtomicIdRoutes(app,{atomicassets:{projectionId:'p',contract},atomicmarket:{projectionId:'p',contract:'market'},queryHost:()=>host,
      completeKindQueryHost:async()=>host,operatorLists:()=>{if(fromFactory)throw original;return {async resolve(){throw original}}}});
    try {const r=await app.inject(url('$list:x','old'));assert.equal(r.statusCode,503);assert.equal(r.headers['retry-after'],'1');
      assert.equal(r.headers['cache-control'],'no-store');assert.equal(observed.cause,original);assert.equal(composed,0);
    }finally{await app.close()}
  }
});
test('unknown resolver errors stay errors, not SDK unavailable',async()=>{
  const app=Fastify(), original=new Error('programmer error');let observed;
  app.setErrorHandler((error,request,reply)=>{observed=error;reply.send(error)});
  const host={async compose(){throw Error('unexpected composition')}};
  registerAtomicIdRoutes(app,{atomicassets:{projectionId:'p',contract},atomicmarket:{projectionId:'p',contract:'market'},queryHost:()=>host,
    completeKindQueryHost:async()=>host,operatorLists:()=>({async resolve(){throw original}})});
  try {const r=await app.inject(url('$list:x','old'));assert.equal(r.statusCode,500);assert.equal(observed,original)}finally{await app.close()}
});
