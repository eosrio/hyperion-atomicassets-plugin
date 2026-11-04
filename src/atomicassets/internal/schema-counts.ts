import type {AtomicObject} from '../asset.js';
import {decimal,domainKey,read,text,unavailable,type DomainStage} from './lifecycle-port.js';
import {stageOwnedSchemaTransition} from './owned-schema-count.js';

const MAX=9223372036854775807n;
function identity(row: AtomicObject,contract: string,id: string): string {
  if(row.contract!==contract || row.asset_id!==id) return unavailable('Mismatched asset identity');
  return domainKey(contract,text(row.collection_name),text(row.schema_name));
}
async function count(stage: DomainStage,key: string,contract: string): Promise<bigint> {
  const row=await read(stage,'schema-asset-count',key);
  // Covered absence is zero only in a qualified complete count generation.
  if(row===null)return 0n;
  const parts=JSON.parse(key) as string[];
  if(row.contract!==contract || row.collection_name!==parts[1] || row.schema_name!==parts[2])
    return unavailable('Mismatched schema count identity');
  const value=BigInt(decimal(row.assets));
  if(value>MAX)return unavailable('Schema count exceeds signed bigint');
  return value;
}
function writeCount(stage: DomainStage,key: string,value: bigint): void {
  if(value<0n||value>MAX)return unavailable('Schema count outside signed bigint');
  const [contract,collection_name,schema_name]=JSON.parse(key) as [string,string,string];
  stage.put('schema-asset-count',key,{contract,collection_name,schema_name,assets:value.toString()});
}
/** Stage an asset row transition and its schema total together in the caller's atomic candidate. */
export async function stageAssetTransition(stage: DomainStage,contract: string,id: string,next: AtomicObject | null,ownedSchemaCounts=false): Promise<void> {
  text(contract);decimal(id);
  const key=domainKey(contract,id),old=await read(stage,'asset',key);
  if(ownedSchemaCounts)await stageOwnedSchemaTransition(stage,contract,id,old,next);
  const from=old===null?null:identity(old,contract,id),to=next===null?null:identity(next,contract,id);
  const previous=from===null?0n:await count(stage,from,contract);
  if(from!==null && previous===0n)return unavailable('Existing asset has no counted contribution');
  const target=to===null||to===from?previous:await count(stage,to,contract);
  if(from!==to){
    if(from!==null)writeCount(stage,from,previous-1n);
    if(to!==null)writeCount(stage,to,target+1n);
  }
  if(next===null){if(old!==null)stage.delete('asset',key);}else stage.put('asset',key,next);
}
