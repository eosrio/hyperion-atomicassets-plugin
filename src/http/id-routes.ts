import type {FastifyInstance, FastifyRequest} from 'fastify';
import type {StatefulQueryHost, StatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import type {StatefulCompleteKindQueryHostV1} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {readLifecycleAsset} from '../atomicassets/internal/lifecycle.js';
import {AssetDomainUnavailable} from '../atomicassets/internal/lifecycle-port.js';
import {readFixedSaleWithAssets} from '../atomicmarket/internal/sale-assets.js';
import {FixedSaleUnavailable} from '../atomicmarket/internal/fixed-sale-port.js';
import {readAuctionWithAssets} from '../atomicmarket/internal/auction-assets.js';
import {readBuyofferWithAssets} from '../atomicmarket/internal/buyoffer-assets.js';
import {readTemplateId} from '../atomicassets/internal/templates.js';
import {readSchemaId, schemaFilters, SchemaParameterError, type OperatorListHost} from '../atomicassets/internal/schema-query.js';
import {readCollectionId} from '../atomicassets/internal/collections.js';
import {readMarketplaceState, readMarketplaces} from '../atomicmarket/internal/marketplace-state.js';

export interface AtomicIdRoutesOptions {
  readonly atomicassets: {readonly projectionId: string; readonly contract: string};
  readonly atomicmarket: {readonly projectionId: string; readonly contract: string};
  /** The existing host issues this port for the current request, with final publication fencing. */
  readonly queryHost: (request: FastifyRequest) => StatefulQueryHost | Promise<StatefulQueryHost>;
  readonly operatorLists?: (request: FastifyRequest) => OperatorListHost | Promise<OperatorListHost>;
  readonly completeKindQueryHost?: (request: FastifyRequest, projectionId: string) => Promise<StatefulCompleteKindQueryHostV1>;
}

/** Additive routes on the existing host. This neither opens an adapter view nor grants readiness. */
export function registerAtomicIdRoutes(fastify: FastifyInstance, options: AtomicIdRoutesOptions): void {
  for (const family of ['asset', 'sale', 'auction', 'buyoffer'] as const) {
    const asset = family === 'asset', auction = family === 'auction', buyoffer = family === 'buyoffer', parameter = family + '_id';
    const namespace = asset ? 'atomicassets' : 'atomicmarket';
    const configured = options[namespace];
    if (!configured.projectionId || !configured.contract) throw new Error('Atomic route configuration is incomplete');
    fastify.all<{Params: Record<string, string>}>('/' + namespace + '/v1/' + (asset ? 'assets/:' : auction ? 'auctions/:' : buyoffer ? 'buyoffers/:' : 'sales/:') + parameter,
      async (request, reply) => {
        const host = await options.queryHost(request);
        let status = 200;
        const result = await host.compose(configured.projectionId, async reader => {
          const input = request.params[parameter];
          // Original validateId preserves decimal text and accepts case-insensitive null.
          if (typeof input !== 'string' || !(/^-?\d+$/.test(input) || input.toLowerCase() === 'null')) {
            status = 400; return {success: false, message: 'Invalid value for parameter ' + parameter};
          }
          const unsupported = () => {throw asset ? new AssetDomainUnavailable('ID form requires qualified original database behavior')
            : new FixedSaleUnavailable('ID form requires qualified original database behavior');};
          if (input.toLowerCase() === 'null') return unsupported();
          const exact = BigInt(input);
          // This first physical profile is the intersection of the original PostgreSQL and domain ranges.
          if (exact < 0n || exact > 9223372036854775807n) return unsupported();
          const identity = exact.toString();
          const data = asset ? await readLifecycleAsset(reader, configured.contract, identity)
            : auction ? await readAuctionWithAssets(reader, configured.contract, identity, Date.now)
            : buyoffer ? await readBuyofferWithAssets(reader, configured.contract, identity)
            : await readFixedSaleWithAssets(reader, configured.contract, identity);
          // Original AssetFiller indexes canonical returned rows using the untouched request text.
          if (data === null || asset && identity !== input) {
            status = 416; return {success: false, message: asset ? 'Asset not found' : auction ? 'Auction not found' : buyoffer ? 'Buyoffer not found' : 'Sale not found'};
          }
          // The SDK host captures and bounds this complete JSON body; onSend/headers remain host-owned.
          return {success: true, data: JSON.parse(JSON.stringify(data)) as StatefulRecord, query_time: Date.now()};
        });
        reply.code(status);
        return result.value;
      });
  }
  const {contract,projectionId}=options.atomicassets;
  fastify.all<{Params:{collection_name:string}}>('/atomicassets/v1/collections/:collection_name',async(request,reply)=>{
    const host=await options.queryHost(request);let status=200;
    const result=await host.compose(projectionId,async reader=>{
      const data=await readCollectionId(reader,contract,request.params.collection_name);
      if(data===null){status=416;return {success:false,message:'Collection not found'};}
      return {success:true,data:data as StatefulRecord,query_time:Date.now()};
    });
    reply.code(status);return result.value;
  });
  fastify.all<{Params:{collection_name:string;template_id:string}}>('/atomicassets/v1/templates/:collection_name/:template_id',async(request,reply)=>{
    const host=await options.queryHost(request);let status=200;
    const result=await host.compose(projectionId,async reader=>{
      const input=request.params.template_id;
      if(!(/^-?\d+$/.test(input)||input.toLowerCase()==='null')){status=400;return {success:false,message:'Invalid value for parameter template_id'};}
      if(input.toLowerCase()==='null') throw new AssetDomainUnavailable('ID form requires qualified original database behavior');
      const n=BigInt(input);
      if(n<0n||n>9223372036854775807n) throw new AssetDomainUnavailable('ID form requires qualified original database behavior');
      const data=await readTemplateId(reader,contract,request.params.collection_name,n.toString());
      if(data===null){status=404;return {success:false,message:'Template not found'};}
      return {success:true,data:data as StatefulRecord,query_time:Date.now()};
    });
    reply.code(status);return result.value;
  });
  fastify.all<{Params:{collection_name:string;schema_name:string}}>('/atomicassets/v1/schemas/:collection_name/:schema_name',async(request,reply)=>{
    const values=[request.params.collection_name,request.params.schema_name];
    const listHost=options.operatorLists ? {resolve: async (names: readonly string[]) =>
      (await options.operatorLists!(request)).resolve(names)} : undefined;
    let filters;
    try {filters=await schemaFilters(values[0]!,values[1]!,listHost);}
    catch(error) {if(error instanceof SchemaParameterError) {reply.code(400); return {success:false,message:error.message};} throw error;}
    if(!options.completeKindQueryHost) throw new Error('Complete-kind query host unavailable');
    const host=await options.completeKindQueryHost(request,projectionId);
    const result=await host.compose(projectionId,async reader=>{
      const data=await readSchemaId(reader,contract,filters);
      const body: StatefulRecord = data===null ? {success:true,query_time:Date.now()} : {success:true,data:JSON.parse(JSON.stringify(data)) as StatefulRecord,query_time:Date.now()};
      return body;
    });
    return result.value;
  });
  const market = options.atomicmarket;
  fastify.all('/atomicmarket/v1/marketplaces', async request => {
    if (!options.completeKindQueryHost) throw new Error('Complete-kind query host unavailable');
    const host = await options.completeKindQueryHost(request, market.projectionId);
    const result = await host.compose(market.projectionId, async reader => ({
      success: true, data: JSON.parse(JSON.stringify(await readMarketplaces(reader, market.contract))) as StatefulRecord[], query_time: Date.now(),
    }));
    return result.value;
  });
  fastify.all<{Params: {name: string}}>('/atomicmarket/v1/marketplaces/:name', async (request, reply) => {
    const host = await options.queryHost(request);
    let status = 200;
    const result = await host.compose(market.projectionId, async reader => {
      const data = await readMarketplaceState(reader, market.contract, request.params.name);
      if (data === null) {status = 416; return {success: false, message: 'Marketplace not found'};}
      return {success: true, data: data as StatefulRecord, query_time: Date.now()};
    });
    reply.code(status);
    return result.value;
  });
}
