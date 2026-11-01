import AtomicPlugin, {type AtomicPluginOptions} from '@eosrio/hyperion-atomicassets-plugin';
import type {StatefulReductionV2} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
declare const options: AtomicPluginOptions;
declare const port: StatefulReductionV2;
async function consume() {
  const plugin=new AtomicPlugin(options);
  const registration=plugin.getStatefulProjectionsV2({binding:{chainId:'0'.repeat(64),backendId:'host',generation:'host',
    mappingRevision:'1'.repeat(64),hookArtifact:'2'.repeat(64),hookRevision:'3'.repeat(64),codecRevision:'4'.repeat(64),normalizerRevision:'5'.repeat(64)},
    sourceCapabilities:['original-action-authorization-v1']});
  await registration.projections[1]!.reduce(port);
  const id: string=registration.projections[1]!.definition.id;
  return id;
}
void consume;
// @ts-expect-error The operator contract remains text; no new query authority is accepted.
const wrong: AtomicPluginOptions={...options,marketContract:42};
void wrong;
