'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
const {commit,sources:rows}=require('./original-buyoffer-sources.json');
assert.equal(commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
assert.equal(rows.length,13);assert.equal(new Set(rows.map(row=>row.path)).size,13);
for(const row of rows)Object.freeze(row);Object.freeze(rows);

/** Invocation-local raw capture; all original working files are checked every time. */
exports.captureBuyofferSources=async function(root,{exec=execFileSync,read=readFileSync}={}){
  const options={cwd:root,maxBuffer:2*1024*1024,timeout:10000,windowsHide:true};
  const tree=exec('git',['ls-tree','-r',commit],options).toString('utf8');
  const members=new Map(tree.trimEnd().split('\n').map(line=>{const [meta,path]=line.split('\t');return[path,meta];}));
  for(const row of rows)assert.equal(members.get(row.path),'100644 blob '+row.blob,'Original source tree identity: '+row.path);
  const {readPinnedBlobs}=await import('../../harness/atomicassets/postgres/git-blob-batch.mjs');
  const blobs=readPinnedBlobs(rows,input=>exec('git',['cat-file','--batch'],{...options,input}));
  return rows.map((row,index)=>{
    const raw=blobs[index];assert.equal(read(join(root,row.path),'utf8').replaceAll('\r\n','\n'),raw.toString());
    return {path:row.path,bytes:row.bytes,sha256:row.sha256};
  });
};
