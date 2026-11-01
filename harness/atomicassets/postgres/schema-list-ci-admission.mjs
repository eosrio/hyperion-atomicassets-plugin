import assert from 'node:assert/strict';
import {PIN,verifyImageIdentity} from './image-identity.mjs';
export const CI=Object.freeze({database:'aa_ci_oracle',user:'oracle',password:'ci-only-disposable',port:5432});
// Inert admission logic: no Docker, filesystem, database, process, or network operations.
export function admitService(container,image,id) {
  assert.match(id,/^[a-f0-9]{64}$/); assert.equal(container.Id,id);
  const identity=verifyImageIdentity(image); assert.equal(container.Image,image.Id);
  assert.equal(container.Config.Image,PIN.image); assert.equal(container.State.Running,true);
  assert.equal(container.HostConfig.Privileged,false); assert.equal(container.HostConfig.NanoCpus,2e9);
  assert.equal(container.HostConfig.Memory,PIN.memoryBytes); assert.equal(container.HostConfig.MemorySwap,PIN.memoryBytes);
  assert.equal(container.HostConfig.PublishAllPorts,false); assert.ok(!container.HostConfig.Binds?.length);
  assert.equal(container.HostConfig.RestartPolicy.Name,'no');
  assert.deepEqual(container.Config.Entrypoint,image.Config.Entrypoint);assert.deepEqual(container.Config.Cmd,['postgres']);
  assert.ok(container.Config.Env.includes('PG_VERSION='+PIN.postgresVersion));
  assert.deepEqual(container.NetworkSettings.Ports,{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'5432'}]});
  const env=container.Config.Env;
  for (const entry of [`POSTGRES_DB=${CI.database}`,`POSTGRES_USER=${CI.user}`,`POSTGRES_PASSWORD=${CI.password}`]) assert.equal(env.filter(x=>x.startsWith(entry.split('=')[0]+'=')).join(),entry);
  assert.equal(env.some(x=>x.startsWith('POSTGRES_HOST_AUTH_METHOD=')||x.startsWith('POSTGRES_INITDB_ARGS=')),false);
  return {containerId:id,image:identity,port:CI.port,database:CI.database,user:CI.user};
}
export function admitCiDatabase({info,objects,schemas,extensions,others}) {
  assert.equal(info.database,CI.database); assert.equal(info.username,CI.user); assert.equal(info.version,'160015');
  for(const rows of [objects,schemas,extensions,others]) assert.deepEqual(rows,[]);
  return {database:info.database,user:info.username,version:info.version_text,emptyObjects:true,emptyCustomSchemas:true,noExtraExtensions:true};
}
export async function inspectCiDatabase(db) {
  const info=(await db.query(`SELECT current_database() AS database, current_user AS username, current_setting('server_version_num') AS version, current_setting('server_version') AS version_text`)).rows[0];
  const objects=(await db.query(`SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`)).rows;
  const schemas=(await db.query(`SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')`)).rows;
  const extensions=(await db.query(`SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'`)).rows;
  const others=(await db.query("SELECT datname FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres',$1)",[CI.database])).rows;
  return admitCiDatabase({info,objects,schemas,extensions,others});
}
