import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import type {AtomicObject} from '../../atomicassets/asset.js';
import {domainKey, metadataInputRecord, type DomainReader, type DomainStage} from '../../atomicassets/internal/lifecycle-port.js';

export const ROYALTY_CONFIG_KIND = 'market-royalty-config';
const columns = ['market_contract','collection_name','founders','attribute_mode','split_founders','split_templates',
  'split_attributes','updated_at_block','updated_at_time','created_at_block','created_at_time'] as const;
const unavailable = (message: string): never => {throw new StatefulContractError('stateful.unavailable',message);};
function data(value: unknown): AtomicObject {
  try {return metadataInputRecord(value);}
  catch {return unavailable('Invalid captured royalty configuration data');}
}

function unicode(value: unknown): void {
  if (typeof value === 'string' && (value.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)))
    unavailable('Invalid original PostgreSQL text');
  if (value !== null && typeof value === 'object') for (const [key,item] of Object.entries(value)) {unicode(key);unicode(item);}
}
function scalar(value: unknown): string {
  if (typeof value !== 'string') return unavailable('Expected original royalty text');
  unicode(value);return value;
}
function varchar(value: unknown): string {
  const selected=scalar(value);if ([...selected].length>12) unavailable('Original royalty varchar limit');return selected;
}
function integer(value: unknown, bits: 16 | 64 = 64): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return unavailable('Inexact original royalty integer');
    value=String(value);
  }
  if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(value)) return unavailable('Invalid original royalty integer');
  const n=BigInt(value), edge=1n << BigInt(bits-1);
  if (n < -edge || n >= edge) return unavailable('Original royalty integer storage overflow');
  return n.toString();
}

/** Original encodeDatabaseJson at this one JSONB storage boundary, never on scalar text. */
function founders(value: unknown): unknown {
  const raw=data({value}).value;
  let result: unknown;
  try {result=JSON.parse(JSON.stringify(raw).replace(/\\u0000/g,' '));}
  catch {return unavailable('Original royalty JSON encoder produced invalid storage input');}
  // PostgreSQL JSONB rejects zero bytes and unpaired surrogates after JSON decoding.
  unicode(result);return result;
}
function row(value: unknown, contract: string, collection: string): AtomicObject {
  const input=data(value);
  if (input.recordVersion!==1 || Object.keys(input).length!==columns.length+1 || columns.some(name=>!Object.hasOwn(input,name))
    || input.market_contract!==contract || input.collection_name!==collection) return unavailable('Mismatched royalty configuration identity/version');
  varchar(input.market_contract);varchar(input.collection_name);unicode(input.founders);
  if (typeof input.attribute_mode!=='number') return unavailable('Incompatible royalty smallint storage type');
  const numbers=Object.fromEntries((['split_founders','split_templates','split_attributes','updated_at_block','updated_at_time','created_at_block','created_at_time'] as const)
    .map(name=>{
      if (typeof input[name]!=='string') return unavailable('Incompatible royalty bigint storage type');
      return [name,integer(input[name])];
    }));
  return {market_contract:contract,collection_name:collection,founders:input.founders,
    attribute_mode:Number(integer(input.attribute_mode,16)),...numbers};
}

/** One keyed read. Only the caller's canonical complete coverage can establish absence. */
export async function readRoyaltyConfig(reader: DomainReader, contract: string, collection: string): Promise<AtomicObject|null> {
  scalar(contract);scalar(collection);
  const result=await reader.get(ROYALTY_CONFIG_KIND,domainKey(contract,collection));
  if (result?.status==='covered-absent' && Object.keys(result).length===1) return null;
  if (result?.status!=='present' || Object.keys(result).length!==2) return unavailable('Unavailable royalty configuration coverage');
  return row(result.value,contract,collection);
}

/** Original priority1010 table mirror. The runtime owns source capture, atomic discard and undo. */
export async function reduceRoyaltyConfig(
  block: {readonly contract: string;readonly blockNum: string;readonly blockTimeMs: string},
  value: unknown, present: boolean, stage: DomainStage,
): Promise<void> {
  if (typeof present!=='boolean') return unavailable('Missing actual royalty table presence');
  const contract=varchar(block.contract), input=data(value), collection=varchar(input.collection);
  const key=domainKey(contract,collection);
  if (!present) {stage.delete(ROYALTY_CONFIG_KIND,key);return;}
  const previous=await readRoyaltyConfig(stage,contract,collection), number=integer(block.blockNum), time=integer(block.blockTimeMs);
  const next=data({recordVersion:1,market_contract:contract,collection_name:collection,founders:founders(input.founders),
    attribute_mode:Number(integer(input.attribute_mode,16)),split_founders:integer(input.split_founders),
    split_templates:integer(input.split_templates),split_attributes:integer(input.split_attributes),
    updated_at_block:number,updated_at_time:time,created_at_block:previous?.created_at_block??number,created_at_time:previous?.created_at_time??time});
  stage.put(ROYALTY_CONFIG_KIND,key,next);
}
