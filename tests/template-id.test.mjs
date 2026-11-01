import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import Fastify from 'fastify';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
import {pathToFileURL} from 'node:url';
const {createAtomicStatefulPlugin}=await import(pathToFileURL(process.env.ATOMIC_PLUGIN_ENTRY??join(process.cwd(),'dist/index.js')).href);
const root=process.env.AA_REFERENCE_ROOT;
const ref=createRequire(join(root,'package.json'));ref('@swc-node/register');
const {getTemplateAction}=ref('./src/api/namespaces/atomicassets/handlers/templates.ts');
const contract='atomicassets', collection='example', id='42', schema='items';
const col={contract,collection_name:collection,author:'alice',allow_notify:true,authorized_accounts:['alice'],notify_accounts:[],market_fee:0.1,data:{name:'Example',img:'image'},created_at_block:'10',created_at_time:'1000'};
const sch={contract,collection_name:collection,schema_name:schema,format:[{name:'name',type:'string'}],types:[],created_at_block:'11',created_at_time:'1100'};
const template={contract,template_id:id,collection_name:collection,schema_name:schema,transferable:true,burnable:false,issued_supply:'2',max_supply:'9',immutable_data:{name:'immutable'},mutable_data:{name:'mutable',description:'current'},created_at_block:'12',created_at_time:'1200',deleted_at_block:null,deleted_at_time:null};
const master={contract,template_id:id,is_transferable:true,is_burnable:false,issued_supply:'2',max_supply:'9',collection_name:collection,authorized_accounts:['alice'],collection:{collection_name:collection,name:'Example',img:'image',images:null,author:'alice',allow_notify:true,authorized_accounts:['alice'],notify_accounts:[],market_fee:0.1,created_at_block:'10',created_at_time:'1000'},schema_name:schema,schema:{schema_name:schema,format:sch.format,types:[],created_at_block:'11',created_at_time:'1100'},immutable_data:template.immutable_data,mutable_data:template.mutable_data,created_at_block:'12',created_at_time:'1200',deleted_at_block:null,deleted_at_time:null};
const rows=new Map([['template'+JSON.stringify([contract,id]),template],['collection'+JSON.stringify([contract,collection]),col],['schema'+JSON.stringify([contract,collection,schema]),sch]]);
let unavailable=false, fenced=false;
const api=Fastify();api.setErrorHandler((_e,_q,r)=>r.code(503).send({success:false}));
createAtomicStatefulPlugin({limits:{...atomicLimits,selectors:128,recordKinds:20,readAttempts:128,mutations:64}}).addRoutes(api,{statefulQueryHost(){return {async compose(_id,f){const value=await f({async get(k,key){if(unavailable)return {status:'unavailable',reason:'unknown'};return rows.has(k+key)?{status:'present',value:structuredClone(rows.get(k+key))}:{status:'covered-absent'};}});if(fenced)throw Error('final fence');return {value};}};}});
test('actual original handler and formatter match request-scoped template route',async()=>{
  for(const [name,requestId] of [[collection,id],[collection,'042'],['wrong',id],[collection,'99'],[collection,'bad']]){
    let original;try{const result=await getTemplateAction({}, {pathParams:{collection_name:name,template_id:requestId},coreArgs:{atomicassets_account:contract},db:{async query(sql,args){assert.equal(sql,'SELECT * FROM atomicassets_templates_master WHERE contract = $1 AND template_id = $2 LIMIT 1');const found=Number(args[1])===42?[structuredClone(master)]:[];return {rows:found,rowCount:found.length};}}});original={status:200,body:{success:true,data:JSON.parse(JSON.stringify(result))}};}catch(e){original={status:e.code===404?416:e.code,body:{success:false,message:e.message}};}
    const response=await api.inject('/atomicassets/v1/templates/'+name+'/'+requestId),body=response.json();delete body.query_time;
    assert.deepEqual({status:response.statusCode,body},original);
  }
});



test('unknown coverage and the final host fence fail closed',async()=>{
  unavailable=true;assert.equal((await api.inject('/atomicassets/v1/templates/example/42')).statusCode,503);
  unavailable=false;fenced=true;for(const id of ['42','99'])assert.equal((await api.inject('/atomicassets/v1/templates/example/'+id)).statusCode,503);
  fenced=false;
});
