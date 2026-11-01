// Raw pinned original functions in a finite VM. No application, DB, controller, child, listener or timer imports.
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
const directory=new URL('./royalty-original-2.7/',import.meta.url);
export const manifest=JSON.parse(readFileSync(new URL('manifest.json',directory)));
const sources={};
for(const [name,pin] of Object.entries(manifest.sources)){
 const raw=readFileSync(new URL(name,directory));assert.equal(raw.length,pin.bytes);
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),pin.sha256);
 assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex'),pin.gitBlob);
 sources[name]=raw.toString('utf8');
}
const plain=value=>JSON.parse(JSON.stringify(value));
function between(source,start,end){const first=source.indexOf(start);assert.ok(first>=0,start);assert.equal(source.indexOf(start,first+start.length),-1);
 const last=source.indexOf(end,first+start.length);assert.ok(last>first,end);return source.slice(first,last);}
function evaluate(source,expression,bindings={}){
 const code=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\r?\n/gm,''),{mode:'strip'}).replace(/^export /gm,'');
 assert.doesNotMatch(code,/(?:^|\n)[ \t]*(?:import\s|(?:const|let|var)\s+\w+\s*=\s*require\()/);
 return new Script(code+'\n;('+expression+');').runInContext(createContext({...bindings}));
}
const ApiError=evaluate(sources['error.ts'],'ApiError');
const encodeDatabaseJson=evaluate(sources['json.ts'],'encodeDatabaseJson');
const eosioTimestampToDate=evaluate(between(sources['eosio.source.txt'],'export function eosioTimestampToDate','\nexport function'),'eosioTimestampToDate');
const getRoyaltyConfigAction=evaluate(between(sources['handler.ts'],'export async function getRoyaltyConfigAction','\nexport async function getRoyaltyTemplateRulesAction'),'getRoyaltyConfigAction',{ApiError});
const royaltyProcessor=evaluate(sources['processor.ts'],'royaltyProcessor',{
 AtomicMarketUpdatePriority:{TABLE_ROYALTIES:1010,ACTION_LOG_ROYALTIES:1040},encodeDatabaseJson,eosioTimestampToDate});
