import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import Fastify from 'fastify';
import {begin,caseInputs} from './fixtures/template-cases.mjs';
import {input,storage as legacyStorage} from './fixtures/asset-domain-cases.mjs';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
const storage=()=>{const s=legacyStorage();s.add('schema-asset-count',input.contract,input.collection,input.schema);return s;};

const root=process.env.AA_REFERENCE_ROOT, ref=createRequire(join(root,'package.json'));ref('@swc-node/register');
const {scriptedTransaction}=createRequire(import.meta.url)('../harness/atomicassets/original-controls.cjs');
const {default:Processor,ProcessingState}=ref('./src/filler/processor.ts');
const {configProcessor}=ref('./src/filler/handlers/atomicassets/processors/config.ts');
const {collectionProcessor}=ref('./src/filler/handlers/atomicassets/processors/collections.ts');
const {schemaProcessor}=ref('./src/filler/handlers/atomicassets/processors/schemas.ts');
const {templateProcessor}=ref('./src/filler/handlers/atomicassets/processors/templates.ts');
const {assetProcessor}=ref('./src/filler/handlers/atomicassets/processors/assets.ts');
const {getTemplateAction}=ref('./src/api/namespaces/atomicassets/handlers/templates.ts');
const {reduceAssetLifecycle}=await import(pathToFileURL(process.env.ATOMIC_DOMAIN_ENTRY??join(process.cwd(),'dist/atomicassets/internal/lifecycle.js')).href);
const {registerAtomicIdRoutes}=await import(pathToFileURL(process.env.ATOMIC_HTTP_ENTRY??join(process.cwd(),'dist/http/id-routes.js')).href);
// Export original WebServer in memory and disable only its constructor's route/poll initialization.
// This retains the actual original returnAsJSON field and cache middleware without opening a listener or a polling loop.
const filename=join(root,'src/api/server.ts');let source=readFileSync(filename,'utf8');
assert.equal((source.match(/class WebServer \{/g)||[]).length,1);
source=source.replace('class WebServer {','export class WebServer {');
const start=source.indexOf('    constructor(readonly server: HTTPServer) {',source.indexOf('export class WebServer {'));
const end=source.indexOf('    returnAsJSON =',start);assert.ok(start>0&&end>start);
source=source.slice(0,start)+'    constructor(readonly server: HTTPServer) {}\n\n'+source.slice(end);
const compiled=ref('@swc/core').transformSync(source,{filename,jsc:{parser:{syntax:'typescript',decorators:true},target:'es2022'},module:{type:'commonjs'}}).code;
const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(join(root,'src/api'));mod._compile(compiled,filename);
const {WebServer}=mod.exports;
const {expressRedisCache}=ref('./src/utils/cache.ts');
const copy=structuredClone;
function makeOriginal(){
 const boundary=scriptedTransaction(input.contract),core={args:{atomicassets_account:input.contract,store_transfers:false},config:{supported_tokens:[],collection_format:[]},tokenconfigs:{version:'1.0.0'}};
 const processor=new Processor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true});
 for(const setup of [configProcessor,collectionProcessor,schemaProcessor,templateProcessor])setup(core,processor);
 assetProcessor(core,processor,{sendActionTrace(){}});
 const rows=n=>boundary.tables.get('atomicassets_'+n)??[];
 const model=()=>rows('templates').flatMap(t=>{
  const c=rows('collections').find(x=>x.contract===t.contract&&x.collection_name===t.collection_name),s=rows('schemas').find(x=>x.contract===t.contract&&x.collection_name===t.collection_name&&x.schema_name===t.schema_name);
  if(!c||!s)return [];const d=JSON.parse(c.data),decode=x=>x==null?null:JSON.parse(x),text=x=>x==null?null:String(x);
  return [{contract:t.contract,template_id:String(t.template_id),is_transferable:t.transferable,is_burnable:t.burnable,issued_supply:String(t.issued_supply),max_supply:String(t.max_supply),collection_name:t.collection_name,authorized_accounts:c.authorized_accounts,
   collection:{collection_name:c.collection_name,name:d.name??null,img:d.img??null,images:d.images??null,author:c.author,allow_notify:c.allow_notify,authorized_accounts:c.authorized_accounts,notify_accounts:c.notify_accounts,market_fee:c.market_fee,created_at_block:String(c.created_at_block),created_at_time:String(c.created_at_time)},
   schema_name:t.schema_name,schema:{schema_name:s.schema_name,format:s.format.map(JSON.parse),types:(s.types??[]).map(JSON.parse),created_at_block:String(s.created_at_block),created_at_time:String(s.created_at_time)},immutable_data:decode(t.immutable_data),mutable_data:decode(t.mutable_data),created_at_time:String(t.created_at_time),created_at_block:String(t.created_at_block),deleted_at_time:text(t.deleted_at_time),deleted_at_block:text(t.deleted_at_block)}];
 });
 return {async run(b){const block={block_num:Number(b.blockNum),block_id:b.blockId,timestamp:new Date(Number(b.blockTimeMs)).toISOString().slice(0,-1)};
  for(const e of b.events){if(e.kind==='row')processor.processContractRow(block,{code:input.contract,scope:e.scope,table:e.table,present:e.present,value:copy(e.value)});else processor.processActionTrace(block,{id:e.transactionId},{act:{account:input.contract,name:e.name,data:copy(e.value)},global_sequence:'9007199254740993'});}await processor.executeHeadQueue(boundary.db);},
  async query(sql,args){assert.equal(sql,'SELECT * FROM atomicassets_templates_master WHERE contract = $1 AND template_id = $2 LIMIT 1');const found=model().filter(x=>x.contract===args[0]&&BigInt(x.template_id)===BigInt(args[1]));return {rows:copy(found),rowCount:found.length};}};
}
function bridge(original,cacheLife=0){
 const cache=new Map(),calls=[];const redis={async get(k){calls.push(['get',k]);return cache.get(k);},async set(k,v){calls.push(['set',k]);cache.set(k,v);},async expire(k,n){calls.push(['expire',k,n]);}};
 const web=new WebServer({config:{cache_life:cacheLife},connection:{redis:{ioRedis:redis},chain:{name:'source-control'}},query:original.query});
 const api=Fastify(),middleware=web.returnAsJSON(getTemplateAction,{args:{atomicassets_account:input.contract}}),caching=expressRedisCache(redis,'eosio-contract-api:source-control:express-cache:',cacheLife)({ignoreQueryString:true});
 api.all('/atomicassets/v1/templates/:collection_name/:template_id',async(req,reply)=>{
  const headers={};const res={statusCode:200,getHeader:n=>headers[n.toLowerCase()],setHeader(n,v){headers[n.toLowerCase()]=v;return this;},contentType(v){this.setHeader('content-type',v);return this;},status(n){this.statusCode=n;return this;},send(data){reply.code(this.statusCode);for(const [k,v]of Object.entries(headers))reply.header(k,v);reply.send(data);return this;},json(data){this.setHeader('content-type','application/json; charset=utf-8');return this.send(JSON.stringify(data));}};
  const request={params:req.params,query:req.query,body:req.body,baseUrl:'/atomicassets',path:'/v1/templates/'+req.params.collection_name+'/'+req.params.template_id,method:req.method};
  await new Promise((resolve,reject)=>{caching(request,res,()=>Promise.resolve(middleware(request,res)).then(resolve,reject));reply.raw.once('finish',resolve);});return reply;
 });return {api,calls};
}
function current(reader){const api=Fastify();api.setErrorHandler((_e,_r,reply)=>reply.code(503).send({success:false}));registerAtomicIdRoutes(api,{atomicassets:{contract:input.contract,projectionId:'assets'},atomicmarket:{contract:'atomicmarket',projectionId:'market'},queryHost:()=>({async compose(_p,f){return {value:await f(reader())};}})});return api;}
function clean(r){const body=r.json();delete body.query_time;return {status:r.statusCode,body,contentType:r.headers['content-type']};}
test('same lifecycle occurrences reach original wrapper and current route',async()=>{
 const orig=makeOriginal(),s=storage();s.add('template',input.contract,'42');s.add('template',input.contract,'99');const old=bridge(orig),api=current(s.reader);
 for(const b of caseInputs().cases.find(c=>c.name==='chronological').blocks){await orig.run(b);await s.run(reduceAssetLifecycle,b,b.events);
  for(const [name,id] of [[input.collection,'42'],['wrong','42'],[input.collection,'99'],[input.collection,'invalid']]){
   const path='/atomicassets/v1/templates/'+name+'/'+id;const actual=clean(await api.inject(path)),reference=clean(await old.api.inject(path));
   assert.deepEqual(actual,reference);}}
});
test('actual original cache ignores query and holds success, never caches errors',async()=>{
 const orig=makeOriginal(),s=storage(),blocks=caseInputs().cases[0].blocks;s.add('template',input.contract,'42');await orig.run(blocks[0]);await s.run(reduceAssetLifecycle,blocks[0],blocks[0].events);const {api,calls}=bridge(orig,60),now=current(s.reader),path='/atomicassets/v1/templates/'+input.collection+'/42';
 const a=await api.inject(path+'?x=1'),b=await api.inject(path+'?x=2');assert.deepEqual(clean(a),clean(b));assert.equal(calls.filter(c=>c[0]==='set').length,1);
 await orig.run(blocks[1]);await s.run(reduceAssetLifecycle,blocks[1],blocks[1].events);
 const cached=clean(await api.inject(path+'?x=3')),fresh=clean(await now.inject(path));
 assert.deepEqual(cached,clean(a));assert.notDeepEqual(cached.body.data.mutable_data,fresh.body.data.mutable_data);
 await api.inject('/atomicassets/v1/templates/'+input.collection+'/99');assert.equal(calls.filter(c=>c[0]==='set').length,1);
});
