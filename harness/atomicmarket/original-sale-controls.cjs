'use strict';
// Unmodified original callbacks/scheduler. The finite storage and view model are NOT SQL engines.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join, relative, sep} = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const copy = value => structuredClone(value);
const json = value => JSON.parse(JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const fixtureRoot = join(__dirname, '../../fixtures/harness/atomicmarket/lifecycle');
const EXISTING = 'SELECT state, listing_price, offer_id, assets_contract FROM atomicmarket_sales WHERE market_contract = $1 AND sale_id = $2';
const COUNT = 'SELECT COUNT(*) FROM atomicassets_offers_assets WHERE contract = $1 AND offer_id = $2';

function logical(row) {
  const result = copy(row);
  for (const field of ['created_at_block','created_at_time','updated_at_block','updated_at_time']) result[field] = String(result[field]);
  return result;
}

// Independently selected fields of the pinned SQL, for the no-symbol-pair subset only.
// This model is labeled separately from the executed original formatter and callbacks.
function lightModel(sale, relations) {
  const {offer,collection,token,offerAssets,symbolPair,sellerCode} = relations;
  assert.equal(symbolPair, null, 'Delphi view computation is not modeled');
  if (sale.offer_id === null || !offer || !collection || !token) return null;
  assert.equal(offer.contract, sale.assets_contract); assert.equal(offer.offer_id, sale.offer_id);
  assert.equal(collection.contract, sale.assets_contract); assert.equal(collection.collection_name, sale.collection_name);
  assert.equal(token.market_contract, sale.market_contract); assert.equal(token.token_symbol, sale.settlement_symbol);
  return {market_contract:sale.market_contract,assets_contract:sale.assets_contract,sale_id:sale.sale_id,
    seller:sale.seller,buyer:sale.buyer,offer_id:sale.offer_id,raw_price:sale.final_price ?? sale.listing_price,
    raw_token_precision:token.token_precision,raw_token_symbol:token.token_symbol,
    price:{token_contract:token.token_contract,token_symbol:token.token_symbol,token_precision:token.token_precision,median:null},
    listing_price:sale.listing_price,listing_symbol:sale.listing_symbol,assets:offerAssets ? copy(offerAssets.asset_ids) : [],
    maker_marketplace:sale.maker_marketplace,taker_marketplace:sale.taker_marketplace,collection_name:sale.collection_name,
    collection:{collection_name:collection.collection_name,name:collection.data.name ?? null,img:collection.data.img ?? null,
      images:collection.data.images ?? null,author:collection.author,allow_notify:collection.allow_notify,
      authorized_accounts:copy(collection.authorized_accounts),notify_accounts:copy(collection.notify_accounts),
      market_fee:sale.collection_fee,created_at_block:collection.created_at_block,created_at_time:collection.created_at_time},
    sale_state:sale.state,offer_state:offer.state,is_seller_contract:sellerCode !== null,
    updated_at_block:sale.updated_at_block,updated_at_time:sale.updated_at_time,
    created_at_block:sale.created_at_block,created_at_time:sale.created_at_time,current_collection_fee:collection.market_fee};
}

module.exports = async function originalSaleControls(fromReference, referenceRoot) {
  const inputBytes = readFileSync(join(fixtureRoot,'input.json'));
  const provenance = JSON.parse(readFileSync(join(fixtureRoot,'provenance.json')));
  assert.equal(provenance.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  assert.equal(sha(inputBytes),provenance.input.sha256); assert.ok(inputBytes.length < 65536);
  const input = JSON.parse(inputBytes); assert.equal(input.cases.length,14);
  for (const source of provenance.sources) {
    const retained = readFileSync(join(fixtureRoot,'original',source.path));
    assert.equal(sha(retained),source.sha256);
    const blob = execFileSync('git',['show',provenance.commit+':'+source.path],{cwd:referenceRoot,timeout:10000,maxBuffer:2*1024*1024});
    assert.deepEqual(blob,retained);
    assert.equal(readFileSync(join(referenceRoot,source.path),'utf8').replaceAll('\r\n','\n'),blob.toString());
  }
  const {default:DataProcessor,ProcessingState} = fromReference('./src/filler/processor.ts');
  const {saleProcessor} = fromReference('./src/filler/handlers/atomicmarket/processors/sales.ts');
  const {formatSale} = fromReference('./src/api/namespaces/atomicmarket/format.ts');
  const {AtomicMarketUpdatePriority,SaleState} = fromReference('./src/filler/handlers/atomicmarket/index.ts');
  assert.equal(AtomicMarketUpdatePriority.ACTION_CREATE_SALE,1020);
  assert.equal(AtomicMarketUpdatePriority.ACTION_UPDATE_SALE,1040);
  assert.equal(SaleState.SOLD,3);
  const cases = [];
  let sequence = 9007199254741993n;
  for (const scenario of input.cases) {
    assert.ok(scenario.blocks.length <= 6);
    let state = new Map(); const calls=[],notifications=[],executed=[],queued=[],snapshots=[];
    const processor = new DataProcessor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true});
    const register = processor.onActionTrace.bind(processor);
    processor.onActionTrace = (account,name,callback,priority,...rest) => register(account,name,async(...args)=>{
      executed.push({name,priority,block:args[1].block_num}); return callback(...args);
    },priority,...rest);
    const release = saleProcessor({args:{atomicmarket_account:input.marketContract,atomicassets_account:input.assetsContract},
      config:{version:scenario.version ?? input.version},v2MarkerBlock:scenario.markerBlock ?? null},processor,
      {sendActionTrace(channel,b,tx,trace){assert.ok(notifications.length<64);notifications.push(json({channel,block:b,tx,trace}));}});
    const registrations=processor.getActiveListeners().trace_listeners.map(({action,priority})=>({action,priority}));
    try {
      for (const entry of scenario.blocks) {
        assert.ok(entry.events.length <= 8);
        const b={block_num:input.baseBlock+entry.offset,block_id:(entry.offset+1).toString(16).padStart(64,'0'),
          timestamp:new Date(Date.parse(input.baseTime+'Z')+entry.offset*1000).toISOString().slice(0,-1)};
        const candidate=copy(state);
        const record=call=>{assert.ok(calls.length<128);calls.push(json(call));};
        const db={async insert(table,data,keys,...args){
          assert.equal(table,'atomicmarket_sales');assert.deepEqual(keys,['market_contract','sale_id']);assert.deepEqual(args,[true,true,'update']);
          assert.ok(candidate.size<8);candidate.set(data.sale_id,copy(data));record({operation:'insert',table,data,keys,args});
        },async update(table,data,where,keys){
          assert.equal(table,'atomicmarket_sales');assert.equal(where.str,'market_contract = $1 AND sale_id = $2');
          assert.deepEqual(keys,['market_contract','sale_id']);assert.equal(where.values[0],input.marketContract);
          const old=candidate.get(where.values[1]);if(old)Object.assign(old,copy(data));
          record({operation:'update',table,data,where,keys,scriptedAffectedRows:old?1:0});
        },async query(sql,params){
          let rows;
          if(sql===EXISTING){assert.equal(params[0],input.marketContract);const row=candidate.get(params[1]);
            rows=row?[Object.fromEntries(['state','listing_price','offer_id','assets_contract'].map(k=>[k,row[k]]))]:[];
          }else if(sql===COUNT){assert.equal(params[0],input.assetsContract);assert.ok(Object.hasOwn(scenario.offerCounts??{},params[1]));
            rows=[{count:String(scenario.offerCounts[params[1]])}];
          }else {record({operation:'query-refused',sql,params});throw Error('Unscripted original SQL query');}
          record({operation:'query',sql,params,scriptedRows:rows});return {rowCount:rows.length,rows:copy(rows)};
        }};
        for(const event of entry.events) processor.processActionTrace(b,{id:'cd'.repeat(32)},
          {act:{account:input.marketContract,name:event.name,data:copy(event.data)},global_sequence:String(sequence++)});
        queued.push(processor.liveQueue.map(job=>({priority:job.priority,index:job.index,name:job.args.at(-1).act.name})));
        let error=null;
        try {await processor.executeHeadQueue(db);state=candidate;}
        catch(failure){error={name:failure.name,message:failure.message};}
        snapshots.push({offset:entry.offset,error,callbackRows:copy([...state.values()]),logicalRows:[...state.values()].map(logical)});
      }
    } finally {release();}
    assert.deepEqual(processor.getActiveListeners(),{trace_listeners:[],table_listeners:[]});
    const last=snapshots.at(-1),views=[];
    if(!scenario.originalOnly) for(const sale of last.logicalRows){
      const view=lightModel(sale,input.relationships);views.push({saleId:sale.sale_id,view,
        formatted:view===null?null:json(formatSale(copy(view)))});
    }
    cases.push({name:scenario.name,registrations,queued,executed,calls,notifications,snapshots,views,listenersReleased:true});
  }
  const listed=cases.find(value=>value.name==='same-block-start-before-create').snapshots.at(-1).logicalRows[0];
  const lightCases=[];
  for(const name of ['current','changed-current-relations','missing-offer','missing-collection','missing-token','empty-links','nonpending-offer','null-offer-state']) {
    const relations=copy(input.relationships);
    if(name==='changed-current-relations') {relations.collection.data.name='later collection';relations.collection.market_fee=.2;
      relations.token.token_precision=8;relations.sellerCode={account:listed.seller};}
    if(name==='missing-offer')relations.offer=null;
    if(name==='missing-collection')relations.collection=null;
    if(name==='missing-token')relations.token=null;
    if(name==='empty-links')relations.offerAssets=null;
    if(name==='nonpending-offer')relations.offer.state=1;
    if(name==='null-offer-state')relations.offer.state=null;
    const view=lightModel(listed,relations);
    lightCases.push({name,sale:copy(listed),relations,view,formatted:view===null?null:json(formatSale(copy(view)))});
  }
  const referenceFiles = Object.keys(require.cache).filter(path=>path.startsWith(referenceRoot+sep));
  assert.ok(referenceFiles.length <= 3000);
  let totalBytes=0;
  const loadedModules=referenceFiles.sort().map(path=>{const data=readFileSync(path);totalBytes+=data.length;
    return {path:relative(referenceRoot,path).split(sep).join('/'),bytes:data.length,sha256:sha(data)};});
  assert.ok(totalBytes <= 256*1024*1024);
  for(const file of loadedModules) assert.equal(sha(readFileSync(join(referenceRoot,file.path))),file.sha256);
  const result={nodeVersion:process.version,scope:{constructedInputs:true,originalSaleProcessor:true,originalScheduler:true,
    originalFormatter:true,storage:'finite callback fixture; complete candidate discarded on error',
    timestampStrings:'explicit fixture normalization, not measured PG casting',viewShape:'source-derived restricted model; SQL not executed',
    notifications:'observed callback calls only',postgres:false,mongo:false,sourceAuthority:false,sdkRecovery:false,fullParity:false},
    controls:{cases,lightCases},provenance,loadedModules,loadedModuleBytes:totalBytes};
  assert.ok(Buffer.byteLength(JSON.stringify(result))<1024*1024);
  return result;
};
