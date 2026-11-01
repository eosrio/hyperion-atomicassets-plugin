import type {FastifyInstance,FastifyReply,FastifyRequest,HTTPMethods} from 'fastify';
import type {StatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedQueryHostV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import type {OperatorListHost} from '../atomicassets/internal/schema-query.js';
import {parseSchemaListParameters,SchemaListParameterError} from '../atomicassets/internal/schema-list-parameters.js';
import {schemaListRows,SchemaListDatabaseError} from '../atomicassets/internal/schema-list.js';
import {SCHEMA_LIST_MODEL_ID} from '../stateful/schema-indexed.js';

const unavailable=(reply:FastifyReply)=>reply.code(503).header('retry-after','1').header('cache-control','no-store')
  .send({success:false,message:'Schema query unavailable; retry later.'});

/** Optional existing host port; this opens no listener, adapter, cache or readiness authority. */
export function registerSchemaListRoutes(server:FastifyInstance,options:{readonly projectionId:string;readonly contract:string;
  readonly maximum?:number;readonly indexedQueryHost?:(request:FastifyRequest,projectionId:string,modelId:string)=>Promise<IndexedQueryHostV1>;
  readonly operatorLists?:(request:FastifyRequest)=>OperatorListHost|Promise<OperatorListHost>}):void {
  for(const countOnly of [false,true])server.route({url:'/atomicassets/v1/schemas'+(countOnly?'/_count':''),
    method:server.supportedMethods.filter(method=>method!=='HEAD') as HTTPMethods[],exposeHeadRoute:true,
    handler:async(request,reply)=>{
      // Original request body wins over query; _count then forces count=true without changing validation order.
      const params={...request.query as Record<string,unknown>,...request.body as Record<string,unknown>,...(countOnly?{count:'true'}:{})};
      let parsed;
      try {parsed=await parseSchemaListParameters(params,options.contract,
        options.operatorLists?()=>options.operatorLists!(request):undefined,options.maximum);}
      catch(error){if(error instanceof SchemaListParameterError)return reply.code(400).send({success:false,message:error.message});return unavailable(reply);}
      if(!options.indexedQueryHost)return unavailable(reply);
      try {
        const host=await options.indexedQueryHost(request,options.projectionId,SCHEMA_LIST_MODEL_ID);let status=200;
        const result=await host.compose(options.projectionId,async read=>{
          try {
            const answer=await read.query(parsed.request);
            const data=answer.kind==='count'?answer.value:schemaListRows(answer,options.contract);
            return {success:true,data,query_time:Date.now()} as StatefulRecord;
          } catch(error) {
            if(!(error instanceof SchemaListDatabaseError))throw error;
            status=500;return {success:false,message:error.message};
          }
        });
        return reply.code(status).send(result.value);
      }catch{return unavailable(reply);}
    }});
}
