import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {registerAtomicIdRoutes} from '../dist/http/id-routes.js';
import * as asset from './fixtures/asset-domain-cases.mjs';
import * as market from './fixtures/fixed-sale-cases.mjs';
const stage=structuredClone(asset.fixture.stages[0]);
const current=market.expected.lightCases.find(c=>c.name==='current');
const rawSale=structuredClone(current.view);rawSale.assets=[asset.input.assetId];
rawSale.collection={...structuredClone(stage.view.collection),market_fee:current.sale.collection_fee};
rawSale.current_collection_fee=stage.collections[0].market_fee;
const original = (await import('../harness/shared/reference.mjs')).executeOriginalIdHttpControls;
const route=(kind,id)=>'/'+(kind==='asset'?'atomicassets/v1/assets/':'atomicmarket/v1/sales/')+encodeURIComponent(id);
const clean=response=>{const body=response.json();if(body.success){assert.ok(Number.isSafeInteger(body.query_time));delete body.query_time;}return {status:response.statusCode,body};};
const cases=[];
for(const kind of ['asset','sale'])for(const id of [kind==='asset'?asset.input.assetId:market.input.saleId,
  '0'+(kind==='asset'?asset.input.assetId:market.input.saleId),'-0','-1','+1','null','NuLl','NULL','bad','1.0'])
  cases.push({name:kind+':'+id,kind,id,assetRows:/^0*9007199254740993$/.test(id)?[stage.view]:[],saleRows:/^0*9007199254740993$/.test(id)?[rawSale]:[]});
for(const kind of ['asset','sale'])cases.push({name:kind+':absent',kind,id:'42',assetRows:[],saleRows:[]});
cases.push({name:'sale:absent-asset',kind:'sale',id:market.input.saleId,assetRows:[],saleRows:[rawSale]});
let originalResult;
const oracle=()=>originalResult??=original({referenceRoot:process.env.AA_REFERENCE_ROOT,input:{cases}});
test('actual original handlers observe permissive ID forms through HTTP injection',async()=>{
  const result=await oracle();assert.equal(result.bindings.length,10);assert.equal(result.listenerAttempts,0);
  for(const c of result.cases){
    const valid=c.input.toLowerCase()==='null'||/^-?\d+$/.test(c.input);
    assert.equal(c.calls.length>0,valid);
    if(valid){const passed=c.kind==='asset'?c.calls[0].params[1][0]:c.calls[0].params[1];
      assert.equal(passed,c.input.toLowerCase()==='null'?'null':c.input);}
    if(!valid)assert.deepEqual({status:c.status,body:c.body},{status:400,body:{success:false,message:'Invalid value for parameter '+(c.kind==='asset'?'asset_id':'sale_id')}});
    console.log(JSON.stringify({originalHttp:true,kind:c.kind,input:c.input,status:c.status,queryParameters:c.calls.map(c=>c.params),physicalPostgres:false}));
  }
});

