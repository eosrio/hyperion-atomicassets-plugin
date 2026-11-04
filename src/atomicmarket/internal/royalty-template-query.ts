import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedRequestV1,IndexedPredicateV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import type {OperatorListHost} from '../../atomicassets/internal/schema-query.js';
import {RoyaltyAttributeParameterError} from './royalty-attribute-query.js';
const unavailable=():never=>{throw new StatefulContractError('stateful.unavailable','Royalty template query unavailable');};
/** Original list expansion and validation precede pagination; database outcomes remain separately qualified. */
export async function parseRoyaltyTemplateParameters(params:Readonly<Record<string,unknown>>,contract:string,collection:string,
 bounds:{readonly queryBytes:number;readonly setValues:number},listHost?:()=>OperatorListHost|Promise<OperatorListHost>,maximum?:number):Promise<IndexedRequestV1>{
 const max=maximum||100;if(!Number.isSafeInteger(max)||max<1)return unavailable();
 if(!Number.isSafeInteger(bounds?.queryBytes)||bounds.queryBytes<1||!Number.isSafeInteger(bounds?.setValues)||bounds.setValues<0)return unavailable();
 const itemLimit=Math.max(1,bounds.setValues);let bytes=0;
 const charge=(value:string):void=>{const size=Buffer.byteLength(value,'utf8');if(size>bounds.queryBytes-bytes)return unavailable();bytes+=size;};
 const raw=params.template_id;let tokens:string[]=[];
 if(typeof raw==='string'&&raw!==''){
  charge(raw);let count=1;for(let i=0;i<raw.length;i++)if(raw.charCodeAt(i)===44&&++count>itemLimit)return unavailable();
  if(count>itemLimit)return unavailable();tokens=raw.split(',');
 }
 const lists=new Map<string,readonly string[]>();let provider:Promise<OperatorListHost>|undefined,identity:{source:string;generation:string}|undefined;
 const ids:string[]=[];
 for(const token of tokens){
  if(!token.startsWith('$list:')){if(ids.length>=itemLimit)return unavailable();ids.push(token);continue;}
  const name=token.slice(6);let items=lists.get(name);
  if(items===undefined){
   if(!listHost)return unavailable();provider??=Promise.resolve().then(listHost);const result=await(await provider).resolve([name]);
   if(!result||typeof result.source!=='string'||!result.source||typeof result.generation!=='string'||!result.generation||!Array.isArray(result.entries)||result.entries.length!==1
    ||result.entries[0]?.name!==name||!Array.isArray(result.entries[0].items))return unavailable();
   charge(result.source);charge(result.generation);
   if(identity&&(identity.source!==result.source||identity.generation!==result.generation))return unavailable();identity??={source:result.source,generation:result.generation};
   if(result.entries[0].items.length>itemLimit-ids.length)return unavailable();
   const captured:string[]=[];for(const item of result.entries[0].items){if(typeof item!=='string')return unavailable();charge(item);captured.push(item);}
   items=captured;lists.set(name,items);
  }else{if(items.length>itemLimit-ids.length)return unavailable();for(const item of items)charge(item);}
  for(const item of items)ids.push(item);
 }
 for(const id of ids)if(!/^-?\d+$/.test(id)&&id.toLowerCase()!=='null')throw new RoyaltyAttributeParameterError('template_id');
 function integer(name:string,min:number,maxValue:number,fallback:number):number{const value=params[name];if(typeof value!=='string'||value==='')return fallback;
  charge(value);
  const n=parseInt(value,10);if(!/^-?\d+$/.test(value)||Number.isNaN(n)||n<min||n>maxValue)throw new RoyaltyAttributeParameterError(name);return n;}
 const page=integer('page',1,Number.MAX_SAFE_INTEGER,1),limit=integer('limit',1,max,Math.min(max,100));
 // SDK #50 owns actual PostgreSQL 500/408 outcomes; never manufacture a successful query for them.
 const canonical=ids.map(id=>{if(id.length===4&&id.toLowerCase()==='null')return unavailable();const negative=id[0]==='-';let first=negative?1:0;
  while(first<id.length&&id.charCodeAt(first)===48)first++;const digits=id.slice(first);if(digits==='')return '0';
  if(digits.length>19)return unavailable();const n=BigInt((negative?'-':'')+digits);if(n< -9223372036854775808n||n>9223372036854775807n)return unavailable();return n.toString();});
 const where:IndexedPredicateV1[]=[{field:'market_contract',op:'eq',value:contract},{field:'collection_name',op:'eq',value:collection}];
 if(canonical.length===1)where.push({field:'template_id',op:'eq',value:canonical[0]!});
 else if(canonical.length>1)where.push({field:'template_id',op:'in',values:canonical});
 return {kind:'page',where,order:[{field:'template_id',direction:'asc',nulls:'last'}],offset:String((page-1)*limit),limit,
  select:['market_contract','collection_name','template_id'],records:['rule']};
}
