import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedResultV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {domainKey,metadataInputRecord,type DomainReader,type DomainStage} from '../../atomicassets/internal/lifecycle-port.js';
import type {AtomicObject} from '../../atomicassets/asset.js';

export const ROYALTY_TEMPLATE_KIND='market-royalty-template';
export const ROYALTY_ATTRIBUTE_KIND='market-royalty-attribute';
export type RoyaltyRuleTable='royaltytemp'|'royaltyattr';
const times=['updated_at_block','updated_at_time','created_at_block','created_at_time'] as const;
const templateColumns=['market_contract','collection_name','template_id','recipients',...times] as const;
const attributeColumns=['market_contract','collection_name','rule_id','source','field','value','weight','recipients','lookup_hash',...times] as const;
const unavailable=(message:string):never=>{throw new StatefulContractError('stateful.unavailable',message);};
export const royaltyRuleKind=(table:RoyaltyRuleTable):string=>table==='royaltytemp'?ROYALTY_TEMPLATE_KIND:ROYALTY_ATTRIBUTE_KIND;
function data(value:unknown):AtomicObject {try{return metadataInputRecord(value);}catch{return unavailable('Invalid royalty rule data');}}
function unicode(value:unknown):void {
  if(typeof value==='string'&&(value.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)))unavailable('Invalid PostgreSQL royalty text');
  if(value!==null&&typeof value==='object')for(const[key,item]of Object.entries(value)){unicode(key);unicode(item);}
}
function text(value:unknown):string {if(typeof value!=='string')return unavailable('Expected royalty text');unicode(value);return value;}
function varchar(value:unknown):string {const result=text(value);if([...result].length>12)unavailable('Royalty varchar storage limit');return result;}
function integer(value:unknown,bits:16|64=64):string {
  if(typeof value==='number'){if(!Number.isSafeInteger(value))return unavailable('Inexact royalty integer');value=String(value);}
  // Decoded signed/zero-padded decimal input has the same stored numeric value.
  if(typeof value!=='string'||!(/^[+-]?\d+$/).test(value))return unavailable('Invalid royalty integer');
  const n=BigInt(value),edge=1n<<BigInt(bits-1);if(n < -edge||n>=edge)return unavailable('Royalty integer storage overflow');return n.toString();
}
function storedInteger(value:unknown,bits:16|64=64):string {
  if(typeof value!=='string'||integer(value,bits)!==value)return unavailable('Noncanonical stored royalty integer');return value;
}
/** Apply original encodeDatabaseJson only to its original JSONB columns. */
function jsonb(value:unknown):unknown {
  let result:unknown;try{result=JSON.parse(JSON.stringify(data({value}).value).replace(/\\u0000/g,' '));}
  catch{return unavailable('Original royalty JSON encoding failed');}unicode(result);return result;
}
function storedRow(table:RoyaltyRuleTable,value:unknown,contract:string,collection:string,id:string):AtomicObject {
  const input=data(value),columns=table==='royaltytemp'?templateColumns:attributeColumns,idField=table==='royaltytemp'?'template_id':'rule_id';
  if(input.recordVersion!==1||Object.keys(input).length!==columns.length+1||columns.some(name=>!Object.hasOwn(input,name))
    ||input.market_contract!==contract||input.collection_name!==collection||input[idField]!==id)return unavailable('Royalty rule identity/version differs');
  varchar(input.market_contract);varchar(input.collection_name);storedInteger(input[idField]);unicode(input.recipients);
  for(const name of times)storedInteger(input[name]);
  if(table==='royaltyattr'){
    storedInteger(input.source,16);storedInteger(input.weight);text(input.field);unicode(input.value);
    if(typeof input.lookup_hash!=='string'||!(/^(?:[a-f0-9]{2})*$/).test(input.lookup_hash))return unavailable('Invalid stored royalty hash bytes');
  }
  return input;
}
export async function readStoredRoyaltyRule(reader:DomainReader,table:RoyaltyRuleTable,contract:string,collection:string,id:string):Promise<AtomicObject|null> {
  const result=await reader.get(royaltyRuleKind(table),domainKey(contract,collection,id));
  if(result?.status==='covered-absent'&&Object.keys(result).length===1)return null;
  if(result?.status!=='present'||Object.keys(result).length!==2)return unavailable('Royalty rule coverage unavailable');
  return storedRow(table,result.value,contract,collection,id);
}
/** Original row mirror; runtime owns source authority, candidate discard and rollback. */
export async function reduceRoyaltyRule(table:RoyaltyRuleTable,block:{readonly contract:string;readonly blockNum:string;readonly blockTimeMs:string},
  scope:string,value:unknown,present:boolean,stage:DomainStage):Promise<void> {
  if(typeof present!=='boolean')return unavailable('Missing royalty table presence');
  const input=data(value),contract=varchar(block.contract),collection=varchar(scope),idField=table==='royaltytemp'?'template_id':'rule_id';
  const id=integer(input[table==='royaltytemp'?'template_id':'index']),kind=royaltyRuleKind(table),key=domainKey(contract,collection,id);
  if(!present){stage.delete(kind,key);return;}
  const previous=await readStoredRoyaltyRule(stage,table,contract,collection,id),number=integer(block.blockNum),time=integer(block.blockTimeMs);
  const next=data({recordVersion:1,market_contract:contract,collection_name:collection,[idField]:id,recipients:jsonb(input.recipients),
    updated_at_block:number,updated_at_time:time,created_at_block:previous?.created_at_block??number,created_at_time:previous?.created_at_time??time});
  if(table==='royaltyattr'){
    // Actual original Buffer.from(hex), not a SHA validation/authority rule.
    if(typeof input.lookup_hash!=='string')return unavailable('Expected original royalty hash input');
    Object.assign(next,{source:integer(input.source,16),field:text(input.field),value:jsonb(input.value),weight:integer(input.weight),
      lookup_hash:Buffer.from(input.lookup_hash,'hex').toString('hex')});
  }
  stage.put(kind,key,next);
}
/** Only the signed16 source has a proven exact JSON-number response range. */
export function royaltyAttributeRows(answer:Extract<IndexedResultV1,{kind:'page'}>,contract:string,collection:string):AtomicObject[] {
  return answer.rows.map(item=>{
    const candidate=item.records.rule,id=candidate?.rule_id;
    if(typeof id!=='string'||item.key!==domainKey(contract,collection,id))return unavailable('Royalty query key differs');
    const row=storedRow('royaltyattr',candidate,contract,collection,id);
    for(const field of ['market_contract','collection_name','rule_id','source','field'])if(item.fields[field]!==row[field])return unavailable('Royalty query fields differ');
    return Object.fromEntries(attributeColumns.map(name=>[name,name==='source'?Number(row.source):row[name]]));
  });
}
export function royaltyTemplateRows(answer:Extract<IndexedResultV1,{kind:'page'}>,contract:string,collection:string):AtomicObject[] {
  return answer.rows.map(item=>{const candidate=item.records.rule,id=candidate?.template_id;
    if(typeof id!=='string'||item.key!==domainKey(contract,collection,id))return unavailable('Royalty template query key differs');
    const row=storedRow('royaltytemp',candidate,contract,collection,id);
    for(const field of ['market_contract','collection_name','template_id'])if(item.fields[field]!==row[field])return unavailable('Royalty template query fields differ');
    return Object.fromEntries(templateColumns.map(name=>[name,row[name]]));
  });
}
