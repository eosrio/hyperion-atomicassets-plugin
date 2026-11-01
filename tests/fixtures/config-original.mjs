// Execute selected immutable callbacks in-process with finite collaborators.
// No reference application imports, database clients, child processes, sockets, timers or controller.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';

const directory=new URL('./config-original-2.7/',import.meta.url);
export const manifest=JSON.parse(readFileSync(new URL('manifest.json',directory)));
const sources={};
for(const [name,entry] of Object.entries(manifest.sources)){
 const bytes=readFileSync(new URL(name,directory));assert.equal(bytes.length,entry.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex'),entry.gitBlob);
 sources[name]=bytes.toString('utf8');
}
function between(source,start,end){const first=source.indexOf(start);assert.ok(first>=0,start);assert.equal(source.indexOf(start,first+start.length),-1,start+' unique');
 const last=source.indexOf(end,first+start.length);assert.ok(last>first,end);return source.slice(first,last);}
function evaluate(source,expression,bindings={}){
 const imports=source.match(/^import[^\n]*\n/gm)??[];assert.ok(imports.every(line=>!line.includes(';\nimport ')));
 const code=stripTypeScriptTypes(source.replace(/^import[^\n]*\n/gm,''),{mode:'strip'}).replace(/^export /gm,'');
 assert.doesNotMatch(code,/\b(?:import\s|require\(|process\.|setTimeout\(|setInterval\()/);
 return new Script(code+'\n;('+expression+');').runInContext(createContext({...bindings}));
}
const ApiError=evaluate(sources['error.ts'],'ApiError');
const parseContractMajorVersion=evaluate(between(sources['v2-guard.source.txt'],'export function parseContractMajorVersion','\nexport type V2GuardDecision'),'parseContractMajorVersion');
const getConfigAction=evaluate(sources['config-handler.ts'],'getConfigAction',{ApiError});
const mergeRequestData=evaluate(between(sources['namespace-utils.source.txt'],'export function mergeRequestData','\nexport async function buildBoundaryFilter'),'mergeRequestData');
const respondApiError=evaluate(between(sources['api-utils.source.txt'],'export function respondApiError',"// Express's 'trust proxy'"),'respondApiError',{logger:{warn(){}}});
const wrapper=between(sources['server.source.txt'],'    returnAsJSON = ','    private middleware').trim().slice('returnAsJSON = '.length).replace(/;\s*$/,'');
const wrap=web=>evaluate('',`(function(){return (${stripTypeScriptTypes(wrapper,{mode:'strip'})});}).call(web)`,{web,mergeRequestData,respondApiError});
const seedPrefix=between(sources['atomicassets-handler.ts'],'    async init(client: PoolClient): Promise<void> {','        const chainInfo =');
const initialize=evaluate('async function initialize'+seedPrefix.slice(seedPrefix.indexOf('(client:'))+'\n}', 'initialize');
const plain=value=>JSON.parse(JSON.stringify(value));

/** SQL boundary is finite and modeled; it is not PostgreSQL or a native query implementation. */
export function original({contract='atomicassets',fixed=false}={}){
 let rows=new Map(),configs=new Map();const calls=[],callbacks=[],forks=[];
 const db={
  async insert(table,row,_keys,_reversible,_lock,conflict){assert.equal(table,'atomicassets_tokens');assert.equal(conflict,'nothing');const key=row.contract+':'+row.token_symbol;
   if(!rows.has(key))rows.set(key,{...plain(row),token_precision:Number(row.token_precision)});},
  async update(table,value,where){assert.equal(table,'atomicassets_config');const previous=configs.get(where.values[0]);if(previous)configs.set(where.values[0],{...previous,...plain(value),
   ...(value.collection_format?{collection_format:value.collection_format.map(JSON.parse)}:{})});},
  async query(sql,values=[]){calls.push({sql,values:plain(values)});
   if(sql.startsWith('SELECT ')&&sql.includes('FROM atomicassets_config')){const value=configs.get(values[0]);return {rows:value?[plain(value)]:[],rowCount:value?1:0};}
   if(sql.startsWith('SELECT ')&&sql.includes('FROM atomicassets_tokens')){const selected=[...rows.values()].filter(row=>row.contract===values[0]);return {rows:plain(selected).map(row=>sql.includes('SELECT *')?row:({token_symbol:row.token_symbol,token_contract:row.token_contract,token_precision:row.token_precision})),rowCount:selected.length};}
   if(sql.startsWith('INSERT INTO atomicassets_config')){configs.set(values[0],{contract:values[0],version:values[1],collection_format:values[2].map(JSON.parse)});return {rowCount:1};}
   if(sql.startsWith('INSERT INTO atomicassets_tokens')){await this.insert('atomicassets_tokens',{contract:values[0],token_symbol:values[1],token_contract:values[2],token_precision:values[3]},null,true,true,'nothing');return {rowCount:1};}
   if(sql.startsWith('UPDATE atomicassets_config SET v2_marker_block'))return {rowCount:1};
   throw Error('Unmodeled original SQL boundary: '+sql);
  }
 };
 const core={args:{atomicassets_account:contract},connection:{database:db,chain:{rpc:{async get_table_rows(input){assert.equal(input.code,contract);assert.equal(input.scope,contract);
  const value=core.seed?.[input.table];return {rows:value===undefined?[]:[plain(value)]};}}}}};
 const processor={onContractRow(account,table,fn,priority){assert.equal(account,contract);assert.equal(priority,10);const row={table,fn};callbacks.push(row);return()=>{callbacks.splice(callbacks.indexOf(row),1);};},
  onFork(fn,priority){assert.equal(priority,10);forks.push(fn);return()=>{forks.splice(forks.indexOf(fn),1);};}};
 const configProcessor=evaluate(sources[fixed?'config-processor-fork-fix.ts':'config-processor.ts'],'configProcessor',{
  AtomicAssetsUpdatePriority:{TABLE_CONFIG:10},parseContractMajorVersion});
 let destroy;
 const result={core,db,calls,
  async initialize(config,tokenconfigs){core.seed={config,tokenconfigs};await initialize.call(core,db);if(!destroy)destroy=configProcessor(core,processor);},
  async restart(){await initialize.call(core,db);},
  async apply(table,value,present=true){const callback=callbacks.find(row=>row.table===table);assert.ok(callback);await callback.fn(db,{block_num:2},{present,value:plain(value)});},
  async notifyFork(){for(const callback of forks)await callback(db);},
  snapshot(){return structuredClone({rows,configs});},
  rollback(snapshot){({rows,configs}=structuredClone(snapshot));},
  seedNeighbor(name){configs.set(name,{contract:name,version:'neighbor',collection_format:[]});rows.set(name+':OTHER',{contract:name,token_symbol:'OTHER',token_contract:'other.token',token_precision:9});},
  async data(params={}){return plain(await getConfigAction(params,{db,coreArgs:core.args}));},
  async response({query={},body={},method='GET'}={}){
   const bindings=[],cache=[];const web={server:db};web.returnAsJSON=wrap(web);web.caching=options=>{cache.push(options);return()=>{};};
   const configEndpoints=evaluate(sources['config-route.ts'],'configEndpoints',{getConfigAction,getOpenAPI3Responses:()=>({})});
   configEndpoints({args:core.args},{web},{get(path,...handlers){bindings.push({path,handlers});}});
   assert.deepEqual(plain(cache),[{ignoreQueryString:true}]);assert.equal(bindings[0].path,'/v1/config');
   if(!['GET','HEAD'].includes(method))return {status:404,registered:false};
   let status=200,response;const res={status(value){status=value;return this;},json(value){response=plain(value);return this;}};
   await bindings[0].handlers[1]({query,body,params:{}},res);
   return {status,body:response,headBody:method==='HEAD'?'':undefined,registered:true};
  },
  close(){if(destroy){destroy();destroy=undefined;}assert.equal(callbacks.length,0);assert.equal(forks.length,0);}
 };
 return result;
}
