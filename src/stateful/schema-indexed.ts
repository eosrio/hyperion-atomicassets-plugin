import type {StatefulLimits} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedLimitsV1,IndexedModelV1,IndexedOrderV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';

export const SCHEMA_LIST_MODEL_ID = 'atomicassets-schemas';
export const SCHEMA_LIST_MODEL_REVISION = 'atomicassets-270-schemas-v1';
/** Required original semantics, never a claim that a backend offers or qualifies this profile. */
export const SCHEMA_LIST_COMPARISON = 'atomicassets-270-pg16-enUS-utf8-v1';
export const schemaListOrder = (sort: 'created'|'schema_name'|'assets', direction: 'asc'|'desc'): readonly IndexedOrderV1[] => {
  const field=sort==='created'?'created_at_time':sort;
  return [{field,direction,nulls:'last'},...(field==='schema_name'?[]:[{field:'schema_name',direction:'asc',nulls:'last'} as const])];
};

export function schemaListModel(): IndexedModelV1 {
  return {id:SCHEMA_LIST_MODEL_ID,base:{alias:'schema',kind:'schema'},joins:[
    {alias:'collection',kind:'collection',mode:'inner-one',on:[
      {basePath:['contract'],joinedPath:['contract']},{basePath:['collection_name'],joinedPath:['collection_name']}]},
    {alias:'assets',kind:'schema-asset-count',mode:'left-one',on:[
      {basePath:['contract'],joinedPath:['contract']},{basePath:['collection_name'],joinedPath:['collection_name']},
      {basePath:['schema_name'],joinedPath:['schema_name']}]}],
    fields:[
      {id:'contract',alias:'schema',path:['contract'],type:'text',nullable:false,operators:['eq']},
      {id:'collection_name',alias:'schema',path:['collection_name'],type:'text',nullable:false,operators:['in','not-in']},
      {id:'schema_name',alias:'schema',path:['schema_name'],type:'text',nullable:false,operators:['in','gte','lt','text-contains']},
      {id:'created_at_time',alias:'schema',path:['created_at_time'],type:'int64',nullable:false,operators:['gt','lt']},
      {id:'authorized_accounts',alias:'collection',path:['authorized_accounts'],type:'text-vector',nullable:false,operators:['array-contains']},
      {id:'assets',alias:'assets',path:['assets'],type:'int64',nullable:true,operators:[]}],
    textComparison:SCHEMA_LIST_COMPARISON,
    orders:(['created','schema_name','assets'] as const).flatMap(sort=>(['asc','desc'] as const).map(direction=>schemaListOrder(sort,direction)))};
}

/** Reuse explicit caller ceilings; this introduces no independently enlarged query budget. */
export function schemaListLimits(limits: StatefulLimits): IndexedLimitsV1 {
  return {readAttempts:limits.readAttempts,responseRecords:limits.responseRecords,responseBytes:limits.responseBytes,
    queryBytes:Math.min(limits.inputBytes,limits.responseBytes),predicates:limits.value.fields,
    orderTerms:Math.min(2,limits.value.fields),setValues:limits.value.arrayElements};
}
export const schemaListRequirement = (limits: StatefulLimits) =>
  ({modelRevision:SCHEMA_LIST_MODEL_REVISION,model:schemaListModel(),limits:schemaListLimits(limits)});
