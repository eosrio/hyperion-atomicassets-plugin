import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {IndexedPredicateV1,IndexedQueryHostV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {domainKey} from '../atomicassets/internal/lifecycle-port.js';
import {OWNED_SCHEMA_MODEL_ID,ownedSchemaOrder} from '../stateful/owned-schema-indexed.js';

/** Optional opt-in component: no listener, authority, source coverage or cache is established here. */
export function registerOwnedSchemaRoute(server:FastifyInstance,options:{projectionId:string;contract:string;responseRecords:number;
 indexedQueryHost?:(request:FastifyRequest,projectionId:string,modelId:string)=>Promise<IndexedQueryHostV1>}):void {
 server.all<{Params:{collection_name:string}}>('/atomicassets/v1/collections/:collection_name/schemas',async(request,reply)=>{
  const unavailable=()=>reply.code(503).header('retry-after','1').header('cache-control','no-store').send({success:false,message:'Owned schema query unavailable; retry later.'});
  if(!options.indexedQueryHost)return unavailable();
  try {
   const host=await options.indexedQueryHost(request,options.projectionId,OWNED_SCHEMA_MODEL_ID),collection=request.params.collection_name;
   const where:IndexedPredicateV1[]=[{field:'contract',op:'eq',value:options.contract},{field:'collection_name',op:'eq',value:collection},{field:'owned',op:'gt',value:'0'}];
   const result=await host.compose(options.projectionId,async read=>{
    const count=await read.query({kind:'count',exact:true,where});
    if(count.kind!=='count'||!/^\d+$/.test(count.value))throw Error('Invalid exact count');
    const total=BigInt(count.value),max=Math.max(0,options.responseRecords-1);
    if(total>BigInt(max))throw Error('Complete collection exceeds negotiated record budget');
    if(total===0n)return {success:true,data:[],query_time:Date.now()};
    const page=await read.query({kind:'page',where,order:ownedSchemaOrder,offset:'0',limit:Number(total),select:['schema_name'],records:[]});
    if(page.kind!=='page'||!page.complete||page.rows.length!==Number(total))throw Error('Incomplete owned schema result');
    const seen=new Set<string>(),data=page.rows.map(row=>{const name=row.fields.schema_name;
      if(typeof name!=='string'||!name||row.key!==domainKey(options.contract,collection,name)||seen.has(name))throw Error('Invalid owned schema row');
      seen.add(name);return {schema_name:name};});
    return {success:true,data,query_time:Date.now()};
   });
   return reply.send(result.value);
  }catch{return unavailable();}
 });
}
