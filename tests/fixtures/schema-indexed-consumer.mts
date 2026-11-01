import AtomicPlugin,{type AtomicPluginApiContext,type AtomicPluginRegistration} from '@eosrio/hyperion-atomicassets-plugin';
import type {IndexedModelV1,IndexedQueryHostV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import type {StatefulLimits} from '@eosrio/hyperion-sdk/projection-stateful';
declare const limits:StatefulLimits;
declare const query:IndexedQueryHostV1;
const plugin=new AtomicPlugin({limits,apiLimits:{schemas:1000}});
const registration:AtomicPluginRegistration=plugin.getStatefulProjectionsV2({binding:{} as never,sourceCapabilities:['original-action-authorization-v1']});
const requirement=registration.projections[0]!.requiredIndexedQueries![0]!;
const model:IndexedModelV1=requirement.model;
const context:AtomicPluginApiContext={statefulQueryHost:()=>({compose:async()=>{throw new Error('unused');}}),
 statefulIndexedQueryHost:async(_request,_projection,_model)=>query};
void [plugin,model,context];
