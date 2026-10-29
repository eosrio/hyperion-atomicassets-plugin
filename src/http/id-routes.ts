import type {FastifyInstance, FastifyRequest} from 'fastify';
import type {StatefulQueryHost, StatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import {readLifecycleAsset} from '../atomicassets/internal/lifecycle.js';
import {AssetDomainUnavailable} from '../atomicassets/internal/lifecycle-port.js';
import {readFixedSaleWithAssets} from '../atomicmarket/internal/sale-assets.js';
import {FixedSaleUnavailable} from '../atomicmarket/internal/fixed-sale-port.js';
import {readAuctionWithAssets} from '../atomicmarket/internal/auction-assets.js';
import {readCollectionId} from '../atomicassets/internal/collections.js';

export interface AtomicIdRoutesOptions {
  readonly atomicassets: {readonly projectionId: string; readonly contract: string};
  readonly atomicmarket: {readonly projectionId: string; readonly contract: string};
  /** The existing host issues this port for the current request, with final publication fencing. */
  readonly queryHost: (request: FastifyRequest) => StatefulQueryHost | Promise<StatefulQueryHost>;
}

/** Additive routes on the existing host. This neither opens an adapter view nor grants readiness. */
export function registerAtomicIdRoutes(fastify: FastifyInstance, options: AtomicIdRoutesOptions): void {
  for (const family of ['asset', 'sale', 'auction'] as const) {
    const asset = family === 'asset', auction = family === 'auction', parameter = family + '_id';
    const namespace = asset ? 'atomicassets' : 'atomicmarket';
    const configured = options[namespace];
    if (!configured.projectionId || !configured.contract) throw new Error('Atomic route configuration is incomplete');
    fastify.all<{Params: Record<string, string>}>('/' + namespace + '/v1/' + (asset ? 'assets/:' : auction ? 'auctions/:' : 'sales/:') + parameter,
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
            : await readFixedSaleWithAssets(reader, configured.contract, identity);
          // Original AssetFiller indexes canonical returned rows using the untouched request text.
          if (data === null || asset && identity !== input) {
            status = 416; return {success: false, message: asset ? 'Asset not found' : auction ? 'Auction not found' : 'Sale not found'};
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
}
