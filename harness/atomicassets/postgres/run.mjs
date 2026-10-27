import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {originalSource,copyDefinitions,sha} from './source.mjs';
import {PIN,validateReceipt,verifyObservedFixture,observeFixture} from './admission.mjs';
export function parseArgs(args){
 assert.ok(args.length===7 && args[0]==='--execute' && args[1]==='--admission' && args[3]==='--reference-root' && args[5]==='--evidence-parent',
  'Usage: --execute --admission RECEIPT --reference-root ORIGINAL --evidence-parent OWNED_DIRECTORY');
 return{receipt:args[2],referenceRoot:args[4],evidenceParent:args[6]};
}
export function execute(args){
 assert.equal(process.release.name,'node');assert.ok([24,26].includes(Number(process.versions.node.split('.')[0])));assert.equal(process.versions.bun,undefined);
 const options=parseArgs(args),input=readFileSync(options.receipt);assert.ok(input.length<=4096);
 const receipt=validateReceipt(JSON.parse(input));
 // Admission reads only the fixed local Docker socket; no create/drop/pull/stop/remove operation exists here.
 verifyObservedFixture(receipt,observeFixture(receipt));
 const reference=originalSource(options.referenceRoot),parent=realpathSync(options.evidenceParent);
 const directory=join(parent,'aa-pg-'+receipt.run);mkdirSync(directory);mkdirSync(join(directory,'logs'));
 copyDefinitions(reference,directory);
 const env={...process.env,NODE_ENV:'production',LOG_LEVEL:'error',PGSSLMODE:'disable',PG_POOL_MAX:'4',SWC_NODE_PROJECT:join(reference.root,'tsconfig.json'),SWC_NODE_CACHE_DIR:join(directory,'swc-cache')};
 for(const key of Object.keys(env))if(key.startsWith('POSTGRES_TEST_')||key.startsWith('REDIS_TEST_')||key.startsWith('PG')&&!['PGSSLMODE','PG_POOL_MAX'].includes(key)||['NODE_OPTIONS','NODE_PATH','TS_NODE_PROJECT'].includes(key))delete env[key];
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./child.cjs',import.meta.url))],{cwd:directory,env,detached:true,windowsHide:true,
  input:JSON.stringify({receipt,referenceRoot:reference.root,parentPid:process.pid}),stdio:['pipe','pipe','pipe','pipe'],timeout:PIN.childDeadlineMS,
  killSignal:'SIGKILL',maxBuffer:PIN.reportBytes});
 const stdout=child.stdout??Buffer.alloc(0),stderr=child.stderr??Buffer.alloc(0),data=child.output?.[3]??Buffer.alloc(0);
 writeFileSync(join(directory,'stdout'),stdout,{flag:'wx'});writeFileSync(join(directory,'stderr'),stderr,{flag:'wx'});writeFileSync(join(directory,'report.json'),data,{flag:'wx'});
 let absent=false,groupAbsent=false;
 if(child.pid){try{process.kill(child.pid,0);}catch(error){if(error.code==='ESRCH')absent=true;else throw error;}
  try{process.kill(-child.pid,0);}catch(error){if(error.code==='ESRCH')groupAbsent=true;else throw error;}}
 const terminal={node:process.version,pid:child.pid??null,exitCode:child.status,signal:child.signal,error:child.error?.code??null,
  pidAbsent:absent,groupAbsent,reaped:Boolean(child.pid)&&(child.status!==null||child.signal!==null),reportBytes:data.length,reportSha256:sha(data),stdoutBytes:stdout.length,stderrBytes:stderr.length,
  fixtureCleanupRequiredFromRoot:true,qualified:false};
 writeFileSync(join(directory,'terminal.json'),JSON.stringify(terminal,null,2)+'\n',{flag:'wx'});
 assert.ok(stdout.length+stderr.length<=256*1024,'Original PG log budget');
 assert.ok(!child.error&&child.status===0&&child.signal===null&&absent&&groupAbsent,'Owned original PG child did not complete; preserve all evidence');
 const result=JSON.parse(data);assert.equal(result.status,'passed');assert.equal(result.identity.pid,child.pid);assert.equal(result.identity.parentPid,process.pid);
 verifyObservedFixture(receipt,observeFixture(receipt));
 for(const row of reference.definitions)assert.equal(sha(readFileSync(join(directory,row.path))),row.workingSha256);
 return{directory,terminal,scope:'Original PostgreSQL only; external fixture cleanup and qualification pending root'};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{console.log(JSON.stringify(execute(process.argv.slice(2))));}catch(error){console.error(error);process.exitCode=1;}}
