import {createAtomicStatefulPlugin,type AtomicPluginOptions} from '@eosrio/hyperion-atomicassets-plugin';
import {registerAtomicIdRoutes,type AtomicIdRoutesOptions} from '@eosrio/hyperion-atomicassets-plugin/http';
// Private installed-file declaration control, not a newly supported package subpath.
import {readAssetConfig} from './node_modules/@eosrio/hyperion-atomicassets-plugin/dist/atomicassets/internal/config.js';
import type {DomainReader} from './node_modules/@eosrio/hyperion-atomicassets-plugin/dist/atomicassets/internal/lifecycle-port.js';
import type {StatefulCompleteKindQueryHostV1} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import type {FastifyInstance} from 'fastify';
async function installedConfigRead(reader:DomainReader){
 const config=await readAssetConfig(reader,'atomicassets');
 // @ts-expect-error Config contract is textual.
 await readAssetConfig(reader,123);
 return config;
}
function installedRoutes(server:FastifyInstance,options:AtomicIdRoutesOptions,host:StatefulCompleteKindQueryHostV1){
 registerAtomicIdRoutes(server,{...options,completeKindQueryHost:async()=>host});
}
function installedFactory(options:AtomicPluginOptions){return createAtomicStatefulPlugin(options);}
void [installedConfigRead,installedRoutes,installedFactory];
