// Current source/build and inert actual-controller controls only; no native actors.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {posix} from 'node:path';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {inventory} from '../scripts/qualification/jsonb-display-mongo-http/assembly.mjs';
import {observeProduct, expectedAssembly, frozenAssembly} from '../scripts/qualification/atomic85-managed-v1/assembly.mjs';
import {observeController, retireAutomaticRoute, admitOwnedController, admitSchemaController} from '../scripts/qualification/atomic85-managed-v1/admission.mjs';
import {PINS, PRODUCT, PRODUCT_TREE, PROFILE, CI_PROFILE, SCHEMA_CI_PROFILE, LIMITS, IMAGE, assertOwnedUri, assertChildReceipt} from '../scripts/qualification/atomic85-managed-v1/contract.mjs';
import {PROFILE as OWNED_RUN, ACCEPTANCE as OWNED_ACCEPTANCE, assertRunInput as ownedInput} from '../scripts/qualification/atomic85-managed-v1/run-owned-contract.mjs';
import {PROFILE as SCHEMA_RUN, ACCEPTANCE as SCHEMA_ACCEPTANCE, assertRunInput as schemaInput} from '../scripts/qualification/atomic85-managed-v1/run-schema-contract.mjs';
import {ACCEPTANCE as PRIOR_OWNED} from '../scripts/qualification/jsonb-display-bson-v3/run-contract-v3.mjs';
import {ACCEPTANCE as PRIOR_SCHEMA} from '../scripts/qualification/schema-id-mongo-v1/contract.mjs';
const root = new URL('../', import.meta.url), ns='scripts/qualification/atomic85-managed-v1/';
const read = path => readFileSync(new URL(path, root), 'utf8');
const json = path => JSON.parse(read(path));
const git = (...args) => execFileSync('git',['-c','core.autocrlf=false',...args],{cwd:root,encoding:'utf8',maxBuffer:4*1024**2});
const plain = value => JSON.parse(JSON.stringify(value));

test('current626 product source and every emitted artifact are independently bound; unchanged native inventory stays immutable',()=>{
 const actual=observeProduct(),expected=expectedAssembly(),prior=frozenAssembly();
 assert.equal(git('rev-parse',PRODUCT+'^{tree}').trim(),PRODUCT_TREE);assert.equal(expected.profile,PROFILE);assert.deepEqual(expected.pins,PINS);
 assert.deepEqual(actual.atomicSources,expected.atomicSources);assert.equal(actual.atomicSources.length,44);
 assert.deepEqual(actual.pluginDist,expected.pluginDist);assert.equal(actual.pluginDist.length,132);
 for(const field of ['vendor','harness','sevenDisplayEmissions','sdkDist','hapiSources','hapiBuild','nativeDist','dependencies'])assert.deepEqual(expected[field],prior[field]);
 assert.deepEqual(inventory(new URL('../node_modules/@eosrio/hyperion-sdk/dist/',import.meta.url)),expected.sdkDist);
 const changed=field=>expected[field].filter(row=>JSON.stringify(row)!==JSON.stringify(prior[field].find(old=>old.path===row.path))).map(row=>row.path);
 assert.deepEqual(changed('atomicSources'),['stateful/plugin.ts','stateful/royalty-rules.ts']);
 assert.deepEqual(changed('pluginDist'),['stateful/plugin.d.ts','stateful/plugin.js','stateful/plugin.js.map','stateful/royalty-rules.d.ts','stateful/royalty-rules.js','stateful/royalty-rules.js.map']);
});

