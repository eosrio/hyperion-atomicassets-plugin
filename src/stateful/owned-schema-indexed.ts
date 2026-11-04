import type {StatefulLimits} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedModelV1,IndexedOrderV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {SCHEMA_LIST_COMPARISON,schemaListLimits} from './schema-indexed.js';
export const OWNED_SCHEMA_MODEL_ID='atomicassets-owned-schemas';
export const OWNED_SCHEMA_REVISION='atomicassets-270-owned-schemas-v1';
/** Experimental native comparison; only complete unpaginated owned-schema sets are compared. */
export const OWNED_SCHEMA_MONGO_ENGINEERING_COMPARISON='mongodb-simple-utf8-v1';
export const ownedSchemaOrder:readonly IndexedOrderV1[]=[{field:'schema_name',direction:'asc',nulls:'last'}];
export function ownedSchemaModel(engineeringMongoComparison=false):IndexedModelV1 {return {id:OWNED_SCHEMA_MODEL_ID,base:{alias:'owned',kind:'owned-schema-count'},joins:[],fields:[
 {id:'contract',alias:'owned',path:['contract'],type:'text',nullable:false,operators:['eq']},
 {id:'collection_name',alias:'owned',path:['collection_name'],type:'text',nullable:false,operators:['eq']},
 {id:'schema_name',alias:'owned',path:['schema_name'],type:'text',nullable:false,operators:[]},
 {id:'owned',alias:'owned',path:['owned'],type:'int64',nullable:false,operators:['gt']}],
 textComparison:engineeringMongoComparison?OWNED_SCHEMA_MONGO_ENGINEERING_COMPARISON:SCHEMA_LIST_COMPARISON,orders:[ownedSchemaOrder]};}
export const ownedSchemaRequirement=(limits:StatefulLimits,engineeringMongoComparison=false)=>({modelRevision:OWNED_SCHEMA_REVISION,model:ownedSchemaModel(engineeringMongoComparison),limits:schemaListLimits(limits)});
