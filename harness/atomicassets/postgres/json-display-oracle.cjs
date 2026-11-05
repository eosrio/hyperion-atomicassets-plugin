'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {jsonVectors}=require('../json-vectors.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const fields=['name','img','images'];
const numericLiterals=Object.freeze(['{"name":9007199254740993,"img":-0,"images":1.2300}',
  '{"name":1e21,"img":1e-20,"images":1e-7}','{"name":1e131072}']);
function negativeZeros(v,path=[],out=[]) {if(Object.is(v,-0))out.push(path);
  else if(v&&typeof v==='object')for(const k of Object.keys(v))negativeZeros(v[k],[...path,k],out);return out;}
// Rotation is a named additional input, never a normalization of the original21.
function cases() {
  return jsonVectors().flatMap(([name,input])=>[0,1,2].map(rotation=>{
    const value={};for(const [k,v]of Object.entries(input))Object.defineProperty(value,
      fields.includes(k)?fields[(fields.indexOf(k)+rotation)%3]:k,{value:structuredClone(v),enumerable:true,writable:true,configurable:true});
    return {name,rotation,input:value,rawInput:JSON.stringify(value),negativeZeroPaths:negativeZeros(value),sourceVectorSha256:sha(JSON.stringify(input))};
  }));
}
const SQL=Object.freeze({
  before:'SELECT data::text AS data_text FROM atomicassets_collections WHERE contract=$1 AND collection_name=$2',
  json:'SELECT $1::json::text AS postgres_text',
  jsonb:"SELECT $1::jsonb::text AS postgres_text, $1::jsonb->>'name' AS name_text, $1::jsonb->>'img' AS img_text, $1::jsonb->>'images' AS images_text",
  scalar:'SELECT $1::text AS scalar_text',
  array:'SELECT $1::jsonb[]::text AS postgres_array_text',
  write:'UPDATE atomicassets_collections SET data=$3::jsonb WHERE contract=$1 AND collection_name=$2 RETURNING data::text AS data_text',
  collection:'SELECT row_to_json(v)::text AS raw_json FROM atomicassets_collections_master v WHERE contract=$1 AND collection_name=$2',
  asset:'SELECT row_to_json(v)::text AS raw_json FROM atomicassets_assets_master v WHERE contract=$1 AND asset_id=$2',
});
const error=e=>({name:e?.name??'Error',code:e?.code??null,message:String(e?.message??e).slice(0,2048)});
// Only the original encoder and actual client/HTTP responses supply outcomes.
async function capture({client,encode,contract,collection,assetId,http,record}) {
  const out={kind:'original-json-display-capture',originalVectors:21,rotations:3,cases:[],qualified:false};
  const base=(await client.query(SQL.before,[contract,collection])).rows;
  assert.equal(base.length,1);const baseline=base[0].data_text;assert.equal(typeof baseline,'string');
  for(const plan of cases()) {
    const encoded=encode(plan.input);assert.equal(typeof encoded,'string');
    const row={...plan,encoded,encodedBytes:Buffer.byteLength(encoded),encodedSha256:sha(encoded),boundaries:{},restore:{attempted:false}};out.cases.push(row);record({kind:'json39-case-start',row});
    const probe=async(label,sql,bindings)=>{
      try {const r=await client.query(sql,bindings);return {accepted:true,sql,bindings,rowCount:r.rowCount,rows:r.rows};}
      catch(e){return {accepted:false,sql,bindings,error:error(e)};}
    };
    let primary,hasPrimary=false;
    const retain=e=>{if(!hasPrimary){primary=e;hasPrimary=true;}};
    try {
      row.boundaries.json=await probe('json',SQL.json,[row.encoded]);
      row.boundaries.jsonb=await probe('jsonb',SQL.jsonb,[row.encoded]);
      // Schema/config JSONB-array elements use JSON.stringify, NOT metadata encode.
      row.boundaries.unencodedJsonbArray=await probe('array',SQL.array,[[plan.rawInput]]);
      const scalarFields=fields.filter(k=>Object.hasOwn(plan.input,k)&&typeof plan.input[k]==='string');
      row.boundaries.scalar=await Promise.all(scalarFields.map(async field=>({field,...await probe('scalar',SQL.scalar,[plan.input[field]])})));
      row.storage=await probe('write',SQL.write,[contract,collection,row.encoded]);
      assert.equal(row.storage.accepted,row.boundaries.jsonb.accepted,'Direct JSONB/storage acceptance differs');
      if(row.storage.accepted) {
        assert.equal(row.storage.rowCount,1);assert.equal(row.storage.rows.length,1);
        row.views={collection:(await client.query(SQL.collection,[contract,collection])).rows,
          asset:(await client.query(SQL.asset,[contract,assetId])).rows};
        assert.equal(row.views.collection.length,1);assert.equal(row.views.asset.length,1);
        row.http={collection:await http('/atomicassets/v1/collections/'+collection),asset:await http('/atomicassets/v1/assets/'+assetId)};
      } else {
        row.rejectedWriteLeftBaseline=(await client.query(SQL.before,[contract,collection])).rows[0].data_text===baseline;
        assert.equal(row.rejectedWriteLeftBaseline,true);
      }
    } catch(e){retain(e);row.failure=error(e);}
    finally {
      row.restore.attempted=true;
      try {const r=await client.query(SQL.write,[contract,collection,baseline]);assert.equal(r.rowCount,1);
        assert.equal((await client.query(SQL.before,[contract,collection])).rows[0].data_text,baseline);row.restore.succeeded=true;}
      catch(e){row.restore.succeeded=false;row.restore.error=error(e);retain(e);}
      try{record({kind:'json39-case-complete',row});}
      catch(e){row.completionRecordError=error(e);retain(e);}
    }
    if(hasPrimary)throw primary;
  }
  out.numericLiterals=[];
  for(const raw of numericLiterals){const row={kind:'native-SQL-literal-not-original-encoder',raw,boundaries:{}};out.numericLiterals.push(row);
    for(const [name,sql]of [['json',SQL.json],['jsonb',SQL.jsonb]]){
      try{const r=await client.query(sql,[raw]);row.boundaries[name]={accepted:true,sql,bindings:[raw],rows:r.rows,rowCount:r.rowCount};}
      catch(e){row.boundaries[name]={accepted:false,sql,bindings:[raw],error:error(e)};}
    }
    record({kind:'json39-native-numeric',row});
  }
  return out;
}
module.exports={cases,SQL,capture,numericLiterals};
