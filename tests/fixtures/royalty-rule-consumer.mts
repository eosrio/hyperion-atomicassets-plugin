import AtomicPlugin,{type AtomicPluginOptions,type AtomicPluginRegistration,type AtomicPluginApiContext} from '@eosrio/hyperion-atomicassets-plugin';
import type {StatefulLimits} from '@eosrio/hyperion-sdk/projection-stateful';
import type {StatefulReductionV2} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import type {IndexedQueryHostV1,IndexedModelV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
declare const limits:StatefulLimits,port:StatefulReductionV2,host:IndexedQueryHostV1;
const options:AtomicPluginOptions={limits,apiLimits:{royalties:100}};
const engineering:AtomicPluginOptions={limits,engineeringRoyaltyAttributeMongoComparison:true};
const registration:AtomicPluginRegistration=new AtomicPlugin(options).getStatefulProjectionsV2({binding:{} as never,sourceCapabilities:['original-action-authorization-v1']});
const model:IndexedModelV1=registration.projections[3]!.requiredIndexedQueries![0]!.model;
async function consume(){await registration.projections[2]!.reduce(port);await registration.projections[3]!.reduce(port);}
const context:AtomicPluginApiContext={statefulQueryHost:()=>({compose:async()=>{throw new Error('unused');}}),statefulIndexedQueryHost:async()=>host};
void[model,context,consume,engineering];
// @ts-expect-error No boolean enable flag or database authority is introduced.
const bad:AtomicPluginOptions={limits,apiLimits:{royalties:true}};
void bad;
