"use strict";
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const profiles=require('../../harness/atomicassets/lifecycle-input.cjs');
const {jsonVectors}=require('../../harness/atomicassets/json-vectors.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
module.exports=async function(fromReference,root){
 const paths=['src/filler/utils.ts','src/filler/handlers/atomicassets/processors/assets.ts',
  'src/filler/handlers/atomicassets/processors/collections.ts','src/filler/handlers/atomicassets/processors/templates.ts',
  'definitions/tables/atomicassets_tables.sql','definitions/views/atomicassets_assets_master.sql',
  'definitions/views/atomicassets_collections_master.sql','src/api/namespaces/atomicassets/format.ts'];
 const sources=paths.map(path=>{const raw=execFileSync('git',['show','0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e:'+path],{cwd:root,maxBuffer:2*1024*1024});
  assert.equal(readFileSync(join(root,path),'utf8').replaceAll('\r\n','\n'),raw.toString());return{path,bytes:raw.length,sha256:sha(raw)};});
 const {encodeDatabaseJson}=fromReference('./src/filler/utils.ts'),codec=fromReference('@atomichub/atomicassets');
 const codecSha=sha(readFileSync(fromReference.resolve('@atomichub/atomicassets')));
 assert.equal(codecSha,'2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573');
 const encode=(name,input)=>{const encoded=encodeDatabaseJson(input);let parsed=null,error=null;
  try{parsed=JSON.parse(encoded);}catch(e){error={name:e.name,message:e.message};}
  return{name,input,encoded,encodedUtf8Bytes:Buffer.byteLength(encoded),encodedSha256:sha(encoded),nativeJsonParse:{accepted:error===null,value:parsed,error},postgres:{status:'not-run'}};};
 const vectors=jsonVectors().map(([name,value])=>encode(name,value));
 const profileResults=['original-lifecycle','portable-safe-image'].map(name=>{const {input,descriptor}=profiles.loadInputProfile(name),schema=codec.CachedObjectSchema(input.collectionFormat),
  hex=Buffer.from(codec.serialize(input.collectionData,schema)).toString('hex'),decoded=codec.deserialize(hex,schema);
  return{descriptor,rawCollectionData:input.collectionData,serializedHex:hex,codecDecoded:decoded,...encode(name,decoded)};});
 return{nodeVersion:process.version,sources,codecSha,vectors,profiles:profileResults,
  scope:{originalEncoder:true,lockedCodec:true,nativeJsonParse:true,postgres:false,sqlView:false,http:false,mongo:false,fullParity:false}};
};
