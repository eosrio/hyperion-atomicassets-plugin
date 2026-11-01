// Actual pinned functions in a finite VM. No application, controller, database client or child imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
import {join} from 'node:path';
const folder=new URL('./schema-list-original-2.7/',import.meta.url);
export const manifest=JSON.parse(readFileSync(new URL('manifest.json',folder))),sources={};
for(const [name,pin] of Object.entries(manifest.sources)) {
 const raw=readFileSync(new URL(name,folder));assert.equal(raw.length,pin.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),pin.sha256);
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex'),pin.gitBlob);sources[name]=raw.toString();
}
const codec=readFileSync(process.env.ATOMIC_SCHEMA_PACKAGE_ROOT?join(process.env.ATOMIC_SCHEMA_PACKAGE_ROOT,manifest.codec.path):new URL(manifest.codec.path,new URL('../../',import.meta.url)));
assert.equal(codec.length,manifest.codec.bytes);assert.equal(createHash('sha256').update(codec).digest('hex'),manifest.codec.sha256);
const plain=value=>JSON.parse(JSON.stringify(value));
function between(source,start,end){const first=source.indexOf(start);assert.ok(first>=0,start);const last=source.indexOf(end,first+start.length);assert.ok(last>first,end);return source.slice(first,last);}
function evaluate(source,expression,bindings={}) {
 const code=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\r?\n/gm,''),{mode:'strip'})
  .replace(/^export default class /gm,'class ').replace(/^export /gm,'');
 assert.doesNotMatch(code,/(?:^|\n)[ \t]*(?:import\s|(?:const|let|var)\s+\w+\s*=\s*require\()/);
 return new Script(code+'\n;('+expression+');').runInContext(createContext(bindings));
}
const numbers=evaluate(between(sources['utils.ts'],'export function toInt','export function isWeakIntArray'),'{toInt,isWeakInt,isWeakFloat}');
const ApiError=evaluate(sources['error.ts'],'ApiError');
const mergeSchemaFormatTypes=evaluate(between(codec.toString(),'function mergeSchemaFormatTypes','// Annotate the CommonJS'),'mergeSchemaFormatTypes');
const formatSchema=evaluate(sources['format.ts'],'formatSchema',{mergeSchemaFormatTypes});
const QueryBuilder=evaluate(sources['builder.ts'],'QueryBuilder',{isWeakIntArray:values=>values.every(numbers.isWeakInt)});
const wrapper=between(sources['server.ts'],'    returnAsJSON = ','    private middleware').trim().slice('returnAsJSON = '.length).replace(/;\s*$/,'');

/** Storage results and moize promise caching are modeled. Handler/builder/validation/wrapper execute original source. */
export function originalSchemaList({lists={},rows=[],count='0',maximum}={}) {
 const calls=[],listCalls=[],cacheOptions=[],db={
  async query(sql,values){calls.push({sql,values:plain(values)});if(typeof rows==='function')return rows(sql,values);
   return {rows:sql.startsWith('SELECT COUNT(*)')?[{counter:count}]:plain(rows)};},
  async fetchOne(_sql,[name]){listCalls.push(name);if(lists[name]instanceof Error)throw lists[name];return {items:lists[name]??null};},
 };
 const validation=evaluate(sources['validation.ts'],'{filterQueryArgs,addValidationType,parseTypeString,validateId,validateName,validateString}',{...numbers,ApiError});
 const moize=options=>{cacheOptions.push(plain(options));return fn=>{const cache=new Map();return(...args)=>{if(!cache.has(args[0]))cache.set(args[0],fn(...args));return cache.get(args[0]);};};};
 evaluate(sources['lists.ts'],'initListValidator',{...validation,moize})(db);
 const buildBoundaryFilter=evaluate(sources['boundaries.ts'],'buildBoundaryFilter',validation);
 const buildGreylistFilter=evaluate(between(sources['greylists.ts'],'export async function buildGreylistFilter','export async function buildHideOffersFilter'),'buildGreylistFilter',validation);
 const handler=evaluate(sources['schemas.ts'],'{getSchemasAction,getSchemasCountAction}',{...validation,QueryBuilder,buildBoundaryFilter,buildGreylistFilter,formatSchema});
 const mergeRequestData=evaluate(sources['boundaries.ts'],'mergeRequestData');
 const respondApiError=evaluate(between(sources['api-utils.ts'],'export function respondApiError',"// Express's 'trust proxy'"),'respondApiError',{logger:{warn(){}}});
 const core={args:{atomicassets_account:'atomicassets',...(maximum!==undefined?{limits:{schemas:maximum}}:{})}},web={server:db};
 const wrap=evaluate('',`(function(){return (${stripTypeScriptTypes(wrapper,{mode:'strip'})});}).call(web)`,{web,mergeRequestData,respondApiError});
 return {calls,listCalls,cacheOptions,
  async response(query={},body={},countOnly=false){let status=200,value;
   const response={status(code){status=code;return this;},json(data){value=data;return this;}};
   await wrap(countOnly?handler.getSchemasCountAction:handler.getSchemasAction,core)({query,body},response);
   return {status,body:plain(value)};
  },
 };
}
