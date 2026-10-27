import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PIN, verifyImageIdentity, verifyImageDescriptor} from './image-identity.mjs';
export {PIN};
export const LABEL = 'atomicassets-original-postgres';

export function validateReceipt(receipt) {
  assert.deepEqual(Object.keys(receipt).sort(), ['containerId','daemonId','networkId','run','schemaVersion','socketDev','socketIno','volumeName']);
  assert.equal(receipt.schemaVersion, 1); assert.match(receipt.run, /^[a-f0-9]{32}$/);
  assert.match(receipt.containerId, /^[a-f0-9]{64}$/); assert.match(receipt.networkId, /^[a-f0-9]{64}$/);
  assert.match(receipt.daemonId, /^[a-zA-Z0-9:-]{16,128}$/);
  assert.notEqual(receipt.daemonId, PIN.forbiddenH1GlobalDaemonId, 'H1 global Docker is excluded; use the owned private namespace');
  assert.ok(Number.isSafeInteger(receipt.socketDev) && receipt.socketDev >= 0);
  assert.ok(Number.isSafeInteger(receipt.socketIno) && receipt.socketIno > 0);
  assert.equal(receipt.volumeName, 'aa_pg_' + receipt.run);
  return receipt;
}

export function verifyObservedFixture(receipt, observed) {
  validateReceipt(receipt);
  assert.equal(observed.daemon.ID, receipt.daemonId);
  assert.equal(observed.socket.dev, receipt.socketDev); assert.equal(observed.socket.ino, receipt.socketIno);
  const labels = value => {
    assert.equal(value['io.eosrio.qualifier'], LABEL); assert.equal(value['io.eosrio.run'], receipt.run);
  };
  const container = observed.container; labels(container.Config.Labels); labels(observed.volume.Labels); labels(observed.network.Labels);
  assert.equal(container.Id, receipt.containerId); assert.equal(container.Name, '/aa-pg-' + receipt.run);
  assert.equal(container.State.Running, true); assert.equal(container.Config.Image, PIN.image);
  verifyImageIdentity(observed.image); assert.equal(container.Image, observed.image.Id);
  if (container.ImageManifestDescriptor !== undefined && container.ImageManifestDescriptor !== null) verifyImageDescriptor(container.ImageManifestDescriptor);
  assert.equal(container.HostConfig.Memory, PIN.memoryBytes); assert.equal(container.HostConfig.MemorySwap, PIN.memoryBytes);
  assert.equal(container.HostConfig.NanoCpus, PIN.cpuCount * 1e9); assert.equal(container.HostConfig.Privileged, false);
  assert.equal(container.HostConfig.PublishAllPorts, false); assert.ok(!container.HostConfig.Binds?.length);
  assert.equal(observed.volume.Name, receipt.volumeName); assert.equal(observed.volume.Driver, 'local');
  assert.ok(!observed.volume.Options || Object.keys(observed.volume.Options).length === 0);
  assert.equal(observed.network.Name, 'aa-pg-' + receipt.run);
  assert.equal(observed.network.Driver, 'bridge'); assert.equal(observed.network.Internal, false);
  assert.deepEqual(observed.network.Options, {'com.docker.network.bridge.enable_ip_masquerade': 'false'});
  assert.equal(container.HostConfig.RestartPolicy.Name, 'no');
  assert.deepEqual(container.Config.Entrypoint, observed.image.Config.Entrypoint); assert.deepEqual(container.Config.Cmd, ['postgres']);
  assert.equal(container.Mounts.length, 1); assert.equal(container.Mounts[0].Type, 'volume');
  assert.equal(container.Mounts[0].Name, receipt.volumeName); assert.equal(container.Mounts[0].Destination, '/var/lib/postgresql/data');
  assert.equal(container.Mounts[0].RW, true); assert.equal(observed.network.Id, receipt.networkId);
  const networks = Object.values(container.NetworkSettings.Networks); assert.equal(networks.length, 1);
  assert.equal(networks[0].NetworkID, receipt.networkId);
  const ports = container.NetworkSettings.Ports; assert.deepEqual(Object.keys(ports), ['5432/tcp']);
  assert.ok(Array.isArray(ports['5432/tcp']), 'Owned PostgreSQL port must be published');
  assert.equal(ports['5432/tcp'].length, 1); const published = ports['5432/tcp'][0];
  assert.equal(published.HostIp, '127.0.0.1'); assert.match(published.HostPort, /^[0-9]{1,5}$/);
  const port = Number(published.HostPort); assert.ok(port > 0 && port <= 65535);
  const env = Object.fromEntries(container.Config.Env.map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
  const database = 'aa_pg_' + receipt.run;
  assert.equal(env.POSTGRES_DB, database); assert.equal(env.POSTGRES_USER, 'oracle');
  assert.ok(typeof env.POSTGRES_PASSWORD === 'string' && /^[a-f0-9]{64}$/.test(env.POSTGRES_PASSWORD), 'Owned credential shape differs'); assert.equal(env.POSTGRES_HOST_AUTH_METHOD, undefined);
  assert.equal(env.PG_VERSION, PIN.postgresVersion); assert.equal(env.PGDATA, '/var/lib/postgresql/data');
  assert.equal(env.POSTGRES_INITDB_ARGS, undefined);
  // Password is private transport only. Never merge this object into a public result or log.
  return {host: '127.0.0.1', port, user: 'oracle', password: env.POSTGRES_PASSWORD, database,
    ownership: {run: receipt.run, containerId: receipt.containerId, networkId: receipt.networkId,
      volumeName: receipt.volumeName, daemonId: receipt.daemonId, dockerSocketPath: PIN.dockerSocketPath, privateNamespaceRequired: true, image: PIN.image, startedAt: container.State.StartedAt}};
}

export function observeFixture(receipt) {
  validateReceipt(receipt); assert.equal(process.platform, 'linux', 'Future root-only engine run requires native Linux');
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('DOCKER_')) delete env[key];
  const docker = (...args) => {
    let text;
    try {text = execFileSync('docker', ['--host', 'unix://' + PIN.dockerSocketPath, ...args],
      {env, timeout: 20000, maxBuffer: 2 * 1024**2, encoding: 'utf8'});}
    catch {throw new Error('Owned Docker inspection failed; raw inspect output may contain credentials and is not logged');}
    try {return JSON.parse(text);} catch {throw new Error('Invalid bounded Docker inspection JSON');}
  };
  const socket = statSync(PIN.dockerSocketPath);
  return {daemon: docker('info', '--format', '{{json .}}'), socket: {dev: socket.dev, ino: socket.ino},
    container: docker('inspect', '--type', 'container', receipt.containerId)[0],
    image: docker('image', 'inspect', PIN.image)[0], volume: docker('volume', 'inspect', receipt.volumeName)[0],
    network: docker('network', 'inspect', receipt.networkId)[0]};
}

export async function admitEmptyDatabase(database, expectedName) {
  assert.match(expectedName, /^aa_pg_[a-f0-9]{32}$/);
  const info = (await database.query(`SELECT current_database() AS database, current_user AS username,
    current_setting('server_version_num') AS version, current_setting('server_version') AS version_text`)).rows[0];
  assert.equal(info.database, expectedName); assert.equal(info.username, 'oracle'); assert.equal(info.version, '160015');
  const objects = await database.query(`SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
  const schemas = await database.query(`SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')`);
  const extensions = await database.query(`SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'`);
  const others = await database.query("SELECT datname FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres',$1)", [expectedName]);
  assert.deepEqual(objects.rows, []); assert.deepEqual(schemas.rows, []); assert.deepEqual(extensions.rows, []); assert.deepEqual(others.rows, []);
  return {database: info.database, user: info.username, version: info.version_text, emptyObjects: true, emptyCustomSchemas: true, noExtraExtensions: true};
}
