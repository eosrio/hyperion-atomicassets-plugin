'use strict';
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createHash}=require('node:crypto');
const {steps,cases}=require('./royalty-rule-plan.cjs');const {readBody,transaction,observedQuery}=require('./royalty-rule-runtime.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
// Original processor, PostgreSQL transaction, namespace, router and wrapper; no expected answer rows.
module.exports=async function capture(fromReference,connection,config,record){
 const {default:DataProcessor,ProcessingState}=fromReference('./src/filler/processor.ts');
 const helper=fromReference('./src/filler/handlers/test-helper.ts');
 const {royaltyProcessor}=fromReference('./src/filler/handlers/atomicmarket/processors/royalties.ts');
 const {HTTPServer}=fromReference('./src/api/server.ts');
 const {AtomicMarketNamespace}=fromReference('./src/api/namespaces/atomicmarket/index.ts');
 const {Client}=fromReference('pg');
 const client=new Client({...config,ssl:false,connectionTimeoutMillis:5000,statement_timeout:30000,application_name:'royalty-original-pg'});
 let processor,release,server,primary,hasPrimary=false,queryPhase=null,callbackPhase=null;const cleanup=[],handlerQueries=[],callbackQueries=[];
 const clientQuery=client.query.bind(client);client.query=async function(sql,bindings,...rest){if(!callbackPhase)return clientQuery(sql,bindings,...rest);assert.equal(typeof sql,'string');const row={stage:callbackPhase,sql,bindings:bindings??[]};callbackQueries.push(row);return observedQuery(()=>clientQuery(sql,bindings,...rest),row,record,'royalty-callback-sql');};
 const observeServer=server=>{const originalQuery=server.query.bind(server);server.query=async function(sql,bindings,...rest){if(!queryPhase)return originalQuery(sql,bindings,...rest);const row={case:queryPhase,sql,bindings:bindings??[]};handlerQueries.push(row);return observedQuery(()=>originalQuery(sql,bindings,...rest),row,record,'royalty-handler-sql');};}; const result={kind:'original-royalty-rule-pg-capture',scope:{constructedSource:true,chainAuthority:false,fullParity:false},stages:[],responses:[]};
 try{
  await client.connect();
  processor=new DataProcessor(ProcessingState.HEAD,helper.createMockModuleLoader());
  release=royaltyProcessor({args:{atomicmarket_account:'atomicmarket'}},processor);
  const redis=new Proxy({},{get(){throw Error('Redis outside oracle');}});
  server=new HTTPServer({server_name:'original-pg.invalid',cache_life:0,max_db_connections:2,max_query_time_ms:10000},
   {database:connection,redis:{ioRedis:redis},chain:{name:'fixture',rpc:{async get_info(){return {};}}}});
  observeServer(server);const namespace=new AtomicMarketNamespace('/atomicmarket',server.connection,{atomicmarket_account:'atomicmarket',atomicassets_account:'atomicassets',delphioracle_account:'delphioracle',connected_reader:'original-pg'});
  await namespace.init();server.web.express.use('/atomicmarket',await namespace.router(server));server.httpServer.listen(0,'127.0.0.1');await once(server.httpServer,'listening');
  const snapshot=async name=>{const out={name};for(const [label,table,key]of [['templates','atomicmarket_royalties_templates','template_id'],['attributes','atomicmarket_royalties_attributes','rule_id']]){
   const cols=label==="templates"?"market_contract,collection_name,template_id::text AS template_id,recipients":"market_contract,collection_name,rule_id::text AS rule_id,source,field,value,weight::text AS weight,recipients,encode(lookup_hash, 'hex') AS lookup_hash";
   const sql=`SELECT row_to_json(t)::text AS raw_json FROM (SELECT ${cols},updated_at_block::text AS updated_at_block,updated_at_time::text AS updated_at_time,created_at_block::text AS created_at_block,created_at_time::text AS created_at_time FROM ${table} WHERE market_contract=$1 AND collection_name=$2 ORDER BY ${table}.${key}) t`;
   const r=await client.query(sql,['atomicmarket','oracle']);out[label]={sql,bindings:['atomicmarket','oracle'],rows:r.rows};}
   result.stages.push(out);record({kind:'royalty-stage',value:out});return out;};
  for(let i=0;i<steps.length;i++){
   const step=steps[i],block={block_num:i+1,block_id:String(i+1).padStart(64,'0'),timestamp:`2023-11-14T22:13:0${i}.000`};
   record({kind:'royalty-callback-input',stage:step.name,block,rows:step.rows});callbackPhase=step.name;await transaction(client,async()=>{for(const row of step.rows)processor.processContractRow(block,{code:'atomicmarket',scope:'oracle',table:row.table,present:row.present!==false,value:structuredClone(row.value)});
    await processor.executeHeadQueue(helper.createTestTransaction(client));},record);
   callbackPhase=null;await snapshot(step.name);
  }
  for(const plan of cases){const path='/atomicmarket/v1/royalties/oracle/'+plan.route,query=new URLSearchParams(plan.query??{}),method=plan.method??'GET';
   queryPhase=plan.name;const response=await fetch('http://127.0.0.1:'+server.httpServer.address().port+path+(query.size?'?'+query:''),{method,redirect:'manual',signal:AbortSignal.timeout(10000),
    ...(plan.body?{headers:{'content-type':'application/json'},body:JSON.stringify(plan.body)}:{})});
   const raw=await readBody(response);
   const row={...plan,path,status:response.status,headers:Object.fromEntries(response.headers),rawText:raw.toString('utf8'),bytes:raw.length,sha256:hash(raw)};
   if(method!=='HEAD')JSON.parse(row.rawText);queryPhase=null;result.responses.push(row);record({kind:'royalty-http',value:row});}
 }catch(e){primary=e;hasPrimary=true;}
 finally{
  const close=async(name,fn)=>{const row={name,attempted:true};cleanup.push(row);try{await fn();row.succeeded=true;}catch(e){row.succeeded=false;row.error=String(e?.message??e);if(!hasPrimary){primary=e;hasPrimary=true;}}};
  if(release)await close('listeners',async()=>{release();assert.equal(processor.getActiveListeners().table_listeners.length,0);assert.equal(processor.getActiveListeners().trace_listeners.length,0);});
  if(server){await close('http',async()=>{server.httpServer.closeAllConnections();await new Promise(resolve=>server.socket.io.close(resolve));});await close('server-database',()=>server.database.end());}
  await close('scenario-client',()=>client.end());result.handlerQueries=handlerQueries;result.callbackQueries=callbackQueries;result.cleanup=cleanup;try{record({kind:'royalty-cleanup',cleanup});}catch(e){if(!hasPrimary){primary=e;hasPrimary=true;}}
 }
 if(hasPrimary)throw primary;return result;
};
