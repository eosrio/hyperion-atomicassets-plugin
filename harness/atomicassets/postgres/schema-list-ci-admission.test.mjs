import test from 'node:test';
import assert from 'node:assert/strict';
import {CI,admitService,admitCiDatabase,inspectCiDatabase} from './schema-list-ci-admission.mjs';
import {PIN} from './image-identity.mjs';
import {HARNESS_FILES,captureHarnessFiles} from './schema-list-ci-metadata.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const id='a'.repeat(64), image={Id:PIN.registryInspection.configDigest,Os:'linux',Architecture:'amd64',RepoDigests:[PIN.image],Config:{Entrypoint:['docker-entrypoint.sh']}};
const fixture=()=>({Id:id,Image:image.Id,Config:{Image:PIN.image,Entrypoint:['docker-entrypoint.sh'],Cmd:['postgres'],Env:['PG_VERSION='+PIN.postgresVersion,`POSTGRES_DB=${CI.database}`,`POSTGRES_USER=${CI.user}`,`POSTGRES_PASSWORD=${CI.password}`]},State:{Running:true},HostConfig:{Privileged:false,NanoCpus:2e9,Memory:PIN.memoryBytes,MemorySwap:PIN.memoryBytes,PublishAllPorts:false,Binds:[],RestartPolicy:{Name:'no'}},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'5432'}]}}});
const empty=()=>({info:{database:CI.database,username:CI.user,version:'160015',version_text:'16.15'},objects:[],schemas:[],extensions:[],others:[]});
test('bounded service descriptor accepts exact fixture and refuses changed identities, limits, ports or credentials',()=>{
 assert.equal(admitService(fixture(),image,id).database,CI.database);
 for(const change of [
 c=>c.Config.Image='postgres:latest', c=>c.Image='sha256:'+ '0'.repeat(64), c=>c.HostConfig.NanoCpus=1e9,
 c=>c.HostConfig.Memory=1, c=>c.HostConfig.MemorySwap=-1, c=>c.HostConfig.Privileged=true,
 c=>c.HostConfig.Binds=['/tmp:/tmp'], c=>c.NetworkSettings.Ports['5432/tcp'][0].HostIp='0.0.0.0',
 c=>c.NetworkSettings.Ports['5432/tcp'][0].HostPort='9999', c=>c.Config.Env[1]='POSTGRES_DB=other',
 c=>c.Config.Env[2]='POSTGRES_USER=other', c=>c.Config.Env[3]='POSTGRES_PASSWORD=other',
 c=>c.Config.Env.push('POSTGRES_HOST_AUTH_METHOD=trust')]) {const c=fixture();change(c);assert.throws(()=>admitService(c,image,id));}
 assert.throws(()=>admitService(fixture(),{...image,RepoDigests:['postgres:latest']},id));
});
test('CI empty database admission binds database, user, engine and every emptiness check',()=>{
 assert.equal(admitCiDatabase(empty()).emptyObjects,true);
 for(const change of [x=>x.info.database='other',x=>x.info.username='other',x=>x.info.version='160014',x=>x.objects.push({}),x=>x.schemas.push({}),x=>x.extensions.push({}),x=>x.others.push({})]){const x=empty();change(x);assert.throws(()=>admitCiDatabase(x));}
});
test('actual admission reads five catalog results then refuses before schema initialization',async()=>{
 const cases=empty();let i=0;const db={query:async()=>({rows:[ [cases.info],cases.objects,cases.schemas,cases.extensions,[{datname:'unexpected'}]][i++]})};
 await assert.rejects(inspectCiDatabase(db));assert.equal(i,5);
});
test('real harness metadata uses module directory regardless of current working directory',()=>{
 const previous=process.cwd();process.chdir(process.env.TEMP || process.env.TMP || '/tmp');
 try {const rows=captureHarnessFiles();assert.equal(rows.length,HARNESS_FILES.length);
  for(const row of rows){const data=readFileSync(new URL('./'+row.path,import.meta.url));assert.equal(row.bytes,data.length);assert.equal(row.sha256,createHash('sha256').update(data).digest('hex'));}
  assert.throws(()=>captureHarnessFiles(['missing-reference-file']));
 } finally {process.chdir(previous);}
});
