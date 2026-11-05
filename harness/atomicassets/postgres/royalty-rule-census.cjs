'use strict';
// Source-derived assertions for the pinned original ContractDBTransaction and
// royaltyProcessor. These values validate independently observed SQL/PG rows;
// they are never used to seed a database, handler or response.
const {steps}=require('./royalty-rule-plan.cjs');
const quote=x=>'"'+x+'"';
const json=x=>JSON.stringify(x).replace(/\\u0000/g,' ');
const snapshotSql=(label)=>{const table='atomicmarket_royalties_'+label,key=label==='templates'?'template_id':'rule_id';
 const cols=label==='templates'?"market_contract,collection_name,template_id::text AS template_id,recipients":"market_contract,collection_name,rule_id::text AS rule_id,source,field,value,weight::text AS weight,recipients,encode(lookup_hash, 'hex') AS lookup_hash";
 return `SELECT row_to_json(t)::text AS raw_json FROM (SELECT ${cols},updated_at_block::text AS updated_at_block,updated_at_time::text AS updated_at_time,created_at_block::text AS created_at_block,created_at_time::text AS created_at_time FROM ${table} WHERE market_contract=$1 AND collection_name=$2 ORDER BY ${key}) t`;};
function expected(){const state={templates:new Map(),attributes:new Map()},census=[],snapshots=[];
 for(let i=0;i<steps.length;i++){const step=steps[i],block=i+1,time=Date.parse(`2023-11-14T22:13:0${i}.000Z`),emit=(sql,bindings,rowCount)=>census.push({stage:step.name,sql,bindings:JSON.parse(JSON.stringify(bindings)),rowCount});emit('BEGIN',[],null);
  for(const entry of step.rows){const table=entry.table==='royaltytemp'?'templates':'attributes',name='atomicmarket_royalties_'+table,key=table==='templates'?'template_id':'rule_id',id=entry.value[table==='templates'?'template_id':'index'],condition=`"market_contract" = $1 AND "collection_name" = $2 AND "${key}" = $3`,bind=['atomicmarket','oracle',id],old=state[table].get(String(id));
   if(entry.present===false){emit(`DELETE FROM "${name}" WHERE market_contract = $1 AND collection_name = $2 AND ${key} = $3;`,bind,1);state[table].delete(String(id));continue;}
   emit(`SELECT * FROM "${name}" WHERE ${condition} LIMIT 1;`,bind,old?1:0);
   const v=entry.value,row={market_contract:'atomicmarket',collection_name:'oracle',[key]:id};
   if(table==='attributes')Object.assign(row,{source:v.source,field:v.field,value:json(v.value),weight:v.weight,recipients:json(v.recipients),lookup_hash:Buffer.from(v.lookup_hash,'hex')});else row.recipients=json(v.recipients);
   Object.assign(row,{updated_at_block:block,updated_at_time:time,created_at_block:block,created_at_time:time});
   const keys=Object.keys(row),primary=['market_contract','collection_name',key];
   if(old){const update=keys.filter(k=>!primary.includes(k)&&!['created_at_block','created_at_time'].includes(k)),values=update.map(k=>row[k]);
    const sql=`UPDATE "${name}" SET ${update.map((k,j)=>`${quote(k)} = $${j+1}`).join(', ')} WHERE ${primary.map((k,j)=>`${quote(k)} = $${update.length+j+1}`).join(' AND ')} RETURNING ${primary.map(quote).join(', ')} `;
    emit(sql,[...values,...bind],1);
   }else{const sql=`INSERT INTO "${name}" (${keys.map(quote).join(', ')}) VALUES (${keys.map((_,j)=>'$'+(j+1)).join(', ')}) RETURNING ${primary.map(quote).join(', ')} ;`;emit(sql,keys.map(k=>row[k]),1);}
   const value={market_contract:'atomicmarket',collection_name:'oracle',[key]:String(id),recipients:v.recipients,updated_at_block:String(block),updated_at_time:String(time),created_at_block:old?.created_at_block??String(block),created_at_time:old?.created_at_time??String(time)};
   if(table==='attributes')Object.assign(value,{source:v.source,field:v.field,value:v.value,weight:String(v.weight),lookup_hash:Buffer.from(v.lookup_hash,'hex').toString('hex')});state[table].set(String(id),value);
  }emit('COMMIT',[],null);
  const snap={name:step.name};for(const table of ['templates','attributes']){const id=table==='templates'?'template_id':'rule_id';snap[table]=[...state[table].values()].sort((a,b)=>BigInt(a[id])<BigInt(b[id])?-1:BigInt(a[id])>BigInt(b[id])?1:0).map(x=>structuredClone(x));}snapshots.push(snap);
 }return {census,snapshots};}
module.exports={snapshotSql,expected};
