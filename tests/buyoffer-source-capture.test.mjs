import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
const require=createRequire(import.meta.url),{captureBuyofferSources}=require('./fixtures/original-buyoffer-sources.cjs');
const pins=require('./fixtures/original-buyoffer-sources.json'),root=process.env.AA_REFERENCE_ROOT;
assert.ok(root,'AA_REFERENCE_ROOT is required');
const options={cwd:root,maxBuffer:2*1024*1024,timeout:10000,windowsHide:true};
for(const ref of ['HEAD','refs/tags/2.7.0'])assert.equal(execFileSync('git',['rev-parse',ref],options).toString().trim(),pins.commit);
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const expected=pins.sources.map(({path,bytes,sha256})=>({path,bytes,sha256}));
let tree,batch;

test('buyoffer capture actual caller reads ordered thirteen members freshly with exact bounded process options',async()=>{
  const commands=[],reads=[];
  const exec=(program,args,actual)=>{
    assert.equal(program,'git');assert.equal(actual.cwd,root);assert.equal(actual.maxBuffer,2*1024*1024);assert.equal(actual.timeout,10000);assert.equal(actual.windowsHide,true);
    commands.push(args);const raw=execFileSync(program,args,actual);
    if(args[0]==='ls-tree')tree=Buffer.from(raw);else{assert.deepEqual(args,['cat-file','--batch']);assert.deepEqual(actual.input,Buffer.from(pins.sources.map(row=>row.blob+'\n').join('')));batch=Buffer.from(raw);}
    return raw;
  };
  const read=(path,encoding)=>{reads.push(path);return readFileSync(path,encoding);};
  const first=await captureBuyofferSources(root,{exec,read}),second=await captureBuyofferSources(root,{exec,read});
  assert.deepEqual(first,expected);assert.deepEqual(second,expected);assert.notEqual(first,second);
  assert.deepEqual(commands.map(args=>args[0]),['ls-tree','cat-file','ls-tree','cat-file']);
  assert.deepEqual(reads,[...pins.sources,...pins.sources].map(row=>join(root,row.path)));
});

test('buyoffer capture actual caller rejects reordered, foreign, truncated, malformed and extra batch bytes',async()=>{
  assert.ok(batch&&tree);
  const firstSize=batch.indexOf(10)+1+pins.sources[0].bytes+1,secondSize=batch.indexOf(10,firstSize)+1+pins.sources[1].bytes+1;
  const headerEnd=batch.indexOf(10),separator=headerEnd+1+pins.sources[0].bytes;
  const mutations=[raw=>Buffer.alloc(0),raw=>raw.subarray(0,-1),raw=>Buffer.concat([raw,Buffer.from('\n')]),
    raw=>Buffer.concat([raw.subarray(firstSize,secondSize),raw.subarray(0,firstSize),raw.subarray(secondSize)]),
    raw=>{raw[0]=raw[0]===97?98:97;return raw;},raw=>{raw[41]=120;return raw;},
    raw=>{raw[headerEnd-1]=57;return raw;},raw=>{raw[headerEnd+1]^=255;return raw;},raw=>{raw[separator]=0;return raw;}];
  for(const mutate of mutations){let reads=0;await assert.rejects(captureBuyofferSources(root,{exec(_program,args){return args[0]==='ls-tree'?tree:mutate(Buffer.from(batch));},read(){reads++;assert.fail('Malformed batch must fail before working reads');}}));assert.equal(reads,0);}
  await assert.rejects(captureBuyofferSources(root,{exec(_program,args){return args[0]==='ls-tree'?tree:'not binary';}}));
});

test('buyoffer capture actual caller refuses missing or foreign tree identities before batch/read and checks working bytes',async()=>{
  for(const changed of [tree.toString().replace(pins.sources[0].blob,'f'.repeat(40)),tree.toString().split('\n').filter(line=>!line.endsWith('\t'+pins.sources[0].path)).join('\n')]){
    const commands=[];await assert.rejects(captureBuyofferSources(root,{exec(_program,args){commands.push(args[0]);assert.equal(args[0],'ls-tree');return Buffer.from(changed);},read(){assert.fail('No working read for wrong tree');}}),/tree identity/);assert.deepEqual(commands,['ls-tree']);
  }
  await assert.rejects(captureBuyofferSources(root,{exec(_program,args){return args[0]==='ls-tree'?tree:batch;},read(path,encoding){return readFileSync(path,encoding)+'\nchanged';}}));
});

test('buyoffer capture actual process failures propagate before any acceptance',async()=>{
  for(const at of ['ls-tree','cat-file']){
    const failure=Object.assign(new Error('controlled actual caller process failure'),{status:null,signal:'SIGTERM',code:'ETIMEDOUT'});
    await assert.rejects(captureBuyofferSources(root,{exec(_program,args){if(args[0]===at)throw failure;return tree;},read(){assert.fail('No read on failed process');}}),error=>error===failure);
  }
});

test('buyoffer capture per-invocation measurement preserves all old thirteen observations without cross-call reuse',async()=>{
  const start=performance.now(),old=pins.sources.map(row=>{
    const raw=execFileSync('git',['show',pins.commit+':'+row.path],options);
    assert.equal(readFileSync(join(root,row.path),'utf8').replaceAll('\r\n','\n'),raw.toString());
    return{path:row.path,bytes:raw.length,sha256:sha(raw)};
  }),oldMs=performance.now()-start,next=performance.now(),current=await captureBuyofferSources(root),newMs=performance.now()-next;
  assert.deepEqual(current,old);assert.deepEqual(current,expected);
  const dir=new URL('../out/buyoffer-extensions/batch-child/',import.meta.url);await mkdir(dir,{recursive:true});
  await writeFile(new URL('capture-measurement-'+process.version+'.json',dir),JSON.stringify({nodeVersion:process.version,originalSourceCount:13,
    oldGitCommands:13,newGitCommands:2,oldMs,newMs,observationsEqual:true,scope:'Capture-only measured observations; no cause assigned to the old package timeout'},null,2)+'\n');
});
