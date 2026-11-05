import {createRequire} from 'node:module';import {originalRules} from '../../../tests/fixtures/royalty-rule-original.mjs';
const require=createRequire(import.meta.url),{cases}=require('./royalty-rule-plan.cjs');
const out=[];for(const p of cases){const o=originalRules('atomicmarket',{queryPort:async()=>({rows:[],rowCount:0})});const response=await o.response('oracle',{route:p.route,query:p.query??{},body:p.body??{},method:p.method??'GET'});out.push({name:p.name,status:response.status,calls:o.calls});o.close();}process.stdout.write(JSON.stringify(out,null,2)+'\n');
