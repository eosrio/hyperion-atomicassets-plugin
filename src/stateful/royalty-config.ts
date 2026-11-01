import {StatefulContractError,type StatefulLimits} from '@eosrio/hyperion-sdk/projection-stateful';
import type {AtomicPluginRegistration} from './plugin.js';
import {reduceRoyaltyConfig, ROYALTY_CONFIG_KIND} from '../atomicmarket/internal/royalty-config.js';

/** Independent table-only projection; this does not admit v2 compound market processing. */
export function royaltyConfigProjection(id: string, contract: string, limits: StatefulLimits): AtomicPluginRegistration['projections'][number] {
  return {definition:{family:'stateful-projection-recovery',interfaceVersion:1,id,
    selectors:[{id:contract+':table:royaltyconf',contract,kind:'table',name:'royaltyconf'}],
    records:[{kind:ROYALTY_CONFIG_KIND,integers:[]}]},
    limits:JSON.parse(JSON.stringify(limits)) as StatefulLimits,requiredSourceCapabilities:[],
    requiredCompleteKindRead:{family:'stateful-owner-complete-kind',interfaceVersion:1,
      limits:{readAttempts:limits.readAttempts,responseRecords:limits.responseRecords,responseBytes:limits.responseBytes}},
    async reduce(port) {
      const b=port.source.block;
      // All callbacks have priority1010: preserve actual source order for equal keys.
      for (const input of port.source.inputs) {
        if (input.contract!==contract || input.kind!=='table' || input.name!=='royaltyconf' || input.identity.kind!=='contract-row')
          throw new StatefulContractError('stateful.unavailable','Occurrence outside the royalty configuration projection');
        await reduceRoyaltyConfig({contract,blockNum:String(b.blockNum),blockTimeMs:b.timeMs},input.data,input.present,port);
      }
    }};
}
