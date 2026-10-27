import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {PIN,validateReceipt,verifyObservedFixture,admitEmptyDatabase} from '../harness/atomicassets/postgres/admission.mjs';
import {parseArgs} from '../harness/atomicassets/postgres/run.mjs';
const require=createRequire(import.meta.url),observe=require('../harness/atomicassets/postgres/query-observer.cjs');
const cases=require('../harness/atomicassets/postgres/scenario.cjs').codecProbeCases;
const run='a'.repeat(32),labels={'io.eosrio.qualifier':'atomicassets-original-postgres','io.eosrio.run':run};
function fixture(){
 const receipt={schemaVersion:1,run,daemonId:'controlled-daemon-id',socketDev:1,socketIno:2,containerId:'b'.repeat(64),networkId:'d'.repeat(64),volumeName:'aa_pg_'+run};
 const image={Id:PIN.registryInspection.configDigest,Os:'linux',Architecture:'amd64',RepoDigests:[PIN.image],Config:{Entrypoint:['docker-entrypoint.sh']}};
 const observed={daemon:{ID:receipt.daemonId},socket:{dev:1,ino:2},image,
  volume:{Name:receipt.volumeName,Driver:'local',Options:null,Labels:labels},network:{Id:receipt.networkId,Internal:true,Labels:labels},
  container:{Id:receipt.containerId,Name:'/aa-pg-'+run,Image:image.Id,State:{Running:true,StartedAt:'controlled-start'},
   Config:{Image:PIN.image,Labels:labels,Entrypoint:['docker-entrypoint.sh'],Cmd:['postgres'],Env:['POSTGRES_DB=aa_pg_'+run,'POSTGRES_USER=oracle','POSTGRES_PASSWORD='+'c'.repeat(64),'PG_VERSION='+PIN.postgresVersion,'PGDATA=/var/lib/postgresql/data']},
   HostConfig:{Memory:PIN.memoryBytes,MemorySwap:PIN.memoryBytes,NanoCpus:2e9,Privileged:false,PublishAllPorts:false,Binds:null,RestartPolicy:{Name:'no'}},
   Mounts:[{Type:'volume',Name:receipt.volumeName,Destination:'/var/lib/postgresql/data',RW:true}],
   NetworkSettings:{Networks:{owned:{NetworkID:receipt.networkId}},Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'35432'}]}}}};
 return{receipt,observed};
}

