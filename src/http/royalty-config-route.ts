import type {FastifyInstance,FastifyRequest,HTTPMethods} from 'fastify';
import type {StatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import type {StatefulCompleteKindQueryHostV1} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {readRoyaltyConfig} from '../atomicmarket/internal/royalty-config.js';

/** Additive existing-host route; the host retains request/cache/onSend authority. */
export function registerRoyaltyConfigRoute(server: FastifyInstance, options: {readonly projectionId: string;readonly contract: string;
  readonly queryHost?: (request: FastifyRequest, projectionId: string) => Promise<StatefulCompleteKindQueryHostV1>}): void {
  // Same supported methods as all(), letting Fastify's existing GET/HEAD path suppress the HEAD body.
  server.route<{Params:{collection_name:string}}>({url:'/atomicmarket/v1/royalties/:collection_name',
    method:server.supportedMethods.filter(method=>method!=='HEAD') as HTTPMethods[],exposeHeadRoute:true,handler:async(request,reply)=>{
    // The original static payout route wins over this wildcard. Its family is still unavailable.
    if (request.params.collection_name==='payouts') throw new StatefulContractError('stateful.unavailable','Royalty payouts are outside the configuration component');
    if (!options.queryHost) throw new StatefulContractError('stateful.unavailable','Counted royalty query host unavailable');
    const host=await options.queryHost(request,options.projectionId);let status=200;
    const result=await host.compose(options.projectionId,async reader=>{
      const data=await readRoyaltyConfig(reader,options.contract,request.params.collection_name);
      if (data===null) {status=416;return {success:false,message:'Royalty config not found'};}
      return {success:true,data:JSON.parse(JSON.stringify(data)) as StatefulRecord,query_time:Date.now()};
    });
    reply.code(status);return result.value;
  }});
}
