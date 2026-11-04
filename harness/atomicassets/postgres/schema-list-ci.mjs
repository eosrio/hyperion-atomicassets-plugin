import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {originalSource,copyDefinitions,sha} from './source.mjs';
import {PIN} from './image-identity.mjs';
import {CI,admitService,inspectCiDatabase} from './schema-list-ci-admission.mjs';
import {templatePostgresOracle} from './royalty-template-oracle.mjs';
import {manifest as royaltyManifest} from '../../../tests/fixtures/royalty-rule-original.mjs';
import {captureHarnessFiles} from './schema-list-ci-metadata.mjs';
const require=createRequire(import.meta.url);
const output=join(process.env.RUNNER_TEMP,'schema-oracle.json');
const report={schemaVersion:1,status:'running',qualified:false,startedAt:new Date().toISOString(),connectionClose:{attempted:false},events:[]};
const persist=()=>{const data=JSON.stringify(report,null,2)+'\n';assert.ok(Buffer.byteLength(data)<=PIN.reportBytes);writeFileSync(output,data);};
const errorInfo=e=>({name:e?.name??'Error',code:e?.code??null,message:String(e?.message??e).replaceAll(CI.password,'[redacted]').slice(0,2048),stack:String(e?.stack??'').replaceAll(CI.password,'[redacted]').slice(0,8192)});
persist();
const deadline=setTimeout(()=>{report.status='failed';report.timeout={name:'TimeoutError',message:'CI schema oracle exceeded 180 seconds'};report.connectionClose={attempted:false,reason:'deadline'};report.completedAt=new Date().toISOString();persist();process.exit(1);},PIN.childDeadlineMS);
let db;
try {
 assert.equal(process.platform,'linux'); assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.ok([24,26].includes(Number(process.versions.node.split('.')[0]))); assert.equal(process.versions.bun,undefined);
 const docker=(...args)=>JSON.parse(execFileSync('docker',args,{encoding:'utf8',timeout:10000,maxBuffer:2*1024**2}));
 const id=process.env.AA_CI_CONTAINER_ID; assert.match(id??'',/^[a-f0-9]{64}$/);
 report.fixture=admitService(docker('inspect',id)[0],docker('image','inspect',PIN.image)[0],id); persist();
 const reference=originalSource(process.env.AA_REFERENCE_ROOT);
 const sourcePaths=['src/api/namespaces/atomicassets/handlers/schemas.ts','src/api/namespaces/atomicassets/format.ts','src/api/builder.ts','src/api/namespaces/lists.ts','src/api/namespaces/validation.ts','src/api/namespaces/utils.ts','src/api/namespaces/atomicassets/utils.ts','src/connections/postgres.ts','definitions/tables/atomicassets_tables.sql','definitions/views/atomicassets_schemas_master.sql','definitions/migrations/1.2.3/atomicassets.sql','definitions/migrations/1.3.15/atomicassets.sql'];
 report.reference={commit:reference.commit,lockSha256:reference.lockSha256,workingLockSha256:reference.actualWorkingLockSha256,checkedSources:reference.observed,
  additionalSources:sourcePaths.map(path=>{const bytes=execFileSync('git',['cat-file','blob',reference.commit+':'+path],{cwd:reference.root,timeout:10000,maxBuffer:2*1024**2});const working=readFileSync(join(reference.root,path));return {path,bytes:bytes.length,sha256:sha(bytes),workingBytes:working.length,workingSha256:sha(working)};})};
 report.royaltySources=Object.keys(royaltyManifest.sources).map(name=>{const pin=royaltyManifest.sources[name],bytes=execFileSync('git',['cat-file','blob',reference.commit+':'+pin.path],{cwd:reference.root,timeout:10000,maxBuffer:2*1024**2});assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);return {path:pin.path,bytes:bytes.length,sha256:sha(bytes),gitBlob:pin.gitBlob};});
 report.harness=captureHarnessFiles();
 report.royaltyHarness=['tests/fixtures/royalty-rule-original.mjs','tests/fixtures/royalty-rule-original-2.7/manifest.json',...Object.keys(royaltyManifest.sources).map(name=>'tests/fixtures/royalty-rule-original-2.7/'+name)].map(path=>{const bytes=readFileSync(new URL('../../../'+path,import.meta.url));return {path,bytes:bytes.length,sha256:sha(bytes)};});
 report.runtime={version:process.version,executableSha256:sha(readFileSync(process.execPath)),platform:process.platform,arch:process.arch}; persist();
 const dir=mkdtempSync(join(tmpdir(),'aa-schema-ci-'));copyDefinitions(reference,dir);process.chdir(dir);
 for(const key of Object.keys(process.env)) if(key.startsWith('PG')||key.startsWith('POSTGRES_TEST_')||key.startsWith('REDIS_TEST_')||['NODE_OPTIONS','NODE_PATH','TS_NODE_PROJECT'].includes(key)) delete process.env[key];
 process.env.SWC_NODE_PROJECT=join(reference.root,'tsconfig.json');process.env.SWC_NODE_CACHE_DIR=join(dir,'swc-cache');process.env.PGSSLMODE='disable';process.env.PG_POOL_MAX='4';
 reference.fromReference('@swc-node/register');
 const Connection=reference.fromReference('./src/connections/postgres.ts').default;
 db=new Connection('127.0.0.1',CI.port,CI.user,CI.password,CI.database);
 report.admission=await inspectCiDatabase(db);persist();
 report.schema=await require('./schema.cjs')(reference.fromReference,db,report.admission,event=>{assert.ok(report.events.length<2048);report.events.push(event);});persist();
 report.result=await require('./schema-list-oracle.cjs')(reference.fromReference,db);persist();
 report.royaltyTemplate=await templatePostgresOracle(db);report.status='passed';
} catch(e) {report.status='failed';report.error=errorInfo(e);process.exitCode=1;persist();}
finally {
 if(db){report.connectionClose={attempted:true};try{await db.end();report.connectionClose.succeeded=true;}catch(e){report.connectionClose.succeeded=false;report.connectionClose.error=errorInfo(e);report.status='failed';process.exitCode=1;}}
 clearTimeout(deadline);report.completedAt=new Date().toISOString();persist();
}
// Derive the terminal code after cleanup; the workflow also checks the persisted report independently.
process.exitCode=report.status==='passed'?0:1;
