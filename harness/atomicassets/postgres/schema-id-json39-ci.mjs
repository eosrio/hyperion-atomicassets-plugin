// ROOT-REVIEWED FUTURE LINUX CI ONLY. Importing this executable starts a fixture job.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {originalSource,copyDefinitions,sha} from './source.mjs';
import {CI,admitService,inspectCiDatabase} from './schema-list-ci-admission.mjs';
import {PIN} from './image-identity.mjs';
import {lifecycle} from './json-display-lifecycle.mjs';
const require=createRequire(import.meta.url);
assert.equal(process.platform,'linux');assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.ok([24,26].includes(Number(process.versions.node.split('.')[0])));assert.equal(process.versions.bun,undefined);
const root=process.env.RUNNER_TEMP;assert.ok(root);const output=join(root,'schema-id-json39-oracle-v1.json');
const report={schemaVersion:1,status:'running',qualified:false,startedAt:new Date().toISOString(),events:[],
  fixtureRetirement:{performedByHarness:false,owner:'GitHub job service teardown; independent retirement acceptance remains external'}};
const persist=()=>{const data=JSON.stringify(report,null,2)+'\n';assert.ok(Buffer.byteLength(data)<=PIN.reportBytes);writeFileSync(output,data);};
persist();let db;const connectionClosers=[];
const timer=setTimeout(()=>{report.status='failed';report.deadlineExceeded=true;report.cleanupIncomplete=true;
  report.error??={name:'TimeoutError',message:'Original180-second oracle deadline expired'};
  try{persist();}catch(e){process.stderr.write(JSON.stringify({kind:'deadline-report-persistence-failed',primary:report.error,secondary:String(e).slice(0,2048)})+'\n');}
  finally{process.exit(1);}},PIN.childDeadlineMS);
try{await lifecycle(report,{persist:()=>{report.completedAt=new Date().toISOString();persist();},closers:connectionClosers,work:async()=>{
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8',timeout:10000,maxBuffer:2*1024**2}).trim();
  report.plugin={head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),trackedStatus:git('status','--porcelain=v1','--untracked-files=no')};
  assert.equal(report.plugin.trackedStatus,'');assert.equal(report.plugin.head,process.env.AA_EXPECTED_HEAD);
  const docker=(...a)=>JSON.parse(execFileSync('docker',a,{encoding:'utf8',timeout:10000,maxBuffer:2*1024**2}));
  const id=process.env.AA_CI_CONTAINER_ID;report.fixture=admitService(docker('inspect',id)[0],docker('image','inspect',PIN.image)[0],id);persist();
  const reference=originalSource(process.env.AA_REFERENCE_ROOT);report.reference={commit:reference.commit,lockSha256:reference.lockSha256,
    actualWorkingLockSha256:reference.actualWorkingLockSha256,sources:reference.observed};
  const extraPins=JSON.parse(readFileSync(new URL('./schema-id-json39-original-pins.json',import.meta.url)));
  assert.equal(extraPins.commit,reference.commit);
  report.schemaIdOriginalSources=extraPins.sources.map(row=>{const bytes=readFileSync(join(reference.root,row.path));assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);return {...row};});
  const names=['schema-id-json39-original-pins.json','schema-id-json39-source.test.mjs','schema-id-json39-faults.test.mjs','../../../scripts/qualification/jsonb-display-mongo-http/corpus.mjs','../../../tests/fixtures/jsonb-display-pg16.json','../../../fixtures/harness/atomicassets/lifecycle/provenance.json','../../../vendor/atomicassets-2.2.0/build/index.cjs','../../../.github/workflows/schema-id-json39-oracle-v1.yml','schema-id-json39-ci.mjs','schema-id-json39-oracle.cjs','json-display-lifecycle.mjs','schema-id-json39-gate.cjs','schema-id-json39-scenario.cjs','query-observer.cjs','schema.cjs','source.mjs','schema-list-ci-admission.mjs','image-identity.mjs','fixture-pin.json','postgres-16.15-linux-amd64.manifest.json','postgres-16.15-linux-amd64.config.json','../json-vectors.cjs','../lifecycle-input.cjs'];
  report.harness=names.map(path=>{const b=readFileSync(new URL('./'+path,import.meta.url));return {path,bytes:b.length,sha256:sha(b)};});
  report.runtime={version:process.version,executableSha256:sha(readFileSync(process.execPath))};
  const dir=mkdtempSync(join(tmpdir(),'aa-json39-ci-'));copyDefinitions(reference,dir);process.chdir(dir);
  for(const k of Object.keys(process.env))if(k.startsWith('PG')||k.startsWith('POSTGRES_TEST_')||k.startsWith('REDIS_TEST_')||['NODE_OPTIONS','NODE_PATH','TS_NODE_PROJECT'].includes(k))delete process.env[k];
  process.env.SWC_NODE_PROJECT=join(reference.root,'tsconfig.json');process.env.SWC_NODE_CACHE_DIR=join(dir,'swc-cache');process.env.PGSSLMODE='disable';process.env.PG_POOL_MAX='4';
  reference.fromReference('@swc-node/register');const Connection=reference.fromReference('./src/connections/postgres.ts').default;
  report.connectionAcquisition={attempted:true,returned:false};
  db=new Connection('127.0.0.1',CI.port,CI.user,CI.password,CI.database);report.connectionAcquisition.returned=true;
  connectionClosers.push(['originalConnection',()=>db.end()]);report.admission=await inspectCiDatabase(db);persist();
  const record=event=>{assert.ok(report.events.length<2048);report.events.push(event);persist();};
  report.schema=await require('./schema.cjs')(reference.fromReference,db,report.admission,record);persist();
  const selected=require('../lifecycle-input.cjs').loadInputProfile(process.env.AA_JSON39_PROFILE);
  report.inputProfile=selected.descriptor;persist();
  const result = await require('./schema-id-json39-scenario.cjs')(reference.fromReference,db,{host:'127.0.0.1',port:CI.port,user:CI.user,password:CI.password,database:CI.database},record,selected.descriptor,undefined,{mode:'schema-id-json39-v1'});
  const {classifyCorpus, corpus} = await import('../../../scripts/qualification/jsonb-display-mongo-http/corpus.mjs');
  const plans = await classifyCorpus(); assert.equal(plans.length, 63);
  for (let i=0;i<plans.length;i++) {const row=result.display.cases[i], old=corpus.cases[i], plan=plans[i];
    assert.equal(row.name, old.name); assert.equal(row.rotation, old.rotation); assert.equal(row.rawInput, old.rawInput);
    assert.equal(row.encoded, old.encoded); assert.equal(row.storage.accepted, old.storageAccepted);
    row.sourceFrontier={sourceRepresentable:plan.sourceRepresentable, projectionCoverage:plan.sourceRepresentable?'pending-schema-id-mongo-http':'pending-source-or-import-path', codecAttempt:plan.codecAttempt, reason:plan.reason};
  }
  result.scope.schemaIdOriginalCapture=true; result.scope.sourceAuthority='synthetic-only'; return result;
}});}finally{clearTimeout(timer);}
// The original HTTPServer owns a process-local health interval. All explicit
// HTTP/SQL closers run before this normal final exit; timeout remains a failure.
process.exit(report.status==='passed'?0:1);
