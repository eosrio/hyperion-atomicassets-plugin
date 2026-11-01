// Exact original functions in finite collaborators. No app, DB, controller, process or timer imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
const directory=new URL('./royalty-rule-original-2.7/',import.meta.url);
export const manifest=JSON.parse(readFileSync(new URL('manifest.json',directory))),sources={};
for(const[name,pin]of Object.entries(manifest.sources)){
 const b=readFileSync(new URL(name,directory));assert.equal(b.length,pin.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),pin.sha256);
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex'),pin.gitBlob);sources[name]=b.toString();
}
const plain=v=>JSON.parse(JSON.stringify(v));
function between(source,start,end){const a=source.indexOf(start);assert.ok(a>=0,start);const b=source.indexOf(end,a+start.length);assert.ok(b>a,end);return source.slice(a,b);}
function evaluate(source,expression,bindings={}){
 const code=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\r?\n/gm,''),{mode:'strip'}).replace(/^export default class /gm,'class ').replace(/^export /gm,'');
 assert.doesNotMatch(code,/(?:^|\n)[ \t]*(?:import\s|(?:const|let|var)\s+\w+\s*=\s*require\()/);
 return new Script(code+'\n;('+expression+');').runInContext(createContext(bindings));
}
const numbers=evaluate(between(sources['numbers.ts'],'export function toInt','export function isWeakIntArray'),'{toInt,isWeakInt,isWeakFloat}');
const ApiError=evaluate(sources['error.ts'],'ApiError'),encodeDatabaseJson=evaluate(sources['json.ts'],'encodeDatabaseJson');
const eosioTimestampToDate=evaluate(between(sources['eosio.ts'],'export function eosioTimestampToDate','\nexport function'),'eosioTimestampToDate');
const QueryBuilder=evaluate(sources['builder.ts'],'QueryBuilder',{isWeakIntArray:values=>values.every(numbers.isWeakInt)});
const royaltyProcessor=evaluate(sources['processor.ts'],'royaltyProcessor',{Buffer,encodeDatabaseJson,eosioTimestampToDate,
 AtomicMarketUpdatePriority:{TABLE_ROYALTIES:1010,ACTION_LOG_ROYALTIES:1040}});
