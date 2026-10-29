import type {FastifyInstance, FastifyRequest} from 'fastify';
import type {StatefulQueryHost, StatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import {readLifecycleAsset} from '../atomicassets/internal/lifecycle.js';
import {AssetDomainUnavailable} from '../atomicassets/internal/lifecycle-port.js';
import {readFixedSaleWithAssets} from '../atomicmarket/internal/sale-assets.js';
import {FixedSaleUnavailable} from '../atomicmarket/internal/fixed-sale-port.js';

export interface AtomicIdRoutesOptions {
  readonly atomicassets: {readonly projectionId: string; readonly contract: string};
  readonly atomicmarket: {readonly projectionId: string; readonly contract: string};
  /** The existing host issues this port for the current request, with final publication fencing. */
  readonly queryHost: (request: FastifyRequest) => StatefulQueryHost | Promise<StatefulQueryHost>;
}

/** Additive routes on the existing host. This neither opens an adapter view nor grants readiness. */
export function registerAtomicIdRoutes(fastify: FastifyInstance, options: AtomicIdRoutesOptions): void {
  for (const family of ['atomicassets', 'atomicmarket'] as const) {
    const asset = family === 'atomicassets', parameter = asset ? 'asset_id' : 'sale_id';
    const configured = options[family];
    if (!configured.projectionId || !configured.contract) throw new Error('Atomic route configuration is incomplete');
    fastify.all<{Params: Record<string, string>}>('/' + family + '/v1/' + (asset ? 'assets/:' : 'sales/:') + parameter,
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
            : await readFixedSaleWithAssets(reader, configured.contract, identity);
          // Original AssetFiller indexes canonical returned rows using the untouched request text.
          if (data === null || asset && identity !== input) {
            status = 416; return {success: false, message: asset ? 'Asset not found' : 'Sale not found'};
          }
          // The SDK host captures and bounds this complete JSON body; onSend/headers remain host-owned.
          return {success: true, data: JSON.parse(JSON.stringify(data)) as StatefulRecord, query_time: Date.now()};
        });
        reply.code(status);
        return result.value;
      });
  }
}
