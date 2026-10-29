import {createHash} from 'node:crypto';
import type {FastifyInstance, FastifyRequest} from 'fastify';
import type {StatefulDefinition, StatefulLimits, StatefulSelector} from '@eosrio/hyperion-sdk/projection-stateful';
import type {StatefulReductionV2, StatefulQueryHostV2} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {registerAtomicIdRoutes} from '../http/id-routes.js';
import {reduceAssetLifecycle} from '../atomicassets/internal/lifecycle.js';
import {domainKey, format, record, required, strings, text, unavailable,
  type LifecycleEvent, type MetadataCodec} from '../atomicassets/internal/lifecycle-port.js';
import {reduceFixedSales} from '../atomicmarket/internal/fixed-sale.js';
import {reduceAuctions, type AuctionName, type AuctionOccurrence} from '../atomicmarket/internal/auctions.js';
import {reduceOffers, finishOfferMoves, reduceMarketConfig, reduceContractCode, isOfferAction,
  type OfferOccurrence} from '../atomicmarket/internal/relationships.js';
import type {FixedSaleOccurrence} from '../atomicmarket/internal/fixed-sale-port.js';
import {ATOMIC_HOOK_INVENTORY} from './hook-inventory.js';
import {createAtomicMetadataCodec} from './metadata-codec.js';
export {ATOMIC_HOOK_INVENTORY} from './hook-inventory.js';
export {ATOMIC_METADATA_CODEC, createAtomicMetadataCodec} from './metadata-codec.js';
export type {MetadataCodec} from '../atomicassets/internal/lifecycle-port.js';

export interface AtomicPluginOptions {
  readonly projectionId?: string;
  readonly assetsContract?: string;
  readonly marketContract?: string;
  /** Actual chain system contract providing original setcode observations. */
  readonly systemContract?: string;
  /** Explicit finite host-negotiated bounds; the package does not invent an operator budget. */
  readonly limits: StatefulLimits;
}
export interface AtomicPluginApiContext {
  readonly statefulQueryHost: (request: FastifyRequest) => StatefulQueryHostV2;
}
export interface AtomicPluginHostContext {readonly binding: StatefulDefinition['binding']}
export interface AtomicPluginRegistration {
  readonly interfaceVersion: 2;
  readonly sourceInputVersion: 2;
  readonly projections: readonly {readonly definition: Omit<StatefulDefinition, 'binding' | 'selectors'> & {
    readonly selectors: readonly Omit<StatefulSelector, 'abiDeployment' | 'abiSha256'>[]};
    readonly limits: StatefulLimits; readonly reduce: (port: StatefulReductionV2) => Promise<void>}[];
}
const kinds = ['config','collection','schema','asset','mint','template-link','backed-tokens','original-mint',
  'market-sale','market-config','offer','market-token','symbol-pair','offer-assets','contract-code','asset-offers','market-auction'] as const;
const assetTables = ['config','collections','schemas','schematypes'] as const;
const assetActions = ['logmint','logsetdata','logtransfer','logburnasset'] as const;
const saleActions = ['lognewsale','logsalestart','cancelsale','purchasesale'] as const;
const auctionActions = ['lognewauct','logauctstart','cancelauct','auctionbid','auctclaimbuy','auctclaimsel'] as const;
const has = (values: readonly string[], value: string) => values.includes(value);
const schemaDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(format(value))).digest('hex');

export const ATOMIC_CAPABILITY_GAPS = Object.freeze(['full original processor effects and block hooks',
  'templates/backing/mint reconciliation', 'multi-asset offers/exchanges and symbol-pair pricing',
  'currency conversion/pricing/bundles', 'scope-less table domain interpretation',
  'NUL/literal-backslash conversion', 'remaining API/log/stat/socket parity'] as const);

