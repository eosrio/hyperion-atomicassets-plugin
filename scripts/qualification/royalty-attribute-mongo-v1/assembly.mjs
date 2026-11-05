// Read-only complete source/build/dependency admission for this new qualification.
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventory} from '../jsonb-display-mongo-http/assembly.mjs';
import {PINS,PROFILE,sha} from './contract.mjs';
export const root=fileURLToPath(new URL('../../../',import.meta.url));
const git=(base,...args)=>execFileSync('git',['-c','core.autocrlf=false',...args],{cwd:base,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const members=(base,paths)=>paths.map(path=>{const bytes=readFileSync(join(base,path));return {path,bytes:bytes.length,sha256:sha(bytes)};});
export function expectedAssembly(){
 const profile=JSON.parse(readFileSync(new URL('./profile.json',import.meta.url)));
 assert.equal(profile.schemaVersion,1);assert.equal(profile.profile,PROFILE);assert.equal(profile.physicalAcceptance,'pending');assert.deepEqual(profile.pins,PINS);
 assert.equal(profile.expectedInputOrigin.archiveSha256,'c0847d10567d5669db0ed7bfc5ae551f84ddc0ef9e6df5d50ac029fcf02b6b1f');
 assert.equal(profile.expectedInputOrigin.physicalAcceptance,'pending-fresh-Node24-and-Node26');return profile.observation;
}
export function observeAtomic(){
 assert.equal(git(root,'rev-parse',PINS.atomic+'^{tree}'),PINS.atomicTree);
 assert.equal(git(root,'diff',PINS.atomic,'--','src','vendor','package.json','package-lock.json','tsconfig.json','.bun-version'),'','Atomic product inputs changed');
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json')));assert.equal(lock.packages['node_modules/@eosrio/hyperion-sdk'].resolved,'git+https://github.com/eosrio/hyperion-sdk.git#'+PINS.sdk);
 return {atomicSources:inventory(join(root,'src')),atomicVendor:inventory(join(root,'vendor')),atomicDist:inventory(join(root,'dist')),atomicSDK:inventory(join(root,'node_modules/@eosrio/hyperion-sdk/dist')),atomicSDKPackage:members(root,['node_modules/@eosrio/hyperion-sdk/package.json'])[0]};
}
export function observeAssembly(hapiRoot){
 hapiRoot=realpathSync(hapiRoot);assert.equal(git(hapiRoot,'rev-parse','HEAD'),PINS.hapi);assert.equal(git(hapiRoot,'rev-parse','HEAD^{tree}'),PINS.hapiTree);
 assert.equal(git(hapiRoot,'status','--porcelain=v1','--untracked-files=all'),'','Clean exact HAPI06 checkout required');
 for(const path of ['package-lock.json','packages/backend-mongodb/package-lock.json']){const lock=JSON.parse(readFileSync(join(hapiRoot,path)));assert.equal(lock.packages['node_modules/@eosrio/hyperion-sdk'].resolved,'git+https://github.com/eosrio/hyperion-sdk.git#'+PINS.sdk);}
 return {...observeAtomic(),hapiSources:members(hapiRoot,git(hapiRoot,'ls-files','-z').split('\0').filter(Boolean).sort()),hapiBuild:inventory(join(hapiRoot,'build')),nativeDist:inventory(join(hapiRoot,'packages/backend-mongodb/dist')),
  hapiSDK:inventory(join(hapiRoot,'node_modules/@eosrio/hyperion-sdk/dist')),nativeSDK:inventory(join(hapiRoot,'packages/backend-mongodb/node_modules/@eosrio/hyperion-sdk/dist')),
  hapiSDKPackage:members(hapiRoot,['node_modules/@eosrio/hyperion-sdk/package.json'])[0],nativeSDKPackage:members(hapiRoot,['packages/backend-mongodb/node_modules/@eosrio/hyperion-sdk/package.json'])[0],
  dependencies:Object.fromEntries([['rootMongo','node_modules/mongodb'],['rootBSON','node_modules/bson'],['nativeMongo','packages/backend-mongodb/node_modules/mongodb'],['nativeBSON','packages/backend-mongodb/node_modules/bson'],['Fastify','node_modules/fastify']].map(([name,path])=>[name,inventory(join(hapiRoot,path))]))};
}
export async function verifyAssembly(hapiRoot,reviewedHarness){
 const harness={commit:git(root,'rev-parse','HEAD'),tree:git(root,'rev-parse','HEAD^{tree}')};assert.deepEqual(harness,reviewedHarness);
 assert.equal(git(root,'status','--porcelain=v1','--untracked-files=all'),'','Clean isolated attribute qualification checkout required');
 const actual=observeAssembly(hapiRoot);assert.deepEqual(actual,expectedAssembly(),'Fresh complete Atomic-b55/HAPI06 assembly differs');
 return {profile:PROFILE,pins:PINS,harness,observationSha256:sha(JSON.stringify(actual)),runtime:{node:process.version,executableSha256:sha(readFileSync(process.execPath)),platform:process.platform,arch:process.arch}};
}
