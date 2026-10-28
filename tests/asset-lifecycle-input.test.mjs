import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parseArgs} from '../harness/atomicassets/postgres/run.mjs';
import {input as portableInput} from './fixtures/asset-domain-cases.mjs';

const require=createRequire(import.meta.url);
const {ORIGINAL,SAFE_IMAGE,loadInputProfile,validateInputProfile}=require('../harness/atomicassets/lifecycle-input.cjs');
const originalPath=new URL('../fixtures/harness/atomicassets/lifecycle/input.json',import.meta.url);
const safePath=new URL('../fixtures/harness/atomicassets/lifecycle/input-safe-image.json',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');

test('default original profile preserves its exact existing bytes and NUL input',()=>{
 const raw=readFileSync(originalPath),value=loadInputProfile();
 assert.equal(value.descriptor.profile,ORIGINAL);assert.deepEqual(value.input,JSON.parse(raw));
 assert.equal(value.descriptor.selectedInput.file,'input.json');assert.equal(value.descriptor.selectedInput.bytes,raw.length);assert.equal(value.descriptor.selectedInput.sha256,sha(raw));
 assert.ok(['8006d4c79506d19bbdad4cab6f794368be960f30f90b673e07e1cc42e1fc7f6a','6c4a2a25d7d57afe043c18cb20b9c9125992a5d90965fa8409cc0d689f6cfbfe'].includes(sha(raw)));
 assert.equal(value.input.collectionData.img,'image\0hash');assert.equal(value.descriptor.substitutionApplied,false);
});

test('explicit safe profile changes exactly one raw field and retains the complete original input',()=>{
 const before=readFileSync(originalPath),after=readFileSync(safePath),safe=loadInputProfile(SAFE_IMAGE),original=loadInputProfile();
 assert.equal(before.toString().split('image\\u0000hash').length,2);
 // The explicit safe fixture is materialized from the Git-LF original bytes.
 assert.equal(after.toString(),before.toString().replaceAll('\r\n','\n').replace('image\\u0000hash','image hash'));
 assert.equal(after.includes(13),false);assert.equal(sha(after),'612d44a7dfab5d722aeafc07ab768f9abc05875aac4992265b1ac9fff95d1115');
 const expected=structuredClone(original.input);expected.collectionData.img='image hash';assert.deepEqual(safe.input,expected);
 assert.deepEqual(safe.input.codecAttributes,original.input.codecAttributes);assert.equal(safe.input.assetId,'9007199254740993');
 assert.equal(safe.descriptor.substitutionApplied,true);assert.notEqual(safe.descriptor.selectedInput.sha256,safe.descriptor.originalInput.sha256);
 assert.deepEqual(portableInput,safe.input,'Portable tracer and original driver select the same complete input');
});

test('both profiles report the unresolved codec difference and return detached input',()=>{
 for(const name of [ORIGINAL,SAFE_IMAGE]){
  const value=loadInputProfile(name);
  assert.deepEqual(value.descriptor.safeImageDifference,{field:'collectionData.img',original:'image\0hash',safeImage:'image hash'});
  assert.deepEqual(value.descriptor.codecExceptions,{nul:'unresolved',literalBackslash:'unresolved'});
  assert.equal(value.descriptor.inputsNormalized,false);assert.equal(value.descriptor.selectionDoesNotEstablishParity,true);
  value.input.collectionData.img='changed';value.descriptor.codecExceptions.nul='resolved';
  assert.equal(loadInputProfile(name).descriptor.codecExceptions.nul,'unresolved');
  assert.notEqual(loadInputProfile(name).input.collectionData.img,'changed');
 }
});

test('profile selection refuses unknown names and paths; descriptor validation rejects digest and evidence drift',()=>{
 for(const name of ['unknown','../input.json','input.json','',null,{},[]])assert.throws(()=>loadInputProfile(name));
 const valid=loadInputProfile(SAFE_IMAGE).descriptor;assert.deepEqual(validateInputProfile(valid).descriptor,valid);
 for(const change of [d=>d.selectedInput.sha256='0'.repeat(64),d=>d.referenceCommit='other',d=>d.profile=ORIGINAL,
  d=>delete d.codecExceptions,d=>delete d.safeImageDifference,d=>d.substitutionApplied=false,d=>d.inputsNormalized=true,d=>d.extra=true]){
  const bad=structuredClone(valid);change(bad);assert.throws(()=>validateInputProfile(bad),/profile binding differs/);
 }
});

test('raw fixture digest drift refuses even when mutated bytes remain valid JSON',()=>{
 const root=mkdtempSync(join(tmpdir(),'aa-input-profile-'));
 try{
  const harness=join(root,'harness/atomicassets'),fixtures=join(root,'fixtures/harness/atomicassets/lifecycle');
  mkdirSync(harness,{recursive:true});mkdirSync(fixtures,{recursive:true});
  const module=join(harness,'lifecycle-input.cjs');copyFileSync(new URL('../harness/atomicassets/lifecycle-input.cjs',import.meta.url),module);
  for(const [name,path]of [['input.json',originalPath],['input-safe-image.json',safePath]])copyFileSync(path,join(fixtures,name));
  const isolated=require(module);isolated.loadInputProfile(SAFE_IMAGE);
  writeFileSync(join(fixtures,'input.json'),readFileSync(originalPath).toString().replaceAll('\r\n','\n'));
  assert.equal(isolated.loadInputProfile().descriptor.selectedInput.checkout,'git-lf');
  assert.equal(isolated.loadInputProfile().input.collectionData.img,'image\0hash');
  writeFileSync(join(fixtures,'input-safe-image.json'),readFileSync(safePath).toString().replaceAll('\n','\r\n'));
  assert.throws(()=>isolated.loadInputProfile(SAFE_IMAGE),/digest drift/);
  writeFileSync(join(fixtures,'input-safe-image.json'),readFileSync(safePath).toString().replace('original collection','changed collection'));
  assert.throws(()=>isolated.loadInputProfile(SAFE_IMAGE),/digest drift/);isolated.loadInputProfile();
  writeFileSync(join(fixtures,'input.json'),readFileSync(originalPath).toString()+' ');
  assert.throws(()=>isolated.loadInputProfile(),/digest drift/);
 }finally{
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('aa-input-profile-'));
  rmSync(root,{recursive:true});
 }
});

