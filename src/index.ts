import {createAtomicStatefulPlugin, type AtomicPluginApiContext, type AtomicPluginHostContext,
  type AtomicPluginOptions} from './stateful/plugin.js';
import type {FastifyInstance} from 'fastify';
export * from './stateful/plugin.js';

/** Existing Hyperion loader constructor; all indexing uses the optional v2 host path. */
export default class AtomicPlugin {
  readonly internalPluginName = 'atomicassets';
  readonly indexerPlugin = true;
  readonly apiPlugin = true;
  readonly hasApiRoutes = true;
  readonly actionHandlers = [];
  readonly deltaHandlers = [];
  readonly streamHandlers = [];
  readonly dynamicContracts: readonly string[];
  readonly baseConfig: AtomicPluginOptions;
  readonly chainName = '';
  private readonly plugin;
  constructor(config: AtomicPluginOptions) {
    this.baseConfig = config;
    this.plugin = createAtomicStatefulPlugin(config);
    this.dynamicContracts = Object.freeze([config.assetsContract ?? 'atomicassets', config.marketContract ?? 'atomicmarket']);
  }
  getStatefulProjectionsV2(context: AtomicPluginHostContext) {return this.plugin.getStatefulProjectionsV2(context);}
  addRoutes(server: FastifyInstance, context?: AtomicPluginApiContext): void {this.plugin.addRoutes(server, context);}
  initOnce(): void {}
  initHandlerMap() {return {};}
}
