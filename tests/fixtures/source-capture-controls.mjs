import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as path from 'node:path';
import cp from 'node:child_process';
import module from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';

const project=fileURLToPath(new URL('../../',import.meta.url)),ref=fs.realpathSync(process.argv[2]);
const commit='0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e',sha=b=>createHash('sha256').update(b).digest('hex');
const real={exec:cp.execFileSync,read:fs.readFileSync,lstat:fs.lstatSync,exists:fs.existsSync,require:module.createRequire};
const inventoryPath=path.join(project,'docs/parity/atomicassets/postgres-oracle-sources.json'),inventory=JSON.parse(real.read(inventoryPath)).originalSources;
const options={cwd:ref,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},timeout:10000,maxBuffer:2*1024**2};
const tree=real.exec('git',['ls-tree','-r',commit],options),request=Buffer.from(inventory.map(r=>r.blob+'\n').join(''));
const payload=real.exec('git',['cat-file','--batch'],{...options,input:request}),bodies=new Map(),frames=[];let offset=0;
for(const row of inventory){const begin=offset,nl=payload.indexOf(10,offset),header=payload.subarray(offset,nl).toString('ascii');
 assert.equal(header,row.blob+' blob '+row.bytes);offset=nl+1;const body=payload.subarray(offset,offset+row.bytes);offset+=row.bytes;
 assert.equal(payload[offset++],10);assert.equal(sha(body),row.sha256);bodies.set(row.blob,Buffer.from(body));frames.push(Buffer.from(payload.subarray(begin,offset)));}
