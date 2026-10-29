'use strict';
// Actual original callbacks/handler; finite storage/default/type-parser/view model, never PostgreSQL.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {scriptedTransaction}=require('../../harness/atomicassets/original-controls.cjs');
const {validateInputProfile}=require('../../harness/atomicassets/lifecycle-input.cjs');
const copy=structuredClone,sha=b=>createHash('sha256').update(b).digest('hex');

module.exports=async function(fromReference,root,input){
  const profile=validateInputProfile(input.inputProfile);assert.equal(input.contract,profile.input.contract);
  assert.ok(input.cases.length<=10);
  const paths=['src/filler/processor.ts','src/filler/database.ts','src/filler/handlers/atomicassets/index.ts',
    'src/filler/handlers/atomicassets/processors/config.ts','src/filler/handlers/atomicassets/processors/collections.ts',
    'definitions/tables/atomicassets_tables.sql','definitions/views/atomicassets_collections_master.sql',
    'src/api/namespaces/atomicassets/handlers/collections.ts','src/api/namespaces/atomicassets/format.ts','src/api/server.ts'];
  const sources=paths.map(path=>{const raw=execFileSync('git',['show','0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e:'+path],{cwd:root,maxBuffer:2*1024*1024});
    assert.equal(readFileSync(join(root,path),'utf8').replaceAll('\r\n','\n'),raw.toString());return {path,bytes:raw.length,sha256:sha(raw)};});
  const codec={version:fromReference('@atomichub/atomicassets/package.json').version,
    sha256:sha(readFileSync(fromReference.resolve('@atomichub/atomicassets')))};
  assert.equal(codec.version,'2.2.0');assert.equal(codec.sha256,'2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573');
  const {default:Processor,ProcessingState}=fromReference('./src/filler/processor.ts');
  const {configProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/config.ts');
  const {collectionProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/collections.ts');
  const {HTTPServer}=fromReference('./src/api/server.ts');
  const {getCollectionAction}=fromReference('./src/api/namespaces/atomicassets/handlers/collections.ts');
  const net=require('node:net'),listen=net.Server.prototype.listen;let listenerAttempts=0;
  net.Server.prototype.listen=function(){listenerAttempts++;throw Error('No listening sockets in collection control');};
  const cases=[];
  try{for(const item of input.cases){
    assert.ok(item.blocks.length<=8);const boundary=scriptedTransaction(input.contract),core={args:{atomicassets_account:input.contract},config:{supported_tokens:[],collection_format:[]}};
    const processor=new Processor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true}),executed=[],snapshots=[];
    const original=processor.onContractRow.bind(processor);
    processor.onContractRow=(account,name,callback,priority,...args)=>original(account,name,async(...a)=>{executed.push({name,priority});return callback(...a);},priority,...args);
    const release=[configProcessor(core,processor),collectionProcessor(core,processor)];
    const rows=()=>boundary.tables.get('atomicassets_collections')??[];
    // Source DDL supplies nullable pending-author defaults; node-pg supplies bigint decimal text.
    const normalized=()=>rows().map(r=>({...copy(r),data:JSON.parse(r.data),new_author_name:r.new_author_name??null,
      new_author_date:r.new_author_date==null?null:String(r.new_author_date),created_at_block:String(r.created_at_block),created_at_time:String(r.created_at_time)}));
    const database={async query(sql,args){
      assert.equal(sql,'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = $2');
      const result=normalized().filter(r=>r.contract===args[0]&&r.collection_name===args[1]).map(r=>{
        assert.ok(r.data.name==null||typeof r.data.name==='string');assert.ok(r.data.img==null||typeof r.data.img==='string');
        return {...r,name:r.data.name??null,img:r.data.img??null};});
      return {rows:result,rowCount:result.length};
    }};
    const Fastify=require('fastify'),api=Fastify(),requests=[];
    const server=new HTTPServer({server_name:'reference.invalid',cache_life:0},{database:{createPool:()=>database},
      redis:{ioRedis:new Proxy({},{get(){throw Error('Redis outside collection control');}})},chain:{name:'collection-control',rpc:{async get_info(){return {};}}}});
    const middleware=server.web.returnAsJSON(getCollectionAction,{args:{atomicassets_account:input.contract}});
    api.all('/atomicassets/v1/collections/:collection_name',async(request,reply)=>{
      const response={status(code){reply.code(code);return response;},json(value){reply.send(value);return response;}};
      await middleware({params:request.params,query:request.query,body:request.body},response);return reply;});
    try{for(const [n,block]of item.blocks.entries()){
      const previous=copy(boundary.tables);assert.ok(block.events.length<=16);let error=null;
      const b={block_num:Number(block.blockNum),block_id:block.blockId,timestamp:new Date(Number(block.blockTimeMs)).toISOString().slice(0,-1)};
      for(const e of block.events)processor.processContractRow(b,{code:input.contract,table:e.table,scope:e.scope,present:e.present,primary_key:'0',value:copy(e.value)});
      try{await processor.executeHeadQueue(boundary.db);}catch(e){error=e.message;boundary.tables.clear();for(const [k,v]of previous)boundary.tables.set(k,v);}
      snapshots.push({rows:normalized(),error});
      for(const name of item.requests??[input.collection,'missing']){
        const response=await api.inject('/atomicassets/v1/collections/'+encodeURIComponent(name));const body=response.json();
        if(body.success)assert.equal(typeof body.query_time,'number');delete body.query_time;
        requests.push({block:n,name,status:response.statusCode,body});
      }
      if(error)break;
    }}finally{for(const close of release)close();await api.close();server.httpServer.closeAllConnections();await new Promise(resolve=>server.socket.io.close(resolve));}
    assert.deepEqual(processor.getActiveListeners(),{trace_listeners:[],table_listeners:[]});
    cases.push({name:item.name,executed,snapshots,requests,calls:boundary.calls});
  }}finally{net.Server.prototype.listen=listen;}
  return {sources,codec,cases,listenerAttempts,inputProfile:copy(input.inputProfile),inputSha256:sha(Buffer.from(JSON.stringify(input))),
    scope:{actualOriginalCallbacks:true,actualOriginalScheduler:true,actualOriginalHandlerFormatter:true,
      storage:'finite scripted transaction, DDL defaults/type-parser and SQL-view field model',postgres:false,mongo:false,sourceAuthority:false,fullParity:false}};
};
