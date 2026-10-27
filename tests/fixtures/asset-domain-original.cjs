// Bounded callback/formatter control only. No database or HTTP listener.
'use strict';
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {readFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {join,resolve} = require('node:path');
const reference = resolve(process.argv[2]), plugin = resolve(process.argv[3]);
const sha = b => createHash('sha256').update(b).digest('hex');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:reference,encoding:'utf8'}).trim(),'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
assert.equal(execFileSync('git',['status','--porcelain=v1','--untracked-files=no'],{cwd:reference,encoding:'utf8'}).trim(),'');
const provenance = JSON.parse(readFileSync(join(plugin,'fixtures/harness/atomicassets/lifecycle/provenance.json')));
for(const file of provenance.sources) {
 const blob=execFileSync('git',['show',provenance.commit+':'+file.path],{cwd:reference,timeout:10000});
 assert.equal(sha(blob),file.sha256,file.path);
 const checked=readFileSync(join(reference,file.path));
 assert.ok(checked.equals(blob)||Buffer.from(checked.toString('utf8').replaceAll('\r\n','\n')).equals(blob),'Only Git checkout line endings may differ: '+file.path);
}
const fixture=JSON.parse(readFileSync(join(plugin,'fixtures/harness/atomicassets/domain/expected.json'))),input=fixture.input;
const load=createRequire(join(reference,'package.json'));load('@swc-node/register');
const codec=load('@atomichub/atomicassets');
assert.equal(sha(readFileSync(load.resolve('@atomichub/atomicassets'))),provenance.codec.files[0].sha256);
const {collectionProcessor}=load('./src/filler/handlers/atomicassets/processors/collections.ts');
const {formatAsset}=load('./src/api/namespaces/atomicassets/format.ts');
const listeners = new Map(), processor={onContractRow(contract,table,callback,priority){listeners.set(table,{contract,callback,priority});return()=>listeners.delete(table)}};
const release=collectionProcessor({args:{atomicassets_account:input.contract},config:{collection_format:input.collectionFormat}},processor);
let selected;
const db={async replace(table,row,keys,preserve){assert.equal(table,'atomicassets_collections');assert.deepEqual(keys,['contract','collection_name']);assert.deepEqual(preserve,['created_at_block','created_at_time']);selected=JSON.parse(row.data)}};
const b={block_num:input.block.block_num,timestamp:input.block.timestamp};
(async()=>{
 const listener=listeners.get('collections');assert.equal(listener.priority,20);
 await listener.callback(db,b,{present:true,value:{collection_name:input.collection,author:'author',allow_notify:true,
  authorized_accounts:['author','editor'],notify_accounts:['watcher'],market_fee:.05,
  serialized_data:Buffer.from(codec.serialize(input.collectionData,codec.CachedObjectSchema(input.collectionFormat))).toString('hex')}});
 assert.deepEqual(selected,fixture.stages[0].collections[0].data);
 for(const stage of fixture.stages) assert.deepEqual(JSON.parse(JSON.stringify(formatAsset(structuredClone(stage.view)))),stage.formatted);
 release();assert.equal(listeners.size,0);
 console.log(JSON.stringify({node:process.version,originalCollectionCallback:true,originalFormatterStages:fixture.stages.length,safeSupportedSubset:true,physicalSQL:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