assert.equal(offset,payload.length);assert.equal(payload.length,979796);
const lock=bodies.get(inventory.find(r=>r.path==='pnpm-lock.yaml').blob);
const selected=path.join(ref,inventory.find(r=>r.path.startsWith('definitions/')).path),fromRef=real.require(path.join(ref,'package.json')),codec=fromRef.resolve('@atomichub/atomicassets');
const normal=p=>p instanceof URL?fileURLToPath(p):typeof p==='string'?path.resolve(p):'';
const fixtureRoot=fs.mkdtempSync(path.join(tmpdir(),'aa-source-capture-control-'));let mode='valid',calls=[];
function gitPort(executable,args,o){
 assert.equal(executable,'git');assert.equal(o.cwd,ref);assert.equal(o.timeout,10000);assert.equal(o.maxBuffer,2097152);assert.equal(o.env.GIT_OPTIONAL_LOCKS,'0');
 calls.push({args:[...args],inputBytes:o.input?.length??0});
 if(args[0]==='rev-parse')return Buffer.from((mode===(args[1]==='HEAD'?'head':'tag')?'f'.repeat(40):commit)+'\n');
 if(args[0]==='status')return Buffer.from(mode==='dirty'?' M controlled-file\n':'');
 if(args[0]==='ls-tree')return mode==='tracked'?Buffer.from(tree.toString().replace(inventory[0].blob,'f'.repeat(40))):Buffer.from(tree);
 if(args[0]==='show')return Buffer.from(lock);
 if(args[0]==='cat-file'&&args[1]==='blob')return Buffer.from(bodies.get(args[2]));
 assert.deepEqual(args,['cat-file','--batch']);const active=mode==='definitions'?inventory.filter(r=>path.join(ref,r.path)!==selected):inventory;
 assert.deepEqual(o.input,Buffer.from(active.map(r=>r.blob+'\n').join('')));
 if(mode==='process-error')throw Object.assign(new Error('CONTROLLED Git process failed'),{code:'CONTROLLED_GIT_ERROR'});
 let raw=mode==='definitions'?Buffer.concat(frames.filter((_,i)=>path.join(ref,inventory[i].path)!==selected)):Buffer.from(payload);
 if(mode==='foreign')raw.fill(102,0,40);
 if(mode==='reordered')raw=Buffer.concat([frames[1],frames[0],...frames.slice(2)]);
 if(mode==='wrong-type')raw.write('tree',41,'ascii');
 if(mode==='wrong-size'){const n=raw.indexOf(10);raw[n-1]=raw[n-1]===57?56:raw[n-1]+1;}
 if(mode==='body')raw[raw.indexOf(10)+1]^=1;
 if(mode==='separator')raw[frames[0].length-1]=0;
 if(mode==='missing')raw=Buffer.concat(frames.slice(1));
 if(mode==='truncated')raw=raw.subarray(0,raw.length-1);
 if(mode==='extra')raw=Buffer.concat([raw,Buffer.from('\n')]);
 return raw;
}
function readPort(p,...args){
 const key=normal(p);
 if(mode==='working'&&key===selected)return Buffer.from('CONTROLLED changed working bytes');
 if(mode==='codec'&&key===codec)return Buffer.from('CONTROLLED changed codec');
 if(mode==='swc-version'&&key===path.join(ref,'node_modules/@swc-node/register/package.json'))return Buffer.from('{"version":"CONTROLLED"}');
 if(mode==='definitions'&&key===inventoryPath){const d=JSON.parse(real.read(p,...args));d.originalSources=d.originalSources.filter(r=>path.join(ref,r.path)!==selected);return Buffer.from(JSON.stringify(d));}
 return real.read(p,...args);
}
function requirePort(...args){
 const actual=real.require(...args),wrapped=id=>{const value=actual(id);
  if(mode==='package-version'&&id==='./package.json')return {...value,version:'CONTROLLED'};
  if(mode==='package-manager'&&id==='./package.json')return {...value,packageManager:'CONTROLLED'};
  if(mode==='codec-version'&&id==='@atomichub/atomicassets/package.json')return {...value,version:'CONTROLLED'};
  return value;};
 wrapped.resolve=actual.resolve.bind(actual);return wrapped;
}
try{
 const oldRoot=path.join(fixtureRoot,'old');
 for(const relative of ['fixtures/harness/atomicassets/lifecycle/provenance.json','docs/parity/atomicassets/postgres-oracle-sources.json']){
  const target=path.join(oldRoot,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,real.read(path.join(project,relative)),{flag:'wx'});}
 const oldSource=real.read(new URL('./source-capture-494.mjs.txt',import.meta.url));assert.equal(sha(oldSource),'e90de44212b0c60bd9ffc7dc2d73db02f72fe42165d523c98f6f6ada7c125dd7');
 const oldPath=path.join(oldRoot,'harness/atomicassets/postgres/source.mjs');fs.mkdirSync(path.dirname(oldPath),{recursive:true});fs.writeFileSync(oldPath,oldSource,{flag:'wx'});
 cp.execFileSync=gitPort;fs.readFileSync=readPort;fs.lstatSync=(p,...args)=>mode==='symlink'&&normal(p)===selected?{isSymbolicLink:()=>true}:real.lstat(p,...args);
 fs.existsSync=p=>mode==='operator-config'&&normal(p)===path.join(ref,'config/connections.config.json')?true:real.exists(p);module.createRequire=requirePort;module.syncBuiltinESMExports();
 const old=await import(pathToFileURL(oldPath)),current=await import(new URL('../../harness/atomicassets/postgres/source.mjs',import.meta.url));
 const plain=r=>({root:r.root,observed:r.observed,definitions:r.definitions,commit:r.commit,lockSha256:r.lockSha256,actualWorkingLockSha256:r.actualWorkingLockSha256});
 const baseline=plain(old.originalSource(ref));assert.equal(calls.length,211);const oldCalls=calls.length;
 calls=[];const actual=plain(current.originalSource(ref));assert.equal(calls.length,6,'Actual originalSource must use six Git calls');assert.deepEqual(actual,baseline);
 current.originalSource(ref);assert.equal(calls.length,12,'Each invocation re-admits all source identities and reads its own batch');
 const rejected=[];
 for(const bad of ['head','tag','dirty','tracked','operator-config','working','symlink','codec','package-version','package-manager','codec-version','swc-version','definitions',
   'foreign','reordered','wrong-type','wrong-size','body','separator','missing','truncated','extra','process-error']){
  mode=bad;calls=[];assert.throws(()=>current.originalSource(ref),undefined,bad);rejected.push(bad);}
 mode='real';calls=[];cp.execFileSync=(executable,args,o)=>{calls.push([...args]);return real.exec(executable,args,o);};module.syncBuiltinESMExports();
 const started=process.hrtime.bigint(),realCapture=plain(current.originalSource(ref)),elapsedNs=String(process.hrtime.bigint()-started);
 assert.deepEqual(realCapture,baseline);assert.equal(calls.length,6);
 console.log(JSON.stringify({scope:'actual caller with explicitly controlled Git/FS faults plus one real read-only capture; no SQL/oracle/host execution',
  node:process.version,oldSourceSha256:sha(oldSource),oldControlledGitCalls:oldCalls,newControlledGitCalls:6,repeatedControlledGitCalls:12,observedRecords:actual.observed.length,definitions:actual.definitions.length,
  exactObservationOrderAndFields:true,rejected,actualRealCapture:{gitCalls:calls.length,elapsedNs,observed:realCapture.observed,definitions:realCapture.definitions.length,lockSha256:realCapture.lockSha256,actualWorkingLockSha256:realCapture.actualWorkingLockSha256},postgres:false,serverStarted:false}));
}finally{
 cp.execFileSync=real.exec;fs.readFileSync=real.read;fs.lstatSync=real.lstat;fs.existsSync=real.exists;module.createRequire=real.require;module.syncBuiltinESMExports();
 assert.equal(path.dirname(fs.realpathSync(fixtureRoot)),fs.realpathSync(tmpdir()));assert.ok(path.basename(fixtureRoot).startsWith('aa-source-capture-control-'));fs.rmSync(fixtureRoot,{recursive:true});
}