test('successor entries have exactly the enumerated source-binding/profile/path changes and preserve all frozen workload bytes',()=>{
 const delta=json(ns+'entry-deltas.json');assert.equal(delta.base,PRODUCT);assert.equal(delta.entries.length,9);
 for(const entry of delta.entries){let source=git('show',PRODUCT+':'+entry.source);assert.equal(read(entry.source),source);
  for(const {before,after}of entry.changes){assert(source.includes(before));source=source.replaceAll(before,after);}assert.equal(read(entry.target),source,entry.target);
  for(const match of source.matchAll(/(?:from\s+|import\()(['"])(\.[^'"]+)\1/g))assert(statSync(new URL(match[2],new URL(entry.target,root))).isFile(),entry.target+': '+match[2]);}
 for(const name of ['owned','schema']){const source=read(ns+'workload-'+name+'.mjs');
  for(const required of ['report.observations.length, 27','report.refusals.length, 6','actual-native-owner-takeover','actual-native-fork-rollback','recorder.assertComplete()'])assert(source.includes(required),name+': '+required);
 }
 assert.deepEqual(OWNED_ACCEPTANCE,PRIOR_OWNED);assert.deepEqual(SCHEMA_ACCEPTANCE,PRIOR_SCHEMA);
 assert.equal(OWNED_ACCEPTANCE.physicalMongoHTTP,'pending');assert.equal(SCHEMA_ACCEPTANCE.physicalMongoHTTP,'pending');
 for(const [profile,check]of [[OWNED_RUN,ownedInput],[SCHEMA_RUN,schemaInput]]){
  const input={profile,databaseName:'h45_indexed_abcdef012345',inputProfile:'original-lifecycle',reviewedHarness:{commit:'a'.repeat(40),tree:'b'.repeat(40)},guard(){},persist(){},persistBinary(){}};
  check(input);for(const change of [{profile:'atomic79-hapi7270-jsonb-display-id-bson-host-sdk-mongo-http-v3'},{databaseName:'borrowed'},{inputProfile:'other'},{persistBinary:undefined},{guard:undefined}])assert.throws(()=>check({...input,...change}));
 }
});

test('new automatic workflows preserve all eight physical jobs and current admission/build/control ordering',()=>{
 for(const [name,workflow,old]of [['owned','atomic85-owned-bson-v1','jsonb-display-bson-v3'],['schema','atomic85-schema-id-v1','schema-id-mongo-v1']]){
  const source=read('.github/workflows/'+workflow+'.yml');
  assert.match(source,/  pull_request:\n    branches: \["main"\]\npermissions:/);assert(!source.includes('    paths:'));
  assert(source.includes("node: ['24.22.1', '26.4.0']"));assert(source.includes('profile: [original-lifecycle, portable-safe-image]'));
  for(const text of ['timeout-minutes: 20','persist-credentials: false','ref: ${{ github.event.pull_request.head.sha || github.sha }}','HYPERION_EXPECTED_HEAD: ${{ github.event.pull_request.head.sha || github.sha }}','ref: '+PINS.hapi,'npm ci --allow-git=all','npm run build','npm run typecheck','tests/atomic85-managed-successor.test.mjs',PRODUCT,ns+'*.test.mjs'])assert(source.includes(text),text);
  assert(!source.includes('ATOMIC81_V3_ROUTE_BASELINE'));assert(!source.includes('--test-skip-pattern'));
  assert(!source.includes(': write'));assert(!source.includes('continue-on-error'));assert(!source.includes('services:'));
  const command='node '+ns+'ci-'+name+'.mjs ${{ matrix.profile }}';assert(source.indexOf('npm run build')<source.indexOf('tests/atomic85-managed-successor.test.mjs'));assert(source.indexOf('tests/atomic85-managed-successor.test.mjs')<source.indexOf(command));
  assert(source.includes('path: out/atomic85-managed-'+name+'-v1-${{ matrix.profile }}'));
  const oldPath='.github/workflows/'+old+'.yml',before=git('show',PRODUCT+':'+oldPath),current=read(oldPath);
  assert.equal(current,retireAutomaticRoute(before));assert(!current.includes('  pull_request:'));assert(current.includes('  workflow_dispatch:'));
  assert.equal(current.slice(current.indexOf('jobs:\n')),before.slice(before.indexOf('jobs:\n')));
 }
 const repository=read('.github/workflows/ci.yml');assert(repository.includes('git fetch --no-tags --depth=1 origin '+PRODUCT));assert(!repository.includes('ATOMIC81_V3_ROUTE_BASELINE'));
});

test('current harness census preserves every frozen input and binds successor files with only the reviewed two-file cycle',()=>{
 const observation=observeController();assert.equal(observation.physicalAcceptance,'pending');assert.equal(observation.product,PRODUCT);
 assert.deepEqual(observation.cycleInputsBoundByReviewedGitTree,[ns+'admission.mjs',ns+'binding.json']);
 const profile=json(ns+'binding.json');assert.equal(profile.physicalAcceptance,'pending');assert.deepEqual(observation,profile.observation);
 for(const path of [ns+'profile.json',ns+'assembly.mjs',ns+'host-sdk.mjs',ns+'workload-owned.mjs',ns+'workload-schema.mjs',ns+'child-owned.mjs',ns+'child-schema.mjs',ns+'ci-owned.mjs',ns+'ci-schema.mjs'])assert(observation.files.some(row=>row.path===path));
 assert.equal(observation.oldWorkflowExceptions.length,2);assert.equal(new Set(observation.files.map(x=>x.path)).size,observation.files.length);
});

test('current expected profile refuses changed identity, acceptance and attempts to override the frozen native closure',()=>{
 const source=read(ns+'assembly.mjs'),start=source.indexOf('export function expectedAssembly()'),end=source.indexOf('\nexport function observeAssembly',start);
 const original=json(ns+'profile.json');
 for(const mutate of [x=>x.profile='old',x=>x.physicalAcceptance='passed',x=>x.pins.sdk='0'.repeat(40),x=>x.frozenAssemblySha256='0'.repeat(64),x=>x.currentProduct.dependencies={}]){
  const value=plain(original);mutate(value);const context={assert,readFileSync:()=>JSON.stringify(value),URL,PROFILE,PINS,FROZEN_ASSEMBLY_SHA256:original.frozenAssemblySha256,frozenAssembly};
  const body=source.slice(start,end).replace('export ','').replace("new URL('./profile.json', import.meta.url)","'inert-profile'");runInNewContext(body+'\nthis.check=expectedAssembly;',context);assert.throws(()=>context.check());
 }
});

function inertController(name,failure){
 // Reuse the qualified inert fixture, but read and execute each actual successor body.
 const fixture=read('tests/owned-bson-display-v3.test.mjs'),start=fixture.indexOf('function controller('),end=fixture.indexOf("\ntest('actual controller stages",start);
 const source=read(ns+'ci-'+name+'.mjs'),readiness={assert};
 runInNewContext(source.slice(source.indexOf('async function waitForOwnedReadiness('),source.indexOf('\nasync function supervisedChild('))+'\nthis.run=waitForOwnedReadiness;',readiness);
 let body=fixture.slice(start,end).replace('const context = {assert,',"const context = {stageSchemaReports:async()=>{effects.push('schema-reports');if(failure==='schema-reports')throw Error('schema-report-failure');return [1,2,3,4];},verifySchemaReports:async()=>[],schemaExpectations:()=>Array(63),classifyCorpus:async()=>[],assert,");
 body=body.replace('records = [], admission = {','records = [], admission = JSON.parse(JSON.stringify({').replace("runtime: {node: 'v26.4.0', sha256: 'f'.repeat(64)}};","runtime: {node: 'v26.4.0', sha256: 'f'.repeat(64)}}));");
 if(name==='schema')body=body.replaceAll('passed-bounded-source-representable-IDs-only','passed-bounded-schema-id-display-only');
 const context={assert,Buffer,JSON,LIMITS,IMAGE,assertOwnedUri,assertChildReceipt,runInNewContext,EventEmitter,posix,AbortController,
  head:'a'.repeat(40),tree:'b'.repeat(40),run:'c'.repeat(32),root:'/owned/atomic',read:path=>path==='ci.mjs'?source:read(ns+path),waitForOwnedReadiness:readiness.run};
 runInNewContext(body+'\nthis.make=controller;',context);return context.make({failure});
}
for(const name of ['owned','schema'])test('actual '+name+' successor controller refuses failed admission/report custody before physical actors',async()=>{
 for(const failure of ['admission','reports',...(name==='schema'?['schema-reports']:[])]){
  const c=inertController(name,failure);await assert.rejects(c.run());assert(!c.effects.includes('fixture-constructor'));assert(!c.effects.includes('child'));
 }
 const c=inertController(name);const result=await c.run();assert.equal(result.status,'passed');assert(c.effects.indexOf('admit')<c.effects.indexOf('stage-all-four'));assert(c.effects.indexOf('stage-all-four')<c.effects.indexOf('fixture-constructor'));
 if(name==='schema')assert(c.effects.indexOf('schema-reports')<c.effects.indexOf('fixture-constructor'));
 assert(c.effects.indexOf('checkpoint:before')<c.effects.indexOf('docker-prepare'));assert(c.effects.indexOf('child')<c.effects.indexOf('cleanup'));assert.equal(c.effects.at(-1),'checkpoint:after');
});

test('both live admissions refuse this Windows source-control process without reaching native actors',async()=>{
 if(process.platform==='linux')return;
 await assert.rejects(admitOwnedController());await assert.rejects(admitSchemaController());assert.notEqual(CI_PROFILE,SCHEMA_CI_PROFILE);
});
