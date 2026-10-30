'use strict';
// Unmodified original callbacks, scheduler and HTTP handler. SQL/storage are explicit finite collaborators, not PostgreSQL.
const assert=require('node:assert/strict');
const {captureBuyofferSources}=require('./original-buyoffer-sources.cjs');
const copy=x=>structuredClone(x),id=(r,keys)=>JSON.stringify(keys.map(k=>r[k]));
module.exports=async function(fromReference,root,input){
  assert.ok(input.blocks.length<=16&&input.requests.length<=24);
  const sources=await captureBuyofferSources(root);
  const {default:Processor,ProcessingState}=fromReference('./src/filler/processor.ts');
  const {buyofferProcessor}=fromReference('./src/filler/handlers/atomicmarket/processors/buyoffers.ts');
  let tables=new Map();const calls=[],executed=[],snapshots=[],notifications=[];
  const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);},rows=name=>[...table(name).values()];
  const processor=new Processor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true});
  const base=processor.onActionTrace.bind(processor);
  processor.onActionTrace=(account,name,callback,priority,...args)=>base(account,name,async(...a)=>{executed.push({name,priority});return callback(...a);},priority,...args);
  const release=buyofferProcessor({args:{atomicmarket_account:input.market,atomicassets_account:input.assets},
    config:{version:input.version??'1.2.2'},v2MarkerBlock:input.markerBlock??null},processor,
    {sendActionTrace(channel,b,tx,trace){notifications.push({channel,name:trace.act.name});}});
  const registrations=JSON.parse(JSON.stringify(processor.getActiveListeners()));
  const db={async insert(name,data,keys,_r,_l,conflict='error'){
    assert.ok(['atomicmarket_buyoffers','atomicmarket_buyoffers_assets'].includes(name));calls.push({operation:'insert',name,conflict});
    for(const r of Array.isArray(data)?data:[data]){const k=id(r,keys),old=table(name).get(k);
      if(old&&conflict==='error')throw Error('controlled original unique constraint');if(!old||conflict==='update')table(name).set(k,copy(r));}
  },async update(name,data,where){
    assert.equal(name,'atomicmarket_buyoffers');assert.equal(where.str,'market_contract = $1 AND buyoffer_id = $2');
    calls.push({operation:'update',name,data:copy(data)});
    for(const r of rows(name))if(r.market_contract===where.values[0]&&r.buyoffer_id===where.values[1])Object.assign(r,copy(data));
  },async query(sql,args){
    assert.equal(sql,'SELECT state FROM atomicmarket_buyoffers WHERE market_contract = $1 AND buyoffer_id = $2');calls.push({operation:'query',sql,args:copy(args)});
    const result=rows('atomicmarket_buyoffers').filter(r=>r.market_contract===args[0]&&r.buyoffer_id===args[1]).map(r=>({state:r.state}));
    return {rows:result,rowCount:result.length};
  }};
  try{for(const block of input.blocks){
    assert.ok(block.events.length<=32);const previous=copy(tables),b={block_num:block.number,block_id:block.number.toString(16).padStart(64,'0'),timestamp:new Date(block.timeMs).toISOString().slice(0,-1)};
    for(const e of block.events){assert.equal(e.kind,'action');processor.processActionTrace(b,{id:e.transactionId??'a'.repeat(64)},
      {act:{account:input.market,name:e.name,data:copy(e.value),authorization:copy(e.authorization)},global_sequence:'9007199254740993'});}
    let error=null;try{await processor.executeHeadQueue(db);}catch(e){error=e.message;tables=previous;}
    const logical=r=>Object.fromEntries(Object.entries(copy(r)).map(([k,v])=>[k,['created_at_block','created_at_time','updated_at_block','updated_at_time'].includes(k)?String(v):v]));
    snapshots.push({error,buyoffers:rows('atomicmarket_buyoffers').map(logical),links:copy(rows('atomicmarket_buyoffers_assets'))});if(error)break;
  }}finally{release();}
  assert.deepEqual(processor.getActiveListeners(),{trace_listeners:[],table_listeners:[]});
  const {HTTPServer}=fromReference('./src/api/server.ts');
  const {getBuyOfferAction}=fromReference('./src/api/namespaces/atomicmarket/handlers/buyoffers.ts');
  const Fastify=require('fastify'),api=Fastify(),requests=[];let selected;
  // Independent pinned SQL-view selection over the actual ORIGINAL callback rows.
  const model=a=>{const c=input.relations.collection,t=input.relations.token;
    if(!c||!t||c.contract!==a.assets_contract||c.collection_name!==a.collection_name||t.market_contract!==a.market_contract||t.token_symbol!==a.token_symbol)return null;
    return {market_contract:a.market_contract,assets_contract:a.assets_contract,buyoffer_id:a.buyoffer_id,seller:a.seller,buyer:a.buyer,
      raw_price:a.price,raw_token_precision:t.token_precision,raw_token_symbol:t.token_symbol,
      price:{token_contract:t.token_contract,token_symbol:t.token_symbol,token_precision:t.token_precision,amount:a.price},
      assets:rows('atomicmarket_buyoffers_assets').filter(r=>r.market_contract===a.market_contract&&r.buyoffer_id===a.buyoffer_id).sort((a,b)=>a.index-b.index).map(r=>r.asset_id),
      maker_marketplace:a.maker_marketplace,taker_marketplace:a.taker_marketplace,collection_name:a.collection_name,
      collection:{collection_name:c.collection_name,name:c.data.name??null,img:c.data.img??null,images:c.data.images??null,
        author:c.author,allow_notify:c.allow_notify,authorized_accounts:copy(c.authorized_accounts),notify_accounts:copy(c.notify_accounts),market_fee:a.collection_fee,
        created_at_block:c.created_at_block,created_at_time:c.created_at_time},buyoffer_state:a.state,memo:a.memo,decline_memo:a.decline_memo,
      updated_at_block:String(a.updated_at_block),updated_at_time:String(a.updated_at_time),created_at_block:String(a.created_at_block),created_at_time:String(a.created_at_time),current_collection_fee:c.market_fee};};
  const queries=[],database={async query(sql,args){queries.push({sql,args:copy(args)});let result;
    if(sql==='SELECT * FROM atomicmarket_buyoffers_master WHERE market_contract = $1 AND buyoffer_id = $2'){
      const canonical=/^-?\d+$/.test(args[1])?BigInt(args[1]).toString():args[1];
      result=rows('atomicmarket_buyoffers').filter(r=>r.market_contract===args[0]&&r.buyoffer_id===canonical).map(model).filter(Boolean);
    }else if(sql==='SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = ANY ($2)')result=copy(selected.assetRows??[]);
    else if(sql.startsWith('SELECT DISTINCT ON (price.market_contract'))result=[];
    else throw Error('Unmodeled original buyoffer read SQL '+sql);
    return {rows:copy(result),rowCount:result.length};
  }};
  const net=require('node:net'),listen=net.Server.prototype.listen;let listenerAttempts=0;
  net.Server.prototype.listen=function(){listenerAttempts++;throw Error('No listening sockets in buyoffer control');};
  const server=new HTTPServer({server_name:'reference.invalid',cache_life:0},{database:{createPool:()=>database},
    redis:{ioRedis:new Proxy({},{get(){throw Error('Redis outside control');}})},chain:{name:'buyoffer-control',rpc:{async get_info(){return {};}}}});
  const middleware=server.web.returnAsJSON(getBuyOfferAction,{args:{atomicassets_account:input.assets,atomicmarket_account:input.market}}),clock=Date.now;
  try{
    api.all('/atomicmarket/v1/buyoffers/:buyoffer_id',async(request,reply)=>{const response={status(code){reply.code(code);return response;},json(value){reply.send(value);return response;}};
      await middleware({params:request.params,query:request.query,body:request.body},response);return reply;});
    for(const item of input.requests){selected=item;queries.length=0;Date.now=()=>item.nowMs;
      const response=await api.inject({url:'/atomicmarket/v1/buyoffers/'+encodeURIComponent(item.id),method:item.method??'GET'});
      const body=response.body?response.json():response.body;if(body&&typeof body==='object')delete body.query_time;
      requests.push({id:item.id,nowMs:item.nowMs,method:item.method??'GET',status:response.statusCode,body,queries:copy(queries)});}
  }finally{Date.now=clock;await api.close();server.httpServer.closeAllConnections();await new Promise(resolve=>server.socket.io.close(resolve));net.Server.prototype.listen=listen;}
  const result={nodeVersion:process.version,sources,registrations,executed,snapshots,notifications,requests,listenerAttempts,
    scope:{actualOriginalScheduler:true,actualOriginalCallbacks:true,actualOriginalHandlerFillerFormatter:true,
      storage:'finite callback collaborator and source-derived SQL view model',headWireTransport:false,postgres:false,mongo:false,sourceAuthority:false,fullParity:false}};
  assert.ok(Buffer.byteLength(JSON.stringify(result))<1024*1024);return result;
};