test('owned fixture derives connection only from exact observed root receipt; no URL input',()=>{
 const {receipt,observed}=fixture(),value=verifyObservedFixture(receipt,observed);
 assert.equal(value.host,'127.0.0.1');assert.equal(value.port,35432);assert.equal(value.database,'aa_pg_'+run);
 assert.equal(value.ownership.image,PIN.image);
 assert.throws(()=>validateReceipt({...receipt,daemonId:PIN.forbiddenH1GlobalDaemonId}));
 assert.throws(()=>validateReceipt({...receipt,url:'postgres://production'}));assert.throws(()=>parseArgs(['--url','postgres://production']));
});
test('foreign identity, mutable image, public port, resources and bind-like volumes refuse',()=>{
 for(const mutate of [v=>v.daemon.ID='foreign',v=>v.socket.ino=9,v=>v.container.Config.Image='postgres:16-alpine',
  v=>v.image.Id='foreign',v=>v.container.Config.Labels={},v=>v.container.HostConfig.Memory=2e9,
  v=>v.container.NetworkSettings.Ports['5432/tcp'][0].HostIp='0.0.0.0',v=>v.volume.Options={device:'/foreign'},
  v=>v.network.Internal=false,v=>v.container.Config.Cmd=['sh'],v=>v.container.Mounts[0].Name='foreign']){
  const f=fixture();f.observed=structuredClone(f.observed);mutate(f.observed);assert.throws(()=>verifyObservedFixture(f.receipt,f.observed));
 }
});
test('actual empty-DB gate issues only SELECT and rejects any pre-existing application object',async()=>{
 const sql=[];const db={async query(text){sql.push(text);return{rows:sql.length===1?[{database:'aa_pg_'+run,username:'oracle',version:'160015',version_text:'controlled16.15'}]:[]};}};
 const proof=await admitEmptyDatabase(db,'aa_pg_'+run);assert.equal(proof.emptyObjects,true);assert.ok(sql.every(text=>/^SELECT/.test(text)));
 let calls=0;await assert.rejects(admitEmptyDatabase({async query(){return{rows:++calls===1?[{database:'aa_pg_'+run,username:'oracle',version:'160015'}]:[{existing:'object'}]};}},'aa_pg_'+run));
});
test('observer preserves native promise return, callback completion, receiver and error identity',async()=>{
 const rows=[],failure=Object.assign(new Error('controlled'),{code:'CONTROL'}),client={query(sql,...args){
  assert.equal(this,client);const callback=args.find(value=>typeof value==='function');
  if(callback){callback(sql==='FAIL'?failure:null,{rows:[],rowCount:0});return 'original-return';}
  return sql==='FAIL'?Promise.reject(failure):Promise.resolve({rows:[],rowCount:0});
 }};
 observe(client,row=>rows.push(row),'control');assert.equal((await client.query('SELECT 1')).rowCount,0);
 let completed=false;assert.equal(client.query('SELECT 2',[],error=>{assert.equal(error,null);completed=true;}),'original-return');assert.equal(completed,true);
 await assert.rejects(client.query('FAIL'),error=>error===failure);assert.equal(rows.at(-1).error.code,'CONTROL');
});
test('installed original pg-pool callback transport completes and releases without any socket',async()=>{
 const root=process.env.AA_REFERENCE_ROOT;assert.ok(root);const from=createRequire(join(root,'package.json')),{Pool}=from('pg');
 const pool=new Pool(),client=new EventEmitter(),events=[];let released=0;
 client.release=()=>released++;client.query=(sql,values,callback)=>{callback(null,{rows:[],rowCount:0});};
 observe(client,row=>events.push(row),'controlled-pool-transport');pool.connect=callback=>callback(null,client);
 const result=await pool.query('SELECT controlled_transport',[]);assert.deepEqual(result.rows,[]);assert.equal(released,1);assert.deepEqual(events[0].rowCounts,[0]);
 await pool.end();
});
test('actual codec-boundary inputs distinguish NUL from literal escape before any PostgreSQL call',()=>{
 const values=cases({});assert.equal(values[1][1].text.charCodeAt(1),0);assert.equal(values[2][1].text,'a\\u0000b');
 assert.equal(values[2][1].text.includes('\u0000'),false);
 const raw=readFileSync(new URL('../harness/atomicassets/postgres/fixture-pin.json',import.meta.url),'utf8');
 assert.match(JSON.parse(raw).image,/@sha256:[a-f0-9]{64}$/);assert.equal(JSON.parse(raw).engineExecuted,false);
});

test('original loader/handler/migration/HTTP modules work from isolated SQL CWD without engine or socket',()=>{
 const root=process.env.AA_REFERENCE_ROOT;assert.ok(root);const owned=mkdtempSync(join(tmpdir(),'aa-pg-source-control-'));
 try{
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/asset-postgres-source.cjs',import.meta.url)),root],
   {cwd:owned,env:{...process.env,NODE_ENV:'production',LOG_LEVEL:'error'},stdio:['pipe','pipe','pipe','pipe'],timeout:60000,maxBuffer:2*1024**2,windowsHide:true});
  assert.ifError(child.error);assert.equal(child.status,0,child.stderr?.toString());assert.ok(child.output[3]?.length,child.stderr?.toString()+'\n'+child.stdout?.toString());const proof=JSON.parse(child.output[3]);
  assert.equal(proof.postgresExecuted,false);assert.equal(proof.serverStarted,false);assert.equal(proof.sourceRecords,206);assert.equal(proof.definitionFiles,176);
  assert.equal(proof.codecBoundary.literalInvalidJson,true);assert.ok(proof.queryCalls>100);
  if(process.env.AA_PG_SOURCE_EVIDENCE_DIRECTORY)writeFileSync(join(process.env.AA_PG_SOURCE_EVIDENCE_DIRECTORY,'source-control.json'),child.output[3],{flag:'wx'});
 }finally{
  assert.equal(dirname(realpathSync(owned)),realpathSync(tmpdir()));assert.ok(resolve(owned).includes('aa-pg-source-control-'));
  rmSync(owned,{recursive:true});
 }
});
