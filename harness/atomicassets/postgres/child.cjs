"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
let connection;
const report={schemaVersion:1,status:'running',qualified:false,node:process.version,identity:{pid:process.pid,parentPid:process.ppid,startedAt:new Date().toISOString()},events:[]};
const record=value=>{assert.ok(report.events.length<2048,'Original PG event budget');report.events.push(value);};
(async()=>{
 let bytes=0;const chunks=[];
 for await(const chunk of process.stdin){bytes+=chunk.length;assert.ok(bytes<=16384);chunks.push(chunk);}
 const job=JSON.parse(Buffer.concat(chunks).toString());assert.deepEqual(Object.keys(job).sort(),['parentPid','receipt','referenceRoot']);
 assert.equal(job.parentPid,process.ppid);assert.equal(process.platform,'linux');
 assert.equal(process.release.name,'node');assert.ok([24,26].includes(Number(process.versions.node.split('.')[0])));assert.equal(process.versions.bun,undefined);
 const {originalSource,sha}=await import('./source.mjs');
 const {verifyObservedFixture,observeFixture,admitEmptyDatabase,PIN}=await import('./admission.mjs');
 const reference=originalSource(job.referenceRoot),config=verifyObservedFixture(job.receipt,observeFixture(job.receipt));
 report.harness={files:['admission.mjs','child.cjs','fixture-pin.json','query-observer.cjs','run.mjs','scenario.cjs','schema.cjs','source.mjs'].map(path=>{const data=fs.readFileSync(join(__dirname,path));return{path,bytes:data.length,sha256:sha(data)};}),
  fixtureInputSha256:sha(fs.readFileSync(join(__dirname,'../../../fixtures/harness/atomicassets/lifecycle/input.json'))),
  auditManifestSha256:sha(fs.readFileSync(join(__dirname,'../../../docs/parity/atomicassets/postgres-oracle-sources.json'))),
  nodeExecutableSha256:sha(fs.readFileSync(process.execPath))};
 assert.equal(process.env.SWC_NODE_PROJECT,join(reference.root,'tsconfig.json'));
 for(const row of reference.definitions)assert.equal(sha(fs.readFileSync(row.path)),row.workingSha256);
 reference.fromReference('@swc-node/register');
 const {default:PostgresConnection}=reference.fromReference('./src/connections/postgres.ts');
 connection=new PostgresConnection(config.host,config.port,config.user,config.password,config.database);
 connection.pool.on('connect',client=>require('./query-observer.cjs')(client,record,'original-sql'));
 report.admission=await admitEmptyDatabase(connection,config.database);
 report.ownership={...config.ownership,cpuCount:PIN.cpuCount,memoryBytes:PIN.memoryBytes};
 report.reference={commit:reference.commit,lockSha256:reference.lockSha256,actualWorkingLockSha256:reference.actualWorkingLockSha256,sources:reference.observed};
 report.schema=await require('./schema.cjs')(reference.fromReference,connection,report.admission,record);
 const privateConfig={host:config.host,port:config.port,user:config.user,password:config.password,database:config.database};
 report.result=await require('./scenario.cjs')(reference.fromReference,connection,privateConfig,record);
 report.status='passed';report.fixtureCleanup={requiredFromRoot:true,performedByHarness:false,qualified:false};
})().catch(error=>{report.status='failed';report.error={name:error.name,code:error.code??null,message:String(error.message).slice(0,2048),stack:String(error.stack).slice(0,8192)};process.exitCode=1;}).finally(async()=>{
 try{await connection?.end();report.originalConnectionEnded=Boolean(connection);}catch(error){report.status='failed';report.connectionCloseError=String(error.message);process.exitCode=1;}
 report.completedAt=new Date().toISOString();const data=Buffer.from(JSON.stringify(report,(_,value)=>typeof value==='bigint'?String(value):value)+'\n');
 assert.ok(data.length<=8*1024**2,'Original PG report budget');fs.writeFileSync(3,data);
 // Original HTTP health polling is process-local; owned parent verifies actual exit/reaping and fixture cleanup remains root-owned.
 process.exit(report.status==='passed'?0:1);
});
