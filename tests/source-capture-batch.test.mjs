import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sample=()=>[Buffer.from([0,255,10,13,0]),Buffer.from('binary\nbody\0without final LF'),Buffer.alloc(0)].map((body,i)=>({body,blob:String(i+1).repeat(40),bytes:body.length,sha256:sha(body)}));
const packet=rows=>Buffer.concat(rows.flatMap(r=>[Buffer.from(r.blob+' blob '+r.bytes+'\n'),r.body,Buffer.from('\n')]));
const helper=()=>import('../harness/atomicassets/postgres/git-blob-batch.mjs');

test('ordered binary blob frames preserve exact bytes and the complete request',async()=>{
 const {readPinnedBlobs}=await helper(),rows=sample();let calls=0;
 const result=readPinnedBlobs(rows,input=>{calls++;assert.deepEqual(input,Buffer.from(rows.map(r=>r.blob+'\n').join('')));return packet(rows);});
 assert.equal(calls,1);assert.deepEqual(result,rows.map(r=>r.body));
});

test('missing, foreign, reordered, malformed, corrupt and extra batch bytes refuse',async()=>{
 const {readPinnedBlobs}=await helper(),rows=sample(),good=packet(rows),first=packet([rows[0]]);
 const foreign=Buffer.from(good);foreign.fill(102,0,40);const type=Buffer.from(good);type.write('tree',41,'ascii');
 const size=Buffer.from(good);size[good.indexOf(10)-1]=57;const body=Buffer.from(good);body[good.indexOf(10)+1]^=1;
 const separator=Buffer.from(good);separator[first.length-1]=0;
 for(const raw of [Buffer.alloc(0),foreign,packet([...rows].reverse()),type,size,body,separator,good.subarray(0,good.length-1),Buffer.concat([good,Buffer.from('\n')]),packet(rows.slice(1))])
  assert.throws(()=>readPinnedBlobs(rows,()=>raw));
 const error=new Error('CONTROLLED process failed');assert.throws(()=>readPinnedBlobs(rows,()=>{throw error;}),e=>e===error);
 assert.throws(()=>readPinnedBlobs(rows,()=>good.toString('latin1')));
});

test('batch metadata and aggregate stay inside the unchanged two MiB bound before invoking Git',async()=>{
 const {readPinnedBlobs}=await helper(),row=sample()[0];let calls=0;
 for(const rows of [[],Array(207).fill(row),[{...row,blob:'bad'}],[{...row,bytes:-1}],[{...row,bytes:2*1024**2}],[{...row,sha256:'bad'}]])
  assert.throws(()=>readPinnedBlobs(rows,()=>{calls++;return Buffer.alloc(0);}));
 assert.equal(calls,0);
});

test('actual originalSource caller preserves old observations, command options and admission guards',()=>{
 const root=process.env.AA_REFERENCE_ROOT;assert.ok(root);
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/source-capture-controls.mjs',import.meta.url)),root],
  {cwd:fileURLToPath(new URL('../',import.meta.url)),env:process.env,timeout:60000,maxBuffer:2*1024**2,windowsHide:true});
 const output=fileURLToPath(new URL('../out/source-capture43/',import.meta.url));mkdirSync(output,{recursive:true});
 const name='caller-'+process.version+'-'+process.pid;writeFileSync(output+'/'+name+'.stdout',child.stdout??Buffer.alloc(0));writeFileSync(output+'/'+name+'.stderr',child.stderr??Buffer.alloc(0));
 writeFileSync(output+'/'+name+'.terminal.json',JSON.stringify({status:child.status,signal:child.signal,error:child.error?{name:child.error.name,message:child.error.message,code:child.error.code}:null})+'\n');
 assert.ifError(child.error);assert.equal(child.status,0,child.stderr?.toString());const result=JSON.parse(child.stdout);
 assert.equal(result.observedRecords,206);assert.equal(result.definitions,176);assert.equal(result.newControlledGitCalls,6);assert.equal(result.rejected.length,23);
 assert.equal(result.actualRealCapture.gitCalls,6);assert.equal(result.exactObservationOrderAndFields,true);assert.equal(result.postgres,false);
});