test('original CLI stays the default and the safe profile requires an explicit named flag',()=>{
 const args=['--execute','--admission','receipt','--reference-root','original','--evidence-parent','owned'];
 assert.deepEqual(parseArgs(args),{receipt:'receipt',referenceRoot:'original',evidenceParent:'owned'});
 assert.equal(parseArgs([...args,'--input-profile',SAFE_IMAGE]).inputProfile,SAFE_IMAGE);
 assert.throws(()=>parseArgs([...args,'--input-profile','../input.json']));
 assert.throws(()=>parseArgs([...args,'--input-file',SAFE_IMAGE]));
});

test('actual child rejects forged digests or hidden NUL evidence before reference inspection or SQL',()=>{
 const child=fileURLToPath(new URL('../harness/atomicassets/postgres/child.cjs',import.meta.url));
 for(const change of [d=>d.selectedInput.sha256='0'.repeat(64),d=>delete d.safeImageDifference,d=>delete d.codecExceptions]){
  const inputProfile=loadInputProfile(SAFE_IMAGE).descriptor;change(inputProfile);
  const result=spawnSync(process.execPath,[child],{input:JSON.stringify({inputProfile,parentPid:process.pid,receipt:{},referenceRoot:'must-not-be-read'}),
   stdio:['pipe','pipe','pipe','pipe'],windowsHide:true,timeout:10000,maxBuffer:2*1024**2});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
  const report=JSON.parse(result.output[3]);assert.equal(report.status,'failed');assert.equal(report.qualified,false);
  assert.match(report.error.message,/Lifecycle input profile binding differs/);
  assert.equal(report.originalConnectionEnded,false);assert.equal(report.result,undefined);assert.equal(report.reference,undefined);
 }
});
