import type {FastifyInstance,FastifyReply,FastifyRequest,HTTPMethods} from 'fastify';
import {StatefulContractError,type StatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedQueryHostV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import type {OperatorListHost} from '../atomicassets/internal/schema-query.js';
import {RoyaltyAttributeParameterError} from '../atomicmarket/internal/royalty-attribute-query.js';
import {parseRoyaltyTemplateParameters} from '../atomicmarket/internal/royalty-template-query.js';
import {royaltyTemplateRows} from '../atomicmarket/internal/royalty-rules.js';
import {ROYALTY_TEMPLATE_MODEL_ID} from '../stateful/royalty-rules.js';
const unavailable=(reply:FastifyReply)=>reply.code(503).header('retry-after','1').header('cache-control','no-store')
 .send({success:false,message:'Royalty template query unavailable; retry later.'});
export function registerRoyaltyTemplateRoute(server:FastifyInstance,options:{readonly projectionId:string;readonly contract:string;readonly maximum?:number;readonly inputBounds:{readonly queryBytes:number;readonly setValues:number};
 readonly indexedQueryHost?:(request:FastifyRequest,projectionId:string,modelId:string)=>Promise<IndexedQueryHostV1>;
 readonly operatorLists?:(request:FastifyRequest)=>OperatorListHost|Promise<OperatorListHost>}):void{
 server.route<{Params:{collection_name:string}}>({url:'/atomicmarket/v1/royalties/:collection_name/templates',
  method:server.supportedMethods.filter(method=>method!=='HEAD') as HTTPMethods[],exposeHeadRoute:true,handler:async(request,reply)=>{
   const params={...request.query as Record<string,unknown>,...request.body as Record<string,unknown>};let query;
   try{query=await parseRoyaltyTemplateParameters(params,options.contract,request.params.collection_name,options.inputBounds,
    options.operatorLists?()=>options.operatorLists!(request):undefined,options.maximum);}
   catch(error){if(error instanceof RoyaltyAttributeParameterError)return reply.code(400).send({success:false,message:error.message});return unavailable(reply);}
   if(!options.indexedQueryHost)return unavailable(reply);
   try{const host=await options.indexedQueryHost(request,options.projectionId,ROYALTY_TEMPLATE_MODEL_ID);
    const result=await host.compose(options.projectionId,async read=>{const answer=await read.query(query);
     if(answer.kind!=='page')throw new StatefulContractError('stateful.unavailable','Royalty template query did not return a page');
     return {success:true,data:royaltyTemplateRows(answer,options.contract,request.params.collection_name),query_time:Date.now()} as StatefulRecord;});return reply.send(result.value);
   }catch{return unavailable(reply);}
  }});
}
