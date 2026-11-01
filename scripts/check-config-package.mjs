// Normal build/pack/install/test commands only. No timeout, signal, kill, controller or DB operations.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,copyFile,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {dirname,delimiter,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),name='@eosrio/hyperion-atomicassets-plugin';
const npmCli=process.env.npm_execpath;assert.ok(npmCli,'Run this package control through npm');
await mkdir(join(root,'out'),{recursive:true});
const evidence=await mkdtemp(join(root,'out','config-packed-')),consumer=join(evidence,'consumer');await mkdir(consumer);
const commands=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const env={...process.env,PATH:dirname(process.execPath)+delimiter+process.env.PATH};delete env.NODE_OPTIONS;delete env.NODE_PATH;
async function run(label,args,cwd,extra={}){
 const startedAt=new Date().toISOString();
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',value=>{stdout+=value;});child.stderr.on('data',value=>{stderr+=value;});
  child.once('error',reject);child.once('close',status=>resolve({status,stdout,stderr}));
 });
 const {stdout,stderr}=result;
 await writeFile(join(evidence,label+'.stdout'),stdout);await writeFile(join(evidence,label+'.stderr'),stderr);
 commands.push({label,argv:[process.execPath,...args],cwd,startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,
  stdoutSha256:sha(stdout),stderrSha256:sha(stderr)});
 assert.equal(result.status,0,label+'\n'+stdout+'\n'+stderr);return stdout;
}
try{
 const packResult=JSON.parse(await run('pack',[npmCli,'pack','--json','--pack-destination',evidence],root));
 const packages=Array.isArray(packResult)?packResult:Object.values(packResult);assert.equal(packages.length,1);
 const packed=packages[0];assert.equal(packed.name,name);
 const paths=new Set(packed.files.map(file=>file.path));
 for(const path of ['dist/atomicassets/internal/config.js','dist/atomicassets/internal/config.d.ts','dist/http/id-routes.js','docs/parity/atomicassets/config.md'])assert.ok(paths.has(path),path);
 const tarball=join(evidence,packed.filename);
 await writeFile(join(consumer,'package.json'),JSON.stringify({name:'atomic-config-packed-control',private:true,type:'module',
  dependencies:{[name]:'file:'+tarball},devDependencies:{typescript:'7.0.2',fastify:'5.12.7','@types/node':'25.5.0'},
  allowScripts:{'github:eosrio/hyperion-sdk#429a1bf1d3bddb746fa662de9529480890b7368f':true}},null,2)+'\n');
 await run('install',[npmCli,'install','--allow-git=all','--no-audit','--no-fund'],consumer);
 const installed=join(consumer,'node_modules',name);
 const installedManifest=JSON.parse(await readFile(join(installed,'package.json'),'utf8'));
 assert.equal(installedManifest.private,true);assert.equal(installedManifest.dependencies['@eosrio/hyperion-sdk'],'git+https://github.com/eosrio/hyperion-sdk.git#429a1bf1d3bddb746fa662de9529480890b7368f');
 const files={};for(const path of [...paths].sort()){const packedBytes=await readFile(join(installed,path));assert.equal(sha(packedBytes),sha(await readFile(join(root,path))),path);files[path]=sha(packedBytes);}
 await mkdir(join(consumer,'tests','fixtures'),{recursive:true});
 for(const path of ['config-component.test.mjs','fixtures/config-component.mjs','fixtures/config-original.mjs','fixtures/complete-kind-adapter.mjs'])
  await copyFile(join(root,'tests',path),join(consumer,'tests',path));
 await cp(join(root,'tests/fixtures/config-original-2.7'),join(consumer,'tests/fixtures/config-original-2.7'),{recursive:true});
 await copyFile(join(root,'tests/fixtures/config-consumer.mts'),join(consumer,'consumer.mts'));
 await writeFile(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{noEmit:true,strict:true,target:'ES2022',module:'NodeNext'},files:['consumer.mts']},null,2)+'\n');
 await run('declarations',[join(consumer,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],consumer);
 await run('installed-config-controls',['--test','tests/config-component.test.mjs'],consumer,{ATOMIC_CONFIG_DIST_ROOT:join(installed,'dist')});
 const receipt={node:process.version,evidence,installedFromTarball:true,tarball:{path:tarball,sha256:sha(await readFile(tarball)),integrity:packed.integrity},
  packedFiles:files,commands,scope:'Installed finite config source/candidate/SDK/route component controls only; no physical PostgreSQL/MongoDB, native HTTP listener, cache or release qualification'};
 await writeFile(join(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({node:process.version,evidence,packedFiles:Object.keys(files).length,installedConfigControls:23,declarations:'passed'}));
}catch(error){await writeFile(join(evidence,'failed.json'),JSON.stringify({node:process.version,error:String(error.stack??error),commands},null,2)+'\n');throw error;}
