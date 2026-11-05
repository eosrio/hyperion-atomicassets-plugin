import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PINS,PROFILE,ACCEPTANCE,LIMITS} from '../scripts/qualification/royalty-attribute-mongo-v1/contract.mjs';
import {expectedAssembly,observeAtomic} from '../scripts/qualification/royalty-attribute-mongo-v1/assembly.mjs';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
test('new attribute qualification binds separate current product and HAPI06, with existing SDK and defaults',()=>{
 const expected=expectedAssembly(),actual=observeAtomic();for(const [key,value]of Object.entries(actual))assert.deepEqual(value,expected[key],key);
 assert.equal(PROFILE,'atomicmarket-royalty-attribute-b55-hapi06-native-v1');assert.equal(PINS.sdk,'cbfb26694b90b52266d1e0b9b5dbf6f8389e736b');
 assert.equal(expected.hapiSources.length,1371);assert.equal(expected.hapiBuild.length,554);assert.equal(expected.nativeDist.length,69);
 assert.equal(ACCEPTANCE.physicalMongoHTTP,'pending');assert.equal(ACCEPTANCE.fullAtomicParity,'pending');
 for(const path of ['src','vendor','package.json','package-lock.json','tsconfig.json','.bun-version','.github/workflows/atomic85-owned-bson-v1.yml','.github/workflows/atomic85-schema-id-v1.yml'])assert.equal(execFileSync('git',['diff',PINS.atomic,'--',path],{cwd:root,encoding:'utf8'}),'',path);
});
test('actual new workflow routes both native Node majors on Ubuntu24 through pure guards then owned child',()=>{
 const source=read('.github/workflows/royalty-attribute-native-v1.yml');assert.match(source,/pull_request:\s+branches: \["main"\]/);assert.match(source,/runs-on: ubuntu-24\.04/);assert.match(source,/node: \['24\.22\.1', '26\.4\.0'\]/);
 assert(source.includes('ref: '+PINS.hapi));assert(source.includes('origin '+PINS.atomic));assert.match(source,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
 const check='node --test tests/royalty-attribute-native-case.test.mjs scripts/qualification/royalty-attribute-mongo-v1/*.test.mjs',run='node scripts/qualification/royalty-attribute-mongo-v1/ci.mjs original-lifecycle';assert(source.includes(check)&&source.includes(run));assert(source.indexOf('npm run build --prefix')<source.indexOf(check));assert(source.indexOf(check)<source.indexOf(run));assert.doesNotMatch(source,/continue-on-error/);
 const ci=read('scripts/qualification/royalty-attribute-mongo-v1/ci.mjs');assert(ci.indexOf('admission = await admitController()')<ci.indexOf('fixture = new OwnedMongoFixture()'));assert(ci.indexOf('loadOriginalReports(')<ci.indexOf('fixture = new OwnedMongoFixture()'));assert(ci.indexOf('verifyChildEvidence({')<ci.indexOf("report.physicalAcceptance = 'passed-bounded-six-attribute-driver-event-only'"));
 assert.equal(LIMITS.parentMS,600000);assert.equal(LIMITS.workloadMS,360000);assert.equal(LIMITS.fixtureMemory,1073741824);
});
test('Repository CI fetches both immutable product bases before auto-discovered qualification controls',()=>{
 const ci=read('.github/workflows/ci.yml'),runner=read('scripts/run-tests.mjs');
 assert.match(runner,/await visit\('tests'\)/);assert.match(runner,/entry\.name\.endsWith\('\.test\.mjs'\)/);
 const command=ci.match(/^\s*run: git fetch --no-tags --depth=1 origin[^\r\n]+/m)?.[0];assert(command,'Explicit immutable qualification fetch required');
 for(const base of ['6261491b37e85c735bad563152147c9c59822f6e',PINS.atomic])assert(command.includes(' '+base),'Main Repository CI is missing immutable base '+base);
 assert(ci.indexOf(command)<ci.indexOf('run: npm test'),'Both bases must exist before full test discovery');
});