const key=(...parts)=>JSON.stringify(parts),projection='http-controlled';
function controlled(options={}) {
  const values=new Map(),known=new Set(),reads=[],compositions=[],errors=[];
  const set=(kind,k,value)=>{known.add(kind+':'+k);if(value===null)values.delete(kind+':'+k);else values.set(kind+':'+k,structuredClone(value));};
  set('asset',key(asset.input.contract,asset.input.assetId),stage.asset);
  set('collection',key(asset.input.contract,asset.input.collection),stage.collections[0]);
  set('schema',key(asset.input.contract,asset.input.collection,asset.input.schema),{...stage.schemas[0],schema_digest:asset.digest(stage.schemas[0].format)});
  for(const kind of ['template-link','backed-tokens','original-mint'])set(kind,key(asset.input.contract,asset.input.assetId),null);
  set('market-sale',key(market.input.marketContract,market.input.saleId),current.sale);
  set('offer',key(asset.input.contract,market.input.offerId),current.relations.offer);
  set('offer-assets',key(asset.input.contract,market.input.offerId),{...current.relations.offerAssets,asset_ids:[asset.input.assetId]});
  set('market-token',key(market.input.marketContract,'WAX'),current.relations.token);
  set('symbol-pair',key(market.input.marketContract,'WAX','WAX'),null);set('contract-code',key('seller'),null);
  for(const id of ['42','0']){set('asset',key(asset.input.contract,id),null);set('market-sale',key(market.input.marketContract,id),null);}
  const app=Fastify();app.setErrorHandler((error,request,reply)=>{errors.push(error);reply.code(503).send({success:false,message:'State unavailable'});});
  const reader={async get(kind,k){assert.equal(this,reader);reads.push({kind,key:k,reader});
    if(options.failRead?.(kind,k))throw options.error;
    if(!known.has(kind+':'+k))throw options.error??Error('Controlled view has no coverage');
    return values.has(kind+':'+k)?{status:'present',value:structuredClone(values.get(kind+':'+k))}:{status:'covered-absent'};}};
  const host={async compose(id,callback){compositions.push(id);if(options.failOpen)throw options.error;
    const value=await callback(reader);if(options.failAfter)throw options.error;
    return {view:{controlled:true},value};}};
  registerAtomicIdRoutes(app,{atomicassets:{projectionId:projection,contract:asset.input.contract},
    atomicmarket:{projectionId:projection,contract:market.input.marketContract},queryHost(request){assert.ok(request.id);return host;}});
  return {app,set,reads,compositions,errors};
}
const expected=(result,name)=>{const c=result.cases.find(c=>c.name===name);assert.ok(c,name);const body=structuredClone(c.body);delete body.query_time;return{status:c.status,body};};
test('asset and sale HTTP bodies equal the original handlers in one caller-owned composition',async()=>{
  const result=await oracle(),p=controlled();try{
    for(const kind of ['asset','sale'])for(const id of [asset.input.assetId,'0'+asset.input.assetId,'42','-0','bad','+1','1.0']){
      const before=p.compositions.length;
      const response=await p.app.inject({url:route(kind,id)});
      const name=id==='42'?kind+':absent':kind+':'+id;
      assert.deepEqual(clean(response),expected(result,name));
      assert.equal(p.compositions.length,before+1);assert.equal(p.compositions.at(-1),projection);
    }
    assert.ok(p.reads.some(r=>r.kind==='market-sale'));assert.ok(p.reads.some(r=>r.kind==='asset'));
    assert.ok(p.reads.every(r=>r.reader===p.reads[0].reader));
  }finally{await p.app.close();}
});
test('sale HTTP retains original covered-absent asset ID fallback',async()=>{
  const result=await oracle(),p=controlled();p.set('asset',key(asset.input.contract,asset.input.assetId),null);
  try{assert.deepEqual(clean(await p.app.inject({url:route('sale',market.input.saleId)})),expected(result,'sale:absent-asset'));}
  finally{await p.app.close();}
});
test('valid but unqualified null, negative and overflow forms remain unavailable',async()=>{
  const p=controlled();try{
    for(const kind of ['asset','sale'])for(const id of ['null','NuLl','NULL','-1','9223372036854775808']){
      assert.equal((await p.app.inject({url:route(kind,id)})).statusCode,503);
      assert.equal(p.errors.at(-1).name,kind==='asset'?'AssetDomainUnavailable':'FixedSaleUnavailable');
    }
    assert.equal(p.reads.length,0);
  }finally{await p.app.close();}
});
test('unknown projection/open and late completion failures preserve host error ownership',async()=>{
  for(const flag of ['failOpen','failAfter']){
    const error=Error(flag),p=controlled({[flag]:true,error});try{
      for(const kind of ['asset','sale']){
        const response=await p.app.inject({url:route(kind,asset.input.assetId)});assert.equal(response.statusCode,503);
        assert.equal(p.errors.at(-1),error);assert.equal(response.json().success,false);
      }
    }finally{await p.app.close();}
  }
});
test('relationship scope failures and missing template joins cannot become absence or success',async()=>{
  for(const kind of ['asset','sale']){
    const error=Error('reader fence changed'),p=controlled({failRead:k=>k==='schema',error});
    try{assert.equal((await p.app.inject({url:route(kind,asset.input.assetId)})).statusCode,503);assert.equal(p.errors.at(-1),error);}
    finally{await p.app.close();}
    const q=controlled();q.set('asset',key(asset.input.contract,asset.input.assetId),{...stage.asset,template_id:'1'});
    q.set('template',key(asset.input.contract,'1'),null);
    try{assert.equal((await q.app.inject({url:route(kind,asset.input.assetId)})).statusCode,503);assert.equal(q.errors.at(-1).name,'AssetDomainUnavailable');}
    finally{await q.app.close();}
  }
});
test('routes remain additive and POST uses the same original ID contract',async()=>{
  const p=controlled();try{
    p.app.get('/existing',()=>({existing:true}));assert.deepEqual((await p.app.inject('/existing')).json(),{existing:true});
    const result=await oracle();assert.deepEqual(clean(await p.app.inject({method:'POST',url:route('sale',market.input.saleId)})),expected(result,'sale:'+market.input.saleId));
  }finally{await p.app.close();}
});
