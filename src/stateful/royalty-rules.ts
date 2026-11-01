import {StatefulContractError,type StatefulLimits} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedModelV1,IndexedLimitsV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import type {AtomicPluginRegistration} from './plugin.js';
import type {StatefulReductionV2} from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {reduceRoyaltyRule,royaltyRuleKind,ROYALTY_ATTRIBUTE_KIND,type RoyaltyRuleTable} from '../atomicmarket/internal/royalty-rules.js';

export const ROYALTY_ATTRIBUTE_MODEL_ID='atomicmarket-royalty-attributes';
export const ROYALTY_ATTRIBUTE_MODEL_REVISION='atomicmarket-270-royalty-attributes-v1';
/** Required semantics only; no current Mongo/simple qualification is inferred. */
export const ROYALTY_ATTRIBUTE_COMPARISON='atomicmarket-270-royalty-attribute-pg16-v1';
export const royaltyRuleProjectionId=(root:string,table:RoyaltyRuleTable):string=>root+(table==='royaltytemp'?':royalty-template-rules':':royalty-attribute-rules');
export function royaltyAttributeModel():IndexedModelV1 {
  return {id:ROYALTY_ATTRIBUTE_MODEL_ID,base:{alias:'rule',kind:ROYALTY_ATTRIBUTE_KIND},joins:[],fields:[
    {id:'market_contract',alias:'rule',path:['market_contract'],type:'text',nullable:false,operators:['eq']},
    {id:'collection_name',alias:'rule',path:['collection_name'],type:'text',nullable:false,operators:['eq']},
    {id:'source',alias:'rule',path:['source'],type:'int64',nullable:false,operators:['eq']},
    {id:'field',alias:'rule',path:['field'],type:'text',nullable:false,operators:['eq']},
    {id:'rule_id',alias:'rule',path:['rule_id'],type:'int64',nullable:false,operators:[]}],
    textComparison:ROYALTY_ATTRIBUTE_COMPARISON,orders:[[{field:'rule_id',direction:'asc',nulls:'last'}]]};
}
export function royaltyAttributeLimits(limits:StatefulLimits):IndexedLimitsV1 {
  return {readAttempts:limits.readAttempts,responseRecords:limits.responseRecords,responseBytes:limits.responseBytes,
    queryBytes:Math.min(limits.inputBytes,limits.responseBytes),predicates:limits.value.fields,orderTerms:Math.min(1,limits.value.fields),setValues:limits.value.arrayElements};
}
export function royaltyRuleProjections(root:string,contract:string,limits:StatefulLimits):AtomicPluginRegistration['projections'] {
  return (['royaltytemp','royaltyattr'] as const).map(table=>({
    definition:{family:'stateful-projection-recovery' as const,interfaceVersion:1 as const,id:royaltyRuleProjectionId(root,table),
      selectors:[{id:contract+':table:'+table,contract,kind:'table' as const,name:table}],records:[{kind:royaltyRuleKind(table),integers:[]}]},
    limits:JSON.parse(JSON.stringify(limits)) as StatefulLimits,requiredSourceCapabilities:[],
    requiredCompleteKindRead:{family:'stateful-owner-complete-kind' as const,interfaceVersion:1 as const,
      limits:{readAttempts:limits.readAttempts,responseRecords:limits.responseRecords,responseBytes:limits.responseBytes}},
    ...(table==='royaltyattr'?{requiredIndexedQueries:[{modelRevision:ROYALTY_ATTRIBUTE_MODEL_REVISION,model:royaltyAttributeModel(),limits:royaltyAttributeLimits(limits)}]}:{}),
    async reduce(port:StatefulReductionV2){
      const block=port.source.block;
      for(const input of port.source.inputs){
        if(input.contract!==contract||input.kind!=='table'||input.name!==table||input.identity.kind!=='contract-row')
          throw new StatefulContractError('stateful.unavailable','Occurrence outside the scoped royalty rule projection');
        await reduceRoyaltyRule(table,{contract,blockNum:String(block.blockNum),blockTimeMs:block.timeMs},input.identity.scope,input.data,input.present,port);
      }
    }}));
}
