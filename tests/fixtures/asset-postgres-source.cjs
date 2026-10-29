"use strict";
const assert=require('node:assert/strict');
const {join}=require('node:path');
const fs=require('node:fs');
const phaseStart=process.hrtime.bigint();let phaseSequence=0;
const phase=name=>{assert.ok(++phaseSequence<=16);fs.writeFileSync(2,'\nAA_PG_SOURCE_PHASE '+JSON.stringify({name,sequence:phaseSequence,
 elapsedNs:String(process.hrtime.bigint()-phaseStart)})+'\n');};
const net=require('node:net');let socketAttempts=0,listenAttempts=0;
net.Socket.prototype.connect=function(){socketAttempts++;throw new Error('Sockets are prohibited in this source-only control');};
net.Server.prototype.listen=function(){listenAttempts++;throw new Error('Listeners are prohibited in this source-only control');};
(async()=>{
 phase('start');
 const {originalSource,copyDefinitions}=await import('../../harness/atomicassets/postgres/source.mjs');
 phase('source-capture-before');const reference=originalSource(process.argv[2]);phase('source-capture-after');
 phase('definition-copy-before');copyDefinitions(reference,process.cwd());phase('definition-copy-after');
 process.env.SWC_NODE_PROJECT=join(reference.root,'tsconfig.json');process.env.SWC_NODE_CACHE_DIR=join(process.cwd(),'swc-cache');
 phase('module-load-before');reference.fromReference('@swc-node/register');
 // Module loading and original SQL orchestration only. No PostgresConnection is instantiated; no server or socket exists.
 for(const path of ['./src/connections/postgres.ts','./src/api/server.ts','./src/api/namespaces/atomicassets/index.ts',
  './src/filler/handlers/test-helper.ts','./src/filler/processor.ts'])reference.fromReference(path);
 phase('module-load-after');
 const records=[],queries=[];let begun=0,released=0;
 const knownSourceSql=new Set(reference.definitions.flatMap(row=>{const body=fs.readFileSync(row.path,'utf8');return[body,body.replace(/\bCONCURRENTLY\b/gi,'')];}));
 const query=async(sql)=>{
  assert.equal(typeof sql,'string');queries.push(sql);
  if(knownSourceSql.has(sql))return{rows:[],rowCount:0};
  if(/SELECT\s+EXISTS/i.test(sql))return{rows:[{exists:false}],rowCount:1};
  if(sql==='SELECT * FROM atomicmarket_buyoffers_assets WHERE buyoffer_id = 609405 AND asset_id = 1099601520940')return{rows:[],rowCount:0};
  if(/^\s*SELECT/i.test(sql))throw new Error('Source control will not fabricate unknown SELECT output: '+sql.slice(0,160));
  return{rows:[],rowCount:0};
 };
 const client={query,release(){released++;}},connection={tableExists:async()=>false,query,async begin(){begun++;return client;}};
 phase('schema-before');const schema=await require('../../harness/atomicassets/postgres/schema.cjs')(reference.fromReference,connection,
  {emptyObjects:true,emptyCustomSchemas:true,noExtraExtensions:true},row=>records.push(row));
 phase('schema-after');
 assert.deepEqual(schema.setupHandlerOrder,['atomicassets','delphioracle','atomicmarket','atomicpacksx','atomicdropsx','simpleassets']);
 assert.equal(released,begun);assert.ok(schema.migrationVersions.includes('2.0.13'));assert.ok(queries.some(sql=>sql.includes('atomicassets_original_mints')));
 phase('codec-before');const codec=reference.fromReference('@atomichub/atomicassets'),{encodeDatabaseJson}=reference.fromReference('./src/filler/utils.ts');
 const probes=require('../../harness/atomicassets/postgres/scenario.cjs').codecProbeCases({});
 const nul=encodeDatabaseJson(probes[1][1]),literal=encodeDatabaseJson(probes[2][1]);
 const input=JSON.parse(fs.readFileSync(join(__dirname,'../../fixtures/harness/atomicassets/lifecycle/input.json')));
 const converted=codec.convertAttributeMapToObject(input.codecAttributes);
 assert.equal(converted.unsigned,'18446744073709551615');assert.equal(converted.signed,'-9223372036854775808');
 assert.deepEqual(converted.uv,['0','18446744073709551615']);assert.equal(typeof converted.f32,'number');
 assert.equal(typeof converted.f64,'number');assert.equal(Object.is(converted.fv[3],-0),true);
 const convertedTypes=Object.fromEntries(Object.entries(converted).map(([key,value])=>[key,Array.isArray(value)?value.map(entry=>typeof entry):typeof value]));
 assert.equal(JSON.parse(nul).text,'a b');assert.throws(()=>JSON.parse(literal));
 assert.deepEqual(codec.mergeSchemaFormatTypes([{name:'image',type:'string'}],[{name:'image',mediatype:'video',info:'video/mp4'}]),
  [{name:'image',type:'string',mediatype:'video',info:'video/mp4'}]);
 phase('codec-after');reference.fromReference('./src/utils/winston.ts').default.close();phase('logger-close-requested');
 phase('final-proof-before');
 fs.writeFileSync(3,JSON.stringify({node:process.version,sourceRecords:reference.observed.length,definitionFiles:reference.definitions.length,
  schema,queryCalls:queries.length,actualOriginalSchemaFilesExecutedAgainst:'controlled client: no PostgreSQL',
  scriptedSelectBoundary:'known SQL file results are ignored; existence=false and exact1.3.4 empty repair SELECT only; never an oracle result',
  sourceSqlRecords:records.filter(row=>row.kind==='migration-file'),codecBoundary:{nulEncoded:nul,literalEncoded:literal,literalInvalidJson:true},
  sourceModulesLoaded:true,socketAttempts,listenAttempts,serverStarted:false,postgresExecuted:false,convertedTypes,negativeZero:true}));
 phase('final-proof-after');
})().catch(error=>{console.error(error);process.exit(1);});
