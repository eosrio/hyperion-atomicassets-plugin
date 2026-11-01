import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedRequestV1,IndexedPredicateV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';

export class RoyaltyAttributeParameterError extends Error {
  constructor(readonly parameter:string){super('Invalid value for parameter '+parameter);}
}
/** No count, list expansion, boundary or sort parameters exist on the original route. */
export function parseRoyaltyAttributeParameters(params:Readonly<Record<string,unknown>>,contract:string,collection:string,maximum?:number):IndexedRequestV1 {
  const maxLimit=maximum||100;
  if(!Number.isSafeInteger(maxLimit)||maxLimit<1)throw new StatefulContractError('stateful.unavailable','Royalty API ceiling unavailable');
  function integer(name:string,min:number,max:number,fallback?:number):number|undefined {
    const raw=params[name];if(typeof raw!=='string'||raw==='')return fallback;
    const value=parseInt(raw,10);
    if(!/^-?\d+$/.test(raw)||Number.isNaN(value)||value<min||value>max)throw new RoyaltyAttributeParameterError(name);return value;
  }
  // Original filterQueryArgs object order, including source zero.
  const source=integer('source',0,Number.MAX_SAFE_INTEGER),rawField=params.field;
  const field=typeof rawField==='string'&&rawField!==''?rawField:undefined;
  const page=integer('page',1,Number.MAX_SAFE_INTEGER,1)!,limit=integer('limit',1,maxLimit,Math.min(maxLimit,100))!;
  const where:IndexedPredicateV1[]=[{field:'market_contract',op:'eq',value:contract},{field:'collection_name',op:'eq',value:collection}];
  if(typeof source==='number')where.push({field:'source',op:'eq',value:String(source)});
  if(field)where.push({field:'field',op:'eq',value:field});
  return {kind:'page',where,order:[{field:'rule_id',direction:'asc',nulls:'last'}],offset:String((page-1)*limit),limit,
    select:['market_contract','collection_name','rule_id','source','field'],records:['rule']};
}
