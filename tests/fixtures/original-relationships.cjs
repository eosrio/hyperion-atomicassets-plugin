'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const copy=x=>structuredClone(x),identity=(row,keys)=>JSON.stringify(keys.map(k=>row[k]));
module.exports=async function(fromReference,referenceRoot,input){
  assert.ok(input.blocks.length<=16);let eventCount=0;
  const {default:Processor,ProcessingState}=fromReference('./src/filler/processor.ts');
  const {offerProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/offers.ts');
  const {assetProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/assets.ts');
  const {configProcessor}=fromReference('./src/filler/handlers/atomicmarket/processors/config.ts');
  const {saleProcessor}=fromReference('./src/filler/handlers/atomicmarket/processors/sales.ts');
  const {default:Receiver}=fromReference('./src/filler/receiver.ts');
  const sourcePaths=['src/filler/processor.ts','src/filler/receiver.ts',
    'src/filler/handlers/atomicassets/processors/assets.ts','src/filler/handlers/atomicassets/processors/offers.ts',
    'src/filler/handlers/atomicmarket/processors/config.ts','src/filler/handlers/atomicmarket/processors/sales.ts',
    'definitions/views/atomicmarket_sales_master.sql'];
  const sources=sourcePaths.map(path=>{const raw=execFileSync('git',['show','0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e:'+path],{cwd:referenceRoot});
    assert.equal(readFileSync(join(referenceRoot,path),'utf8').replaceAll('\r\n','\n'),raw.toString());
    return {path,sha256:createHash('sha256').update(raw).digest('hex')};});
  let tables=new Map(),calls=[];const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
  const rows=name=>[...table(name).values()];
  // The original initializer creates this empty singleton, not token/offer/asset relationships.
  table('atomicmarket_config').set(JSON.stringify([input.market]),{market_contract:input.market});
  const core={args:{atomicmarket_account:input.market,atomicassets_account:input.assets},
    config:{supported_tokens:[],supported_symbol_pairs:[]},v2MarkerBlock:null};
  const processor=new Processor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true});
  const notifier={sendActionTrace(){}};
  const releases=[offerProcessor({args:{atomicassets_account:input.assets}},processor,notifier),
    assetProcessor({args:{atomicassets_account:input.assets,store_transfers:false}},processor,notifier),
    configProcessor(core,processor),saleProcessor(core,processor,notifier)];
  const db={async insert(name,data,keys,reversible=true,lock=true,onConflict='error'){
    for(const row of Array.isArray(data)?data:[data]) {const id=identity(row,keys),old=table(name).get(id);
      if(old&&onConflict==='error')throw Error('original controlled unique violation');
      if(!old||onConflict==='update')table(name).set(id,copy(row));}
    calls.push({operation:'insert',table:name,onConflict});
  },async update(name,data,where){
    calls.push({operation:'update',table:name,data:copy(data)});const [contract,ids,from]=where.values;
    for(const row of rows(name)){
      let selected=false;
      if(name==='atomicmarket_config')selected=row.market_contract===contract;
      else if(name==='atomicmarket_sales')selected=row.market_contract===contract&&row.sale_id===ids;
      else if(name==='atomicassets_assets')selected=row.contract===contract&&(Array.isArray(ids)?ids.includes(row.asset_id)&&row.owner===from:row.asset_id===ids);
      else if(name==='atomicassets_offers')selected=row.contract===contract&&(Array.isArray(ids)?ids.includes(row.offer_id)&&row.state===from:row.offer_id===ids);
      else throw Error('unmodeled original update '+name);
      if(selected)Object.assign(row,copy(data));}
  },async query(sql,args=[]){
    calls.push({operation:'query',sql});let found=[];
    if(sql==="SET LOCAL statement_timeout = '300s'")return {rows:[],rowCount:0};
    if(sql.startsWith('INSERT into contract_codes')){const [account,block_num,block_time]=args,id=JSON.stringify([account]);
      if(table('contract_codes').has(id))throw Error('original code cache duplicate');table('contract_codes').set(id,{account,block_num,block_time});}
    else if(sql.includes('SELECT offer.offer_id, offer.state')) {
      const [contract,assets]=args;found=rows('atomicassets_offers').filter(o=>o.contract===contract&&[0,1].includes(o.state)&&
        rows('atomicassets_offers_assets').some(a=>a.contract===o.contract&&a.offer_id===o.offer_id&&assets.includes(a.asset_id))).map(o=>({offer_id:o.offer_id,state:o.state}));
    }else if(sql.includes('SELECT DISTINCT ON (offer_asset.offer_id)')) {
      const [contract,ids]=args;found=[...new Set(rows('atomicassets_offers_assets').filter(a=>a.contract===contract&&ids.includes(a.offer_id)&&
        rows('atomicassets_assets').some(v=>v.contract===a.contract&&v.asset_id===a.asset_id&&(v.owner===null||v.owner!==a.owner))).map(a=>a.offer_id))].map(offer_id=>({offer_id}));
    }else if(sql.startsWith('SELECT state, listing_price, offer_id, assets_contract'))found=rows('atomicmarket_sales').filter(s=>s.market_contract===args[0]&&s.sale_id===args[1]);
    else if(sql.startsWith('SELECT COUNT(*) FROM atomicassets_offers_assets'))found=[{count:String(rows('atomicassets_offers_assets').filter(a=>a.contract===args[0]&&a.offer_id===args[1]).length)}];
    else throw Error('unmodeled original SQL '+sql);
    return {rows:copy(found),rowCount:found.length};
  }};
  const receiver=Object.create(Receiver.prototype);receiver.connection={database:{query:db.query.bind(db)}};
  const snapshots=[];
  try {for(const block of input.blocks){
    assert.ok(block.events.length<=48);eventCount+=block.events.length;assert.ok(eventCount<=256);
    const previous=copy(tables);let error=null;
    const b={block_num:block.number,block_id:block.number.toString(16).padStart(64,'0'),timestamp:new Date(block.timeMs).toISOString().slice(0,-1)};
    for(const e of block.events){
      if(e.kind==='action'&&e.contract===input.system&&e.name==='setcode')await receiver.handleCodeUpdate(b,{account:input.system,name:'setcode',data:copy(e.value)});
      else if(e.kind==='action')processor.processActionTrace(b,{id:'a'.repeat(64)},
        {act:{account:e.contract,name:e.name,data:copy(e.value)},global_sequence:'9007199254740993'});
      else if(e.contract===input.market){assert.equal(typeof e.scope,'string','Original scope must be explicit');
        processor.processContractRow(b,{code:e.contract,table:e.table,scope:e.scope,
          primary_key:'0',present:e.present,value:copy(e.value)});}
    }
    try {await processor.executeHeadQueue(db);}catch(e){error=e.message;tables=previous;}
    const logical=name=>rows(name).map(row=>Object.fromEntries(Object.entries(copy(row)).map(([k,v])=>[k,/_(block|time)$/.test(k)?String(v):v])));
    const links=[];for(const row of rows('atomicassets_offers_assets')) {let link=links.find(l=>l.contract===row.contract&&l.offer_id===row.offer_id);
      if(!link){link={contract:row.contract,offer_id:row.offer_id,asset_ids:[],owners:[]};links.push(link);}link.asset_ids.push(row.asset_id);link.owners.push(row.owner);}
    snapshots.push({error,offers:logical('atomicassets_offers'),links,tokens:rows('atomicmarket_tokens').map(v=>({...copy(v),token_precision:Number(v.token_precision)})),
      assets:logical('atomicassets_assets').map(v=>({asset_id:v.asset_id,owner:v.owner})),sales:logical('atomicmarket_sales'),codes:rows('contract_codes').map(v=>({account:v.account}))});
    if(error)break;
  }}finally{for(const release of releases)release();}
  assert.deepEqual(processor.getActiveListeners(),{trace_listeners:[],table_listeners:[]});
  for(const name of ['priorityListeners','commitListeners','forkListeners'])assert.equal(processor[name].length,0,name);
  const result={nodeVersion:process.version,snapshots,calls,sources,listenersReleased:true,scope:{originalOfferAssetConfigSaleProcessors:true,originalSetcodeReceiver:true,
    originalPriorityScheduler:true,storage:'finite controlled callback collaborator; SQL predicates modeled explicitly',postgres:false,mongo:false,
    physicalHttpParity:false,sourceAuthority:false,fullParity:false}};
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=1024*1024);return result;
};
