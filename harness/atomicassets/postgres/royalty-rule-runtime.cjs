'use strict';
const assert=require('node:assert/strict');
async function readBody(response,limit=2097152){const chunks=[];let bytes=0;if(response.body)for await(const chunk of response.body){bytes+=chunk.length;assert(bytes<=limit,'HTTP response byte limit');chunks.push(chunk);}return Buffer.concat(chunks);}
async function transaction(client,work,record){await client.query('BEGIN');try{await work();await client.query('COMMIT');}catch(primary){try{await client.query('ROLLBACK');}catch(secondary){try{record({kind:'royalty-rollback-secondary',name:secondary?.name??'Error',message:String(secondary?.message??secondary).slice(0,2048)});}catch{} }throw primary;}}
async function observedQuery(run,row,record,kind){let value,primary,hasPrimary=false;try{value=await run();row.rowCount=value.rowCount;if(kind==='royalty-handler-sql')row.rows=value.rows;}catch(e){primary=e;hasPrimary=true;row.error={code:e?.code??null,message:String(e?.message??e).slice(0,2048)};}
 try{record({kind,value:row});}catch(e){row.recordError={name:e?.name??'Error',message:String(e?.message??e).slice(0,2048)};if(!hasPrimary){primary=e;hasPrimary=true;}}
 if(hasPrimary)throw primary;return value;}
module.exports={readBody,transaction,observedQuery};