const mergeRequestData=evaluate(sources['namespace-utils.ts'],'mergeRequestData');
const respondApiError=evaluate(between(sources['api-utils.ts'],'export function respondApiError',"// Express's 'trust proxy'"),'respondApiError',{logger:{warn(){}}});
const wrapper=between(sources['server.ts'],'    returnAsJSON = ','    private middleware').trim().slice('returnAsJSON = '.length).replace(/;\s*$/,'');
function int(value,bits=64){const n=BigInt(value),edge=1n<<BigInt(bits-1);assert(n>=-edge&&n<edge);return bits===16?Number(n):n.toString();}
function unicode(value){if(typeof value==='string')assert.doesNotMatch(value,/[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
 if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){unicode(k);unicode(v);}}
function varchar(v){assert.equal(typeof v,'string');unicode(v);assert([...v].length<=12);return v;}
function jsonb(v){const result=JSON.parse(v);unicode(result);return result;}
const tableName=table=>table==='royaltytemp'?'atomicmarket_royalties_templates':'atomicmarket_royalties_attributes';

/** SQL storage casts/results are modeled; callbacks/handler/parser/builder/wrapper/registration execute original bytes. */
export function originalRules(contract='atomicmarket',{maximum,lists={}}={}){
 let rows=new Map(),resultRows=[];const callbacks=[],actions=[],calls=[],bindings=[],cachedOptions=[];
 const db={async replace(table,row,keys,preserve){
  const template=table==='atomicmarket_royalties_templates';assert(template||table==='atomicmarket_royalties_attributes');
  const id=template?'template_id':'rule_id';assert.deepEqual(plain(keys),['market_contract','collection_name',id]);assert.deepEqual(plain(preserve),['created_at_block','created_at_time']);
  const value={market_contract:varchar(row.market_contract),collection_name:varchar(row.collection_name),[id]:int(row[id]),recipients:jsonb(row.recipients),
   ...Object.fromEntries(['updated_at_block','updated_at_time','created_at_block','created_at_time'].map(k=>[k,int(row[k])]))};
  if(!template){assert(Buffer.isBuffer(row.lookup_hash));assert.equal(typeof row.field,'string');Object.assign(value,{source:int(row.source,16),field:row.field,value:jsonb(row.value),weight:int(row.weight),lookup_hash:row.lookup_hash.toString('hex')});unicode(value.field);}
  const key=JSON.stringify([table,value.market_contract,value.collection_name,value[id]]),previous=rows.get(key);
  rows.set(key,{...value,...(previous?{created_at_block:previous.created_at_block,created_at_time:previous.created_at_time}:{})});
 },async delete(table,where){assert.ok(['atomicmarket_royalties_templates','atomicmarket_royalties_attributes'].includes(table));
  const[market,collection,id]=plain(where.values);rows.delete(JSON.stringify([table,market,collection,int(id)]));},
  async query(sql,values){calls.push({sql,values:plain(values)});return{rows:plain(resultRows)};}};
 const processor={onContractRow(account,table,fn,priority){assert.equal(account,contract);assert.equal(priority,1010);const item={table,fn};callbacks.push(item);return()=>callbacks.splice(callbacks.indexOf(item),1);},
  onActionTrace(){const item={};actions.push(item);return()=>actions.splice(actions.indexOf(item),1);}};
 const destroy=royaltyProcessor({args:{atomicmarket_account:contract}},processor);
 const validation=evaluate(sources['validation.ts'],'{filterQueryArgs,addValidationType,parseTypeString,validateId,validateName,validateString}',{...numbers,ApiError});
 let activeRoute='attributes',listReads=0;
 const listDb={fetchOne:async(_sql,[name])=>{if(activeRoute!=='templates')throw Error('Attribute handler must not read operator lists');listReads++;return{items:lists[name]??null};}};
 const moize=()=>fn=>fn;evaluate(sources['lists.ts'],'initListValidator',{...validation,moize})(listDb);
 const getRoyaltyTemplateRulesAction=evaluate(between(sources['handler.ts'],'export async function getRoyaltyTemplateRulesAction','\nexport async function getRoyaltyAttributeRulesAction'),'getRoyaltyTemplateRulesAction',{...validation,QueryBuilder});
 const getRoyaltyAttributeRulesAction=evaluate(between(sources['handler.ts'],'export async function getRoyaltyAttributeRulesAction','\nexport async function getRoyaltyPayoutsAction'),'getRoyaltyAttributeRulesAction',{...validation,QueryBuilder});
 const web={server:db,caching(options){cachedOptions.push(options);return()=>{};}};
 web.returnAsJSON=evaluate('',`(function(){return (${stripTypeScriptTypes(wrapper,{mode:'strip'})});}).call(web)`,{web,mergeRequestData,respondApiError});
 const outside=()=>{throw Error('Original handler outside attribute list component');};
 const endpoints=evaluate(sources['routes.ts'],'royaltiesEndpoints',{getRoyaltyAttributeRulesAction,getRoyaltyConfigAction:outside,getRoyaltyTemplateRulesAction,
  getRoyaltyPayoutsAction:outside,getRoyaltyPayoutsCountAction:outside,getRoyaltyAccountAction:outside,getOpenAPI3Responses:()=>({}),getPrimaryBoundaryParams:()=>[],paginationParameters:[]});
 endpoints({args:{atomicmarket_account:contract,...(maximum!==undefined?{limits:{royalties:maximum}}:{})}},{web},{all(path,...handlers){bindings.push({path,handlers});}});
 return{calls,bindings,cachedOptions,get listReads(){return listReads;},assertAttributeListGuard:()=>listDb.fetchOne('', ['guard']),
  async apply(table,value,{scope='collection',present=true,blockNum=1,timeMs=1700000001000}={}){
   assert(['royaltytemp','royaltyattr'].includes(table));await callbacks.find(x=>x.table===table).fn(db,{block_num:blockNum,timestamp:new Date(timeMs).toISOString().replace(/Z$/,'')},{scope,present,value:plain(value)});
  },data(table,collection,id){const row=rows.get(JSON.stringify([tableName(table),contract,collection,int(id)]));return row?plain(row):null;},
  async response(collection,{query={},body={},method='GET',rows:replyRows=[],route='attributes'}={}){
   resultRows=replyRows;activeRoute=route;let status=200,value;const res={status(v){status=v;return this;},json(v){value=plain(v);return this;}};
   try{await bindings.find(x=>x.path===`/v1/royalties/:collection_name/${route}`).handlers[1]({query,body,method,params:{collection_name:collection}},res);}finally{activeRoute='attributes';}
   return{status,body:value,headBody:method==='HEAD'?'':undefined};
  },snapshot(){return structuredClone(rows);},rollback(saved){rows=structuredClone(saved);},close(){destroy();assert.equal(callbacks.length,0);assert.equal(actions.length,0);}};
}
