// Screened asynchronous pack/install/build/test waits; no timer, termination or legacy controller.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,copyFile,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {dirname,delimiter,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),name='@eosrio/hyperion-atomicassets-plugin',npmCli=process.env.npm_execpath;
assert.ok(npmCli,'Run through npm');await mkdir(join(root,'out'),{recursive:true});
const evidence=await mkdtemp(join(root,'out','schema-packed-')),consumer=join(evidence,'consumer');await mkdir(consumer);
const commands=[],sha=raw=>createHash('sha256').update(raw).digest('hex'),env={...process.env,PATH:dirname(process.execPath)+delimiter+process.env.PATH};delete env.NODE_OPTIONS;delete env.NODE_PATH;
async function run(label,args,cwd,extra={}) {
 const argv=[process.execPath,...args],startedAt=new Date().toISOString();
 await writeFile(join(evidence,label+'.intent.json'),JSON.stringify({argv,cwd,startedAt},null,2)+'\n');
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',value=>{stdout+=value;});child.stderr.on('data',value=>{stderr+=value;});
  child.once('error',reject);child.once('close',(status,signal)=>resolve({status,signal,stdout,stderr}));
 });
 await writeFile(join(evidence,label+'.stdout'),result.stdout);await writeFile(join(evidence,label+'.stderr'),result.stderr);
 const row={label,argv,cwd,startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,normalCloseReturned:true,
  stdout:{bytes:Buffer.byteLength(result.stdout),sha256:sha(result.stdout)},stderr:{bytes:Buffer.byteLength(result.stderr),sha256:sha(result.stderr)}};
 commands.push(row);await writeFile(join(evidence,label+'.receipt.json'),JSON.stringify(row,null,2)+'\n');
 assert.equal(result.status,0,label+'\n'+result.stdout+'\n'+result.stderr);assert.equal(result.signal,null);return result.stdout;
}
try {
 const npmVersion=(await run('npm-version',[npmCli,'--version'],root)).trim();
 const result=JSON.parse(await run('pack',[npmCli,'pack','--json','--pack-destination',evidence],root));
 const packages=Array.isArray(result)?result:Object.values(result);assert.equal(packages.length,1);const packed=packages[0];assert.equal(packed.name,name);
 const paths=new Set(packed.files.map(file=>file.path));for(const path of ['dist/stateful/schema-indexed.js','dist/http/schema-list-routes.js',
  'dist/atomicassets/internal/schema-list-parameters.js','dist/stateful/plugin.d.ts','docs/parity/atomicassets/schema-indexed.md','docs/parity/atomicassets/schema-indexed-ledger.json'])assert.ok(paths.has(path),path);
 const tarball=join(evidence,packed.filename);
 await writeFile(join(consumer,'package.json'),JSON.stringify({name:'atomic-schema-indexed-packed-control',private:true,type:'module',dependencies:{[name]:'file:'+tarball},
  devDependencies:{typescript:'7.0.2',fastify:'5.12.7','@types/node':'25.5.0'},allowScripts:{'github:eosrio/hyperion-sdk#dc20a03f2b60ba05a3369d677222a9cf0d65d299':true}},null,2)+'\n');
 await run('install',[npmCli,'install','--allow-git=all','--ignore-scripts=false','--no-audit','--no-fund','--cache',join(evidence,'npm-cache')],consumer);
 const installed=join(consumer,'node_modules',name),metadata=JSON.parse(await readFile(join(installed,'package.json')));
 assert.equal(metadata.private,true);
 assert.equal(metadata.dependencies['@eosrio/hyperion-sdk'],'git+https://github.com/eosrio/hyperion-sdk.git#dc20a03f2b60ba05a3369d677222a9cf0d65d299');
 const files={};for(const path of [...paths].sort()){const raw=await readFile(join(installed,path));assert.equal(sha(raw),sha(await readFile(join(root,path))),path);files[path]={bytes:raw.length,sha256:sha(raw)};}
 await mkdir(join(consumer,'tests/fixtures'),{recursive:true});
 const copied=['schema-indexed-consumer.test.mjs','fixtures/schema-indexed-component.mjs','fixtures/schema-list-original.mjs','fixtures/complete-kind-adapter.mjs'];
 for(const path of copied)await copyFile(join(root,'tests',path),join(consumer,'tests',path));
 await cp(join(root,'tests/fixtures/schema-list-original-2.7'),join(consumer,'tests/fixtures/schema-list-original-2.7'),{recursive:true});
 const manifest=JSON.parse(await readFile(join(root,'tests/fixtures/schema-list-original-2.7/manifest.json')));
 copied.push(...Object.keys(manifest.sources).map(path=>'fixtures/schema-list-original-2.7/'+path),'fixtures/schema-list-original-2.7/manifest.json','fixtures/schema-list-original-2.7/.gitattributes');
 const controlInputs={};for(const path of copied){const raw=await readFile(join(consumer,'tests',path));assert.equal(sha(raw),sha(await readFile(join(root,'tests',path))));controlInputs['tests/'+path]={bytes:raw.length,sha256:sha(raw)};}
 await copyFile(join(root,'tests/fixtures/schema-indexed-consumer.mts'),join(consumer,'consumer.mts'));
 const declaration=await readFile(join(consumer,'consumer.mts'));assert.equal(sha(declaration),sha(await readFile(join(root,'tests/fixtures/schema-indexed-consumer.mts'))));
 controlInputs['tests/fixtures/schema-indexed-consumer.mts']={bytes:declaration.length,sha256:sha(declaration)};
 await writeFile(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{noEmit:true,strict:true,target:'ES2022',module:'NodeNext'},files:['consumer.mts']},null,2)+'\n');
 await run('declarations',[join(consumer,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],consumer);
 await run('installed-controls',['--test','tests/schema-indexed-consumer.test.mjs'],consumer,{ATOMIC_SCHEMA_DIST_ROOT:join(installed,'dist'),ATOMIC_SCHEMA_PACKAGE_ROOT:installed});
 const compilerVersion=JSON.parse(await readFile(join(consumer,'node_modules/typescript/package.json'))).version;assert.equal(compilerVersion,'7.0.2');
 const receipt={node:process.version,nodeExecutable:process.execPath,nodeSha256:sha(await readFile(process.execPath)),npmCli,npmVersion,compilerVersion,evidence,
  tarball:{path:tarball,sha256:sha(await readFile(tarball)),integrity:packed.integrity},packedFiles:files,controlInputs,commands,
  scope:'Installed original-function/SDK/Fastify/scripted-native controls only; not engine, HAPI host, source coverage or API parity qualification'};
 await writeFile(join(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({node:process.version,npmVersion,evidence,packedFiles:paths.size,installedControls:'passed',declarations:'passed'}));
}catch(error){await writeFile(join(evidence,'failed.json'),JSON.stringify({node:process.version,error:String(error.stack??error),commands},null,2)+'\n');throw error;}