/** One compound projection; this module owns domain conversion, never source/owner/native authority. */
export function createAtomicStatefulPlugin(options: AtomicPluginOptions) {
  const projectionId = text(options.projectionId ?? 'atomicassets');
  const assets = text(options.assetsContract ?? 'atomicassets'), market = text(options.marketContract ?? 'atomicmarket');
  const system = text(options.systemContract ?? 'eosio');
  if (new Set([assets,market,system]).size !== 3) unavailable('Atomic/system contracts must differ');
  const limits = JSON.parse(JSON.stringify(options.limits)) as StatefulLimits;
  if (!limits || typeof limits !== 'object') unavailable('Explicit stateful limits required');
  const codec = createAtomicMetadataCodec();
  const selectors = Object.freeze([...new Map(ATOMIC_HOOK_INVENTORY.hooks.map(hook => {
    const contract = hook.domain === 'atomicassets' ? assets : market;
    const id = contract + ':' + hook.kind + ':' + hook.name;
    return [id, Object.freeze({id, contract, kind: hook.kind, name: hook.name})] as const;
  })).values(),Object.freeze({id:system+':action:setcode',contract:system,kind:'action' as const,name:'setcode'})]);

  async function reduce(port: StatefulReductionV2): Promise<void> {
    const assetEvents: LifecycleEvent[] = [], sales: FixedSaleOccurrence[] = [], auctions: AuctionOccurrence[] = [];
    const offers: OfferOccurrence[] = [], moved: string[] = [], configs: {value: import('../atomicassets/asset.js').AtomicObject;
      evidence: import('../atomicassets/asset.js').AtomicObject}[] = [], codes: import('../atomicassets/asset.js').AtomicObject[] = [];
    const formats = new Map<string, string>(), mints = new Map<string, {collection: string; schema: string}>();
    // All schema priority-20 rows precede priority-50/60 asset actions in the existing reducer.
    for (const input of port.source.inputs) {
      if (input.contract !== assets) continue;
      if (input.kind === 'table' && input.name === 'schemas') {
        if (input.identity.kind !== 'contract-row') return unavailable('Schema requires actual scoped table identity');
        const value = record(input.data);
        formats.set(domainKey(assets, input.identity.scope, text(value.schema_name)), schemaDigest(value.format));
      } else if (input.kind === 'action' && input.name === 'logmint') {
        const value = record(input.data);
        mints.set(text(value.asset_id), {collection: text(value.collection_name), schema: text(value.schema_name)});
      }
    }
    async function digestFor(collection: string, schema: string): Promise<string> {
      const key = domainKey(assets, collection, schema);
      return formats.get(key) ?? text((await required(port, 'schema', key)).schema_digest);
    }
    for (const input of port.source.inputs) {
      if (input.contract === market && input.kind === 'table' && input.name === 'config' && !input.present)
        unavailable('Original market config cannot be erased');
      const value = record(input.data), evidence = {occurrence: input.sourceEvidence,
        abiDeployment: input.abiDeployment, abiSha256: input.abiSha256};
      if (input.contract === assets) {
        if (input.kind === 'table') {
          if (!has(assetTables, input.name)) unavailable('Unimplemented AtomicAssets table: ' + input.name);
          if (input.identity.kind !== 'contract-row') return unavailable('Scope-less Atomic table domain mapping is not implemented');
          const schema = input.name === 'schemas' ? schemaDigest(value.format) : undefined;
          assetEvents.push({kind: 'row', table: input.name as typeof assetTables[number], scope: input.identity.scope,
            present: input.present, value, evidence: {...evidence, ...(schema ? {schemaDigest: schema} : {})}});
        } else {
          if (isOfferAction(input.name)) {offers.push({name:input.name,value});continue;}
          if (!has(assetActions, input.name)) unavailable('Unimplemented AtomicAssets action: ' + input.name);
          if (input.name === 'logtransfer') {
            moved.push(...strings(value.asset_ids));
          }
          if (input.name === 'logburnasset') moved.push(text(value.asset_id));
          let schema: string | undefined;
          if (input.name === 'logmint') schema = await digestFor(text(value.collection_name), text(value.schema_name));
          if (input.name === 'logsetdata') {
            const minted = mints.get(text(value.asset_id));
            if (minted) schema = await digestFor(minted.collection, minted.schema);
            else {
              const previous = await port.get('asset', domainKey(assets, text(value.asset_id)));
              if (previous.status === 'present') schema = await digestFor(text(previous.value.collection_name), text(previous.value.schema_name));
            }
          }
          assetEvents.push({kind: 'action', name: input.name as typeof assetActions[number], transactionId: input.transactionId,
            value, evidence: {...evidence, ...(schema ? {schemaDigest: schema} : {})}});
        }
      } else if (input.contract === market) {
        if (input.kind === 'table' && input.name === 'config') {
          configs.push({value,evidence});
        } else if (input.kind === 'action' && has(saleActions, input.name)) {
          sales.push({kind: 'action', contract: market, name: input.name as typeof saleActions[number],
            transactionId: input.transactionId, evidence, value});
        } else if (input.kind === 'table' && input.name === 'auctions') {
          if (input.identity.kind !== 'contract-row') return unavailable('Auction requires actual scoped table identity');
          auctions.push({kind:'table',name:'auctions',present:input.present,evidence,value});
        } else if (input.kind === 'action' && has(auctionActions,input.name)) {
          auctions.push({kind:'action',name:input.name as AuctionName,transactionId:input.transactionId,evidence,value});
        } else unavailable('Unimplemented AtomicMarket occurrence: ' + input.name);
      } else if (input.contract === system && input.kind === 'action' && input.name === 'setcode') codes.push(value);
      else unavailable('Occurrence outside configured Atomic/system contracts');
    }
    const b = port.source.block;
    const relations = {assets,market,blockNum:String(b.blockNum),timeMs:b.timeMs};
    for (const code of codes) await reduceContractCode(code,port);
    await reduceAssetLifecycle({contract: assets, blockNum: String(b.blockNum), blockTimeMs: b.timeMs, blockId: b.blockId}, assetEvents, port, codec);
    await reduceOffers(relations,offers,port);
    for (const config of configs) await reduceMarketConfig(relations,config.value,config.evidence,port);
    if (sales.length || auctions.length) {
      const version = await required(port, 'market-config', domainKey(market));
      if (version.version !== '1.2.2') unavailable('Missing supported source-bound market version');
      const context = {marketContract: market, assetsContract: assets, blockNum: String(b.blockNum), blockTimeMs: b.timeMs,
        blockId: b.blockId, contractVersion: {version: '1.2.2', occurrence: text(version.occurrence),
          abiDeployment: text(version.abiDeployment), abiSha256: text(version.abiSha256)}} as const;
      if (sales.length) await reduceFixedSales(context,sales,port);
      if (auctions.length) await reduceAuctions(context,auctions,port);
    }
    await finishOfferMoves(relations,moved,port);
  }
  return Object.freeze({
    getStatefulProjectionsV2(_context: AtomicPluginHostContext): AtomicPluginRegistration {
      return {interfaceVersion: 2, sourceInputVersion: 2, projections: [{definition: {
        family: 'stateful-projection-recovery', interfaceVersion: 1, id: projectionId, selectors,
        records: kinds.map(kind => ({kind, integers: kind === 'asset' ? [{path: ['asset_id'], type: 'uint64', vector: false}] : []}))},
        limits: JSON.parse(JSON.stringify(limits)) as StatefulLimits, reduce}]};
    },
    addRoutes(server: FastifyInstance, context?: AtomicPluginApiContext): void {
      if (!context || typeof context.statefulQueryHost !== 'function') throw new Error('Atomic routes require the host request-scoped query context');
      registerAtomicIdRoutes(server, {atomicassets: {projectionId, contract: assets},
        atomicmarket: {projectionId, contract: market}, queryHost: context.statefulQueryHost});
    },
  });
}
