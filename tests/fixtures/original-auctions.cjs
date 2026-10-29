'use strict';
// Execute unmodified callbacks, scheduler, handler/filler/formatter. Storage/view boundaries are finite models, not PostgreSQL.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const copy=x=>structuredClone(x),id=(r,keys)=>JSON.stringify(keys.map(k=>r[k]));
module.exports=async function(fromReference,root,input){
  assert.ok(input.blocks.length<=16 && input.requests.length<=24);
  const paths=['src/filler/processor.ts','src/filler/handlers/atomicmarket/processors/auctions.ts',
    'src/filler/handlers/atomicmarket/index.ts','src/filler/handlers/atomicmarket/legacy-bundles.ts',
    'definitions/tables/atomicmarket_tables.sql','definitions/views/atomicmarket_auctions_master.sql',
    'src/api/namespaces/atomicmarket/handlers/auctions.ts','src/api/namespaces/atomicmarket/filler.ts',
    'src/api/namespaces/atomicmarket/format.ts','src/api/namespaces/atomicmarket/market-version.ts',
    'src/api/namespaces/atomicassets/filler.ts','src/api/server.ts','src/api/namespaces/validation.ts'];
  const sources=paths.map(path=>{const raw=execFileSync('git',['show','0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e:'+path],{cwd:root,maxBuffer:2*1024*1024});
    assert.equal(readFileSync(join(root,path),'utf8').replaceAll('\r\n','\n'),raw.toString());
    return {path,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};});
  const {default:Processor,ProcessingState}=fromReference('./src/filler/processor.ts');
  const {auctionProcessor}=fromReference('./src/filler/handlers/atomicmarket/processors/auctions.ts');
  let tables=new Map();const calls=[],executed=[],snapshots=[],notifications=[];
  const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
  const rows=name=>[...table(name).values()];
  const processor=new Processor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true});
  for(const method of ['onActionTrace','onContractRow']){const base=processor[method].bind(processor);
    processor[method]=(account,name,callback,priority,...args)=>base(account,name,async(...a)=>{
      executed.push({name,priority});return callback(...a);},priority,...args);}
  const release=auctionProcessor({args:{atomicmarket_account:input.market,atomicassets_account:input.assets},
    config:{version:input.version??'1.2.2'},v2MarkerBlock:input.markerBlock??null},processor,
    {sendActionTrace(channel,b,tx,trace){notifications.push({channel,name:trace.act.name});}});
  const registrations=JSON.parse(JSON.stringify(processor.getActiveListeners()));
  const db={async insert(name,data,keys,_r,_l,conflict='error'){
    assert.ok(['atomicmarket_auctions','atomicmarket_auctions_assets','atomicmarket_auctions_bids'].includes(name));
    calls.push({operation:'insert',name,conflict});
    for(const r of Array.isArray(data)?data:[data]){const k=id(r,keys),old=table(name).get(k);
      if(old&&conflict==='error')throw Error('controlled original unique constraint');
      if(!old||conflict==='update')table(name).set(k,copy(r));}
  },async update(name,data,where){
    assert.equal(name,'atomicmarket_auctions');assert.equal(where.str,'market_contract = $1 AND auction_id = $2');
    calls.push({operation:'update',name,data:copy(data)});
    for(const r of rows(name))if(r.market_contract===where.values[0]&&r.auction_id===where.values[1])Object.assign(r,copy(data));
  },async query(sql,args){
    assert.equal(sql,'SELECT COUNT(*) FROM atomicmarket_auctions_bids WHERE market_contract = $1 AND auction_id = $2');
    calls.push({operation:'query',sql,args:copy(args)});
    return {rows:[{count:String(rows('atomicmarket_auctions_bids').filter(r=>r.market_contract===args[0]&&r.auction_id===args[1]).length)}],rowCount:1};
  }};
  try{for(const block of input.blocks){
    assert.ok(block.events.length<=32);const previous=copy(tables);
    const b={block_num:block.number,block_id:block.number.toString(16).padStart(64,'0'),timestamp:new Date(block.timeMs).toISOString().slice(0,-1)};
    for(const e of block.events){
      if(e.kind==='action')processor.processActionTrace(b,{id:e.transactionId??'a'.repeat(64)},
        {act:{account:input.market,name:e.name,data:copy(e.value)},global_sequence:'9007199254740993'});
      else processor.processContractRow(b,{code:input.market,table:'auctions',scope:input.market,primary_key:e.value.auction_id,present:e.present,value:copy(e.value)});
    }
    let error=null;try{await processor.executeHeadQueue(db);
      // Source table constraint is DEFERRABLE INITIALLY DEFERRED. This models that constraint explicitly.
      for(const r of rows('atomicmarket_auctions_bids'))if(!rows('atomicmarket_auctions').some(a=>a.market_contract===r.market_contract&&a.auction_id===r.auction_id))
        throw Error('controlled original deferred parent FK');
    }catch(e){error=e.message;tables=previous;}
    const logical=r=>Object.fromEntries(Object.entries(copy(r)).map(([k,v])=>[k,['created_at_block','created_at_time','updated_at_block','updated_at_time'].includes(k)?String(v):v]));
    snapshots.push({error,auctions:rows('atomicmarket_auctions').map(logical),links:copy(rows('atomicmarket_auctions_assets')),
      bids:rows('atomicmarket_auctions_bids').map(r=>({...logical(r),txid:Buffer.from(r.txid).toString('hex')}))});
    if(error)break;
  }}finally{release();}
  assert.deepEqual(processor.getActiveListeners(),{trace_listeners:[],table_listeners:[]});
  const {HTTPServer}=fromReference('./src/api/server.ts');
  const {getAuctionAction}=fromReference('./src/api/namespaces/atomicmarket/handlers/auctions.ts');
  const {clearMarketVersionCache}=fromReference('./src/api/namespaces/atomicmarket/market-version.ts');
  const Fastify=require('fastify'),api=Fastify(),requests=[];let selected;
  // Independent field selection from the pinned SQL view, over the ORIGINAL callback rows.
  const model=a=>{
    const r=input.relations,c=r.collection,t=r.token;
    if(!c||!t||c.contract!==a.assets_contract||c.collection_name!==a.collection_name||t.market_contract!==a.market_contract||t.token_symbol!==a.token_symbol)return null;
    return {market_contract:a.market_contract,assets_contract:a.assets_contract,auction_id:a.auction_id,seller:a.seller,buyer:a.buyer,
      raw_price:a.price,raw_token_precision:t.token_precision,raw_token_symbol:t.token_symbol,
      price:{token_contract:t.token_contract,token_symbol:t.token_symbol,token_precision:t.token_precision,amount:a.price},
      assets:rows('atomicmarket_auctions_assets').filter(r=>r.market_contract===a.market_contract&&r.auction_id===a.auction_id).sort((a,b)=>a.index-b.index).map(r=>r.asset_id),
      bids:rows('atomicmarket_auctions_bids').filter(r=>r.market_contract===a.market_contract&&r.auction_id===a.auction_id).sort((a,b)=>a.bid_number-b.bid_number)
        .map(r=>({number:r.bid_number,account:r.account,amount:r.amount,created_at_block:String(r.created_at_block),created_at_time:String(r.created_at_time),txid:Buffer.from(r.txid).toString('hex')})),
      maker_marketplace:a.maker_marketplace,taker_marketplace:a.taker_marketplace,claimed_by_buyer:a.claimed_by_buyer,claimed_by_seller:a.claimed_by_seller,
      collection_name:a.collection_name,collection:{collection_name:c.collection_name,name:c.data.name??null,img:c.data.img??null,images:c.data.images??null,
        author:c.author,allow_notify:c.allow_notify,authorized_accounts:copy(c.authorized_accounts),notify_accounts:copy(c.notify_accounts),market_fee:a.collection_fee,
        created_at_block:c.created_at_block,created_at_time:c.created_at_time},auction_state:a.state,end_time:String(a.end_time),is_seller_contract:r.code!==null,
      updated_at_block:String(a.updated_at_block),updated_at_time:String(a.updated_at_time),created_at_block:String(a.created_at_block),created_at_time:String(a.created_at_time),current_collection_fee:c.market_fee};
  };
  const queries=[];const database={async query(sql,args){queries.push({sql,args:copy(args)});let result;
    if(sql==='SELECT * FROM atomicmarket_auctions_master WHERE market_contract = $1 AND auction_id = $2'){
      const canonical=/^-?\d+$/.test(args[1])?BigInt(args[1]).toString():args[1];
      result=rows('atomicmarket_auctions').filter(r=>r.market_contract===args[0]&&r.auction_id===canonical).map(model).filter(Boolean);
    }else if(sql==='SELECT version FROM atomicmarket_config WHERE market_contract = $1')result=[{version:input.version??'1.2.2'}];
    else if(sql==='SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = ANY ($2)')result=copy(selected.assetRows??[]);
    else if(sql.startsWith('SELECT DISTINCT ON (price.market_contract'))result=[];
    else throw Error('Unmodeled original auction read SQL '+sql);
    return {rows:copy(result),rowCount:result.length};
  }};
  const net=require('node:net'),listen=net.Server.prototype.listen;let listenerAttempts=0;
  net.Server.prototype.listen=function(){listenerAttempts++;throw Error('No listening sockets in auction control');};
  const server=new HTTPServer({server_name:'reference.invalid',cache_life:0},{database:{createPool:()=>database},
    redis:{ioRedis:new Proxy({},{get(){throw Error('Redis outside control');}})},chain:{name:'auction-control',rpc:{async get_info(){return {};}}}});
  const middleware=server.web.returnAsJSON(getAuctionAction,{args:{atomicassets_account:input.assets,atomicmarket_account:input.market}});
  const clock=Date.now;
  try{
    api.all('/atomicmarket/v1/auctions/:auction_id',async(request,reply)=>{
      const response={status(code){reply.code(code);return response;},json(value){reply.send(value);return response;}};
      await middleware({params:request.params,query:request.query,body:request.body},response);return reply;});
    for(const item of input.requests){selected=item;queries.length=0;Date.now=()=>item.nowMs;clearMarketVersionCache();
      const response=await api.inject('/atomicmarket/v1/auctions/'+encodeURIComponent(item.id));
      const body=response.json();delete body.query_time;requests.push({id:item.id,nowMs:item.nowMs,status:response.statusCode,body,queries:copy(queries)});}
  }finally{Date.now=clock;await api.close();server.httpServer.closeAllConnections();await new Promise(resolve=>server.socket.io.close(resolve));net.Server.prototype.listen=listen;clearMarketVersionCache();}
  const result={nodeVersion:process.version,sources,registrations,executed,snapshots,notifications,requests,listenerAttempts,
    scope:{actualOriginalScheduler:true,actualOriginalCallbacks:true,actualOriginalHandlerFillerFormatter:true,
      storage:'finite callback collaborator, explicit FK and source-derived SQL view model',postgres:false,mongo:false,sourceAuthority:false,fullParity:false}};
  assert.ok(Buffer.byteLength(JSON.stringify(result))<1024*1024);return result;
};
