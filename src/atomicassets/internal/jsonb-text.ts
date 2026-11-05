import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import {metadataInputRecord} from './lifecycle-port.js';

const invalid=():never=>{throw new StatefulContractError('stateful.unavailable','Invalid PostgreSQL JSONB text input');};
const unicode=(value:string)=>{if(value.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))invalid();return value;};
function numeric(value:number):string {
  if(!Number.isFinite(value))return invalid();
  const text=String(value);if(!text.includes('e'))return text;
  const [coefficient,exponent]=text.split('e'),negative=coefficient!.startsWith('-'),unsigned=negative?coefficient!.slice(1):coefficient!;
  const point=(unsigned.includes('.')?unsigned.indexOf('.'):unsigned.length)+Number(exponent),digits=unsigned.replace('.','');
  return (negative?'-':'')+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
}
/** PostgreSQL16 JSONB text for values originating at the original JS metadata boundary.
 * Match byte-length/binary key order, spaces and expanded finite JS numbers. This cannot recover
 * precision or scale from native SQL numeric lexemes that were already parsed as JS numbers.
 * Applies only to ->> response shaping, never scalar text or metadata storage encoding. */
export function jsonbText(input:unknown):string|null {
  // A missing object path and JSON null both extract as SQL NULL.
  if(input===undefined)return null;
  let value:unknown;try {value=metadataInputRecord({value:input}).value;}catch{return invalid();}
  function render(current:unknown):string {
    if(current===null)return 'null';
    if(typeof current==='string')return JSON.stringify(unicode(current));
    if(typeof current==='number')return numeric(current);
    if(typeof current==='boolean')return String(current);
    if(Array.isArray(current))return '['+current.map(render).join(', ')+']';
    if(!current||typeof current!=='object')return invalid();
    const object=current as Record<string,unknown>,keys=Object.keys(object).map(key=>({key,bytes:Buffer.from(unicode(key),'utf8')}));
    keys.sort((left,right)=>left.bytes.length-right.bytes.length||Buffer.compare(left.bytes,right.bytes));
    return '{'+keys.map(({key})=>JSON.stringify(key)+': '+render(object[key])).join(', ')+'}';
  }
  return value==null?null:typeof value==='string'?unicode(value):render(value);
}