const mergeRequestData=evaluate(between(sources['namespace-utils.source.txt'],'export function mergeRequestData','\nexport async function buildBoundaryFilter'),'mergeRequestData');
const respondApiError=evaluate(between(sources['api-utils.source.txt'],'export function respondApiError',"// Express's 'trust proxy'"),'respondApiError',{logger:{warn(){}}});
const wrapper=between(sources['server.source.txt'],'    returnAsJSON = ','    private middleware').trim().slice('returnAsJSON = '.length).replace(/;\s*$/,'');
const wrap=web=>evaluate('',`(function(){return (${stripTypeScriptTypes(wrapper,{mode:'strip'})});}).call(web)`,{web,mergeRequestData,respondApiError});
const expressRedisCache=evaluate(sources['cache.ts'],'expressRedisCache',{crypto,Buffer,logger:{debug(){}},mergeRequestData});
function int(value,bits=64){const n=BigInt(value),edge=1n<<BigInt(bits-1);assert.ok(n>=-edge&&n<edge);return bits===16?Number(n):n.toString();}
function jsonb(value){const parsed=JSON.parse(value);function check(v){if(typeof v==='string')assert.doesNotMatch(v,/[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
 if(v&&typeof v==='object')for(const[k,item]of Object.entries(v)){check(k);check(item);}}check(parsed);return parsed;}

/** Only the storage boundary is modeled; callbacks/handler/wrapper/registration remain original. */
export function original(contract='atomicmarket'){
 let rows=new Map();const callbacks=[],registrations=[],calls=[],cachedOptions=[];
 const storage=(row)=>({...plain(row),founders:jsonb(row.founders),attribute_mode:int(row.attribute_mode,16),
  ...Object.fromEntries(['split_founders','split_templates','split_attributes','updated_at_block','updated_at_time','created_at_block','created_at_time'].map(k=>[k,int(row[k])]))});
 const db={
  async replace(table,row,keys,preserve){assert.equal(table,'atomicmarket_royalties_config');assert.deepEqual(plain(keys),['market_contract','collection_name']);assert.deepEqual(plain(preserve),['created_at_block','created_at_time']);
   const k=JSON.stringify([row.market_contract,row.collection_name]),old=rows.get(k);rows.set(k,{...storage(row),...(old?{created_at_block:old.created_at_block,created_at_time:old.created_at_time}:{})});},
  async delete(table,where){assert.equal(table,'atomicmarket_royalties_config');rows.delete(JSON.stringify(plain(where.values)));},
  async query(sql,values){assert.equal(sql,'SELECT * FROM atomicmarket_royalties_config WHERE market_contract = $1 AND collection_name = $2');calls.push({sql,values:plain(values)});
   const row=rows.get(JSON.stringify(plain(values)));return {rows:row?[plain(row)]:[],rowCount:row?1:0};}
 };
 const processor={onContractRow(account,table,fn,priority){assert.equal(account,contract);assert.equal(priority,1010);const item={table,fn};callbacks.push(item);return()=>callbacks.splice(callbacks.indexOf(item),1);},
  onActionTrace(){const item={};registrations.push(item);return()=>registrations.splice(registrations.indexOf(item),1);}};
 const destroy=royaltyProcessor({args:{atomicmarket_account:contract}},processor);
 const web={server:db,caching(options){cachedOptions.push(options);return()=>{};}};web.returnAsJSON=wrap(web);
 const outside=()=>{throw Error('Original family outside the royalty config component');};
 const royaltiesEndpoints=evaluate(sources['route.ts'],'royaltiesEndpoints',{getRoyaltyConfigAction,getRoyaltyAccountAction:outside,getRoyaltyAttributeRulesAction:outside,
  getRoyaltyPayoutsAction:outside,getRoyaltyPayoutsCountAction:outside,getRoyaltyTemplateRulesAction:outside,getOpenAPI3Responses:()=>({}),getPrimaryBoundaryParams:()=>[],paginationParameters:[]});
 const bindings=[];royaltiesEndpoints({args:{atomicmarket_account:contract}},{web},{all(path,...handlers){bindings.push({path,handlers});}});
 return {calls,bindings,cachedOptions,
  async apply(value,{present=true,blockNum=1,timeMs=1700000001000}={}){const fn=callbacks.find(row=>row.table==='royaltyconf').fn;
   await fn(db,{block_num:blockNum,timestamp:new Date(timeMs).toISOString().replace(/Z$/,'')},{present,value:plain(value)});},
  async data(collection){return plain(await getRoyaltyConfigAction({}, {db,coreArgs:{atomicmarket_account:contract},pathParams:{collection_name:collection}}));},
  async response(collection,{query={},body={},method='GET'}={}){
   assert.ok(bindings.findIndex(x=>x.path==='/v1/royalties/payouts')<bindings.findIndex(x=>x.path==='/v1/royalties/:collection_name'));
   if(collection==='payouts')return {outsideComponent:true};
   let status=200,value;const res={status(v){status=v;return this;},json(v){value=plain(v);return this;}};
   await bindings.find(x=>x.path==='/v1/royalties/:collection_name').handlers[1]({query,body,method,params:{collection_name:collection}},res);
   return {status,body:value,headBody:method==='HEAD'?'':undefined};
  },snapshot(){return structuredClone(rows);},rollback(snapshot){rows=structuredClone(snapshot);},close(){destroy();assert.equal(callbacks.length,0);assert.equal(registrations.length,0);}
 };
}

/** Actual original cache middleware with a finite Redis collaborator; no native cache or host claim. */
export async function originalCache({expire=5,maxValueBytes=2000000}={}){
 const values=new Map(),gets=[],sets=[],expiries=[];
 const redis={get:async key=>{gets.push(key);return values.get(key)??null;},set:async(key,value)=>{sets.push({key,value});values.set(key,value);},expire:async(key,seconds)=>{expiries.push({key,seconds});}};
 const middleware=expressRedisCache(redis,'finite-royalty',expire,undefined,maxValueBytes)();
 return {gets,sets,expiries,values,
  async request({query={},body={},method='GET',status=200,payload='{"success":true}'}={}){
   let answer,nextCalled=false;const req={baseUrl:'/atomicmarket',path:'/v1/royalties/collection',query,body,method};
   await new Promise(resolve=>{const res={statusCode:status,getHeader:()=> 'application/json',contentType(){return this;},status(n){this.statusCode=n;return this;},send(value){answer=value;resolve();return this;}};
    middleware(req,res,()=>{nextCalled=true;res.send(payload);if(payload===undefined)resolve();});});
   await Promise.resolve();await Promise.resolve();return {answer,nextCalled,key:gets.at(-1)};
  }};
}
