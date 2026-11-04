import type {AtomicObject} from '../asset.js';
import {decimal,domainKey,read,text,unavailable,type DomainStage} from './lifecycle-port.js';

const MAX=9223372036854775807n;
const kind='owned-schema-count';
function contribution(asset:AtomicObject|null,contract:string,id:string):string|null {
  if(asset===null)return null;
  if(asset.contract!==contract||asset.asset_id!==id)return unavailable('Mismatched asset identity');
  const collection=text(asset.collection_name),schema=text(asset.schema_name);
  if(asset.owner!==null)text(asset.owner);
  return asset.owner===null?null:domainKey(contract,collection,schema);
}
async function readCount(stage:DomainStage,key:string,contract:string):Promise<bigint> {
  const row=await read(stage,kind,key);
  // Covered absence is zero only after an independently qualified complete initialization.
  if(row===null)return 0n;
  const parts=JSON.parse(key) as string[];
  if(row.contract!==contract||row.collection_name!==parts[1]||row.schema_name!==parts[2])
    return unavailable('Mismatched owned schema count identity');
  const n=BigInt(decimal(row.owned));
  if(n>MAX)return unavailable('Owned schema count exceeds signed bigint');
  return n;
}
function writeCount(stage:DomainStage,key:string,n:bigint):void {
  if(n<0n||n>MAX)return unavailable('Owned schema count outside signed bigint');
  const [contract,collection_name,schema_name]=JSON.parse(key) as [string,string,string];
  stage.put(kind,key,{contract,collection_name,schema_name,owned:n.toString()});
}

/** Apply one asset row transition in its caller's atomic candidate. This does not stage the asset. */
export async function stageOwnedSchemaTransition(stage:DomainStage,contract:string,id:string,
  old:AtomicObject|null,next:AtomicObject|null):Promise<void> {
  text(contract);decimal(id);
  const from=contribution(old,contract,id),to=contribution(next,contract,id);
  const before=from===null?0n:await readCount(stage,from,contract);
  if(from!==null&&before===0n)return unavailable('Owned asset has no counted contribution');
  if(from===to)return;
  const after=to===null?0n:await readCount(stage,to,contract);
  if(from!==null)writeCount(stage,from,before-1n);
  if(to!==null)writeCount(stage,to,after+1n);
}
