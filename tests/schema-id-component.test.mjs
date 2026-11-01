import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
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
 assert.deepEqual(await schemaFilters('$list:x,cats,$list:x','old',host),{collections:['cats','cats','cats','cats','cats'],schemas:['old']});
 await assert.rejects(schemaFilters('$list:x','old',{async resolve(){return {source:'s',generation:'g',entries:[{name:'x',items:['$list:nested']}]}}}),/Invalid value/);
 await assert.rejects(schemaFilters('$list:x','old',{async resolve(){return {source:'s',generation:'g',entries:[]}}}),/Incomplete/);
});
