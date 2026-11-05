// Select the actual admitted registry SDK instance; brands never cross installations.
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {findPackageJSON} from 'node:module';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PINS,PROFILE,sha} from './contract.mjs';
import {expectedAssembly} from './assembly.mjs';
export async function loadHostSdk(hapiRoot,assembly){
 assert.equal(assembly.profile,PROFILE);assert.deepEqual(assembly.pins,PINS);
 const registry=join(realpathSync(hapiRoot),'build/indexer/projection/stateful-registry.js');
 const packagePath=findPackageJSON('@eosrio/hyperion-sdk',pathToFileURL(registry));assert.equal(realpathSync(packagePath),realpathSync(join(hapiRoot,'node_modules/@eosrio/hyperion-sdk/package.json')));
 assert(lstatSync(packagePath).isFile()&&!lstatSync(packagePath).isSymbolicLink());const bytes=readFileSync(packagePath),pkg=JSON.parse(bytes),sdkRoot=dirname(packagePath),closure=expectedAssembly(),expected=closure.hapiSDK,ports=[];
 assert.equal(pkg.name,'@eosrio/hyperion-sdk');assert.equal(bytes.length,closure.hapiSDKPackage.bytes);assert.equal(sha(bytes),closure.hapiSDKPackage.sha256);
 for(const name of ['projection-stateful-owner-v2','projection-stateful-source-v2']){
  assert.equal(pkg.exports['./'+name].import,'./dist/'+name+'.js');const path=join(sdkRoot,'dist',name+'.js');assert.equal(realpathSync(path),path);
  const wanted=expected.find(row=>row.path===name+'.js');assert(wanted);const raw=readFileSync(path);assert.equal(raw.length,wanted.bytes);assert.equal(sha(raw),wanted.sha256);ports.push({name,path,bytes:raw.length,sha256:sha(raw)});
 }
 const [owner,source]=await Promise.all(ports.map(row=>import(pathToFileURL(row.path))));
 return {owner,captureSource:source.captureStatefulSourceV2,receipt:{sdkCommit:PINS.sdk,registry,packagePath,packageSha256:sha(bytes),ports}};
}
