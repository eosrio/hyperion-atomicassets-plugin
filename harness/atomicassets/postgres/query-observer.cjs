"use strict";
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
module.exports=function observeQueries(client,record,kind){
 const original=client.query.bind(client);
 client.query=function(sql,...args){
  assert.equal(typeof sql,'string');assert.ok(Buffer.byteLength(sql)<=2*1024**2);
  const row={kind,sqlSha256:createHash('sha256').update(sql).digest('hex'),sqlBytes:Buffer.byteLength(sql),prefix:sql.slice(0,200),values:Array.isArray(args[0])?args[0]:[]};record(row);
  const done=(error,result)=>{
   if(error)row.error={code:error.code??null,message:String(error.message).slice(0,1024)};
   else row.rowCounts=Array.isArray(result)?result.map(value=>value.rowCount):[result?.rowCount??null];
  };
  const index=args.findIndex(value=>typeof value==='function');
  if(index>=0){
   const callback=args[index];args[index]=function(error,result){done(error,result);return callback.apply(this,arguments);};
   try{return original(sql,...args);}catch(error){done(error);throw error;}
  }
  try{
   const result=original(sql,...args);
   if(result&&typeof result.then==='function')return result.then(value=>{done(null,value);return value;},error=>{done(error);throw error;});
   return result;
  }catch(error){done(error);throw error;}
 };
 return client;
};
