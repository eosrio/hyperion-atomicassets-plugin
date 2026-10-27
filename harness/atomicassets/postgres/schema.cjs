'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');
const {createHash} = require('node:crypto');
const HANDLERS = ['atomicassets','delphioracle','atomicmarket','atomicpacksx','atomicdropsx','simpleassets'];
const sha = value => createHash('sha256').update(value).digest('hex');

// Adapted from original2.7.0 init-test-db.ts (MIT; see harness/shared/NOTICE.atomicassets-api.txt).
// Its CLI, fallback config and database drop/create are never imported.
module.exports = async function initializeOriginalSchema(fromReference, connection, admission, record) {
  assert.equal(admission.emptyObjects, true); assert.equal(admission.emptyCustomSchemas, true); assert.equal(admission.noExtraExtensions, true);
  const {initBaseTables} = fromReference('./src/filler/upgrade-db.ts');
  const {handlers} = fromReference('./src/filler/handlers/loader.ts');
  const {compareVersionString} = fromReference('./src/utils/index.ts');
  const selected = HANDLERS.map(name => {const handler = handlers.find(value => value.handlerName === name); assert.ok(handler, name); return handler;});
  const sql = async (client, path, deferred = false) => {
    const source = fs.readFileSync(path, 'utf8'), actual = deferred ? source.replace(/\bCONCURRENTLY\b/gi, '') : source;
    record({kind: 'migration-file', path: path.replaceAll('\\','/'), sourceBytes: Buffer.byteLength(source), sourceSha256: sha(source),
      executedBytes: Buffer.byteLength(actual), executedSha256: sha(actual), concurrentlyRemoved: deferred});
    await client.query(actual);
  };
  const transaction = async callback => {
    const client = await connection.begin(); let committed = false;
    try {await callback(client); await client.query('COMMIT'); committed = true;}
    finally {try {if (!committed) await client.query('ROLLBACK');} finally {client.release();}}
  };
  await initBaseTables(connection);
  await transaction(async client => {for (const handler of selected) {record({kind: 'setup-handler', handler: handler.handlerName}); await handler.setup(client);}});
  const versions = fs.readdirSync('./definitions/migrations').sort(compareVersionString);
  for (const version of versions) {
    assert.match(version, /^\d+\.\d+\.\d+$/); const directory = join('definitions/migrations', version);
    await transaction(async client => {
      const database = join(directory, 'database.sql'); if (fs.existsSync(database)) await sql(client, database);
      for (const handler of selected) {
        const path = join(directory, handler.handlerName + '.sql'); if (fs.existsSync(path)) await sql(client, path);
        record({kind: 'upgrade-handler', version, handler: handler.handlerName}); await handler.upgrade(client, version);
      }
    });
    for (const name of ['database', ...HANDLERS]) {
      const path = join(directory, name + '-deferred.sql'); if (fs.existsSync(path)) await sql(connection, path, true);
    }
  }
  return {setupHandlerOrder: HANDLERS, migrationVersions: versions, originalTestInitializationOrder: true,
    destructiveCliImported: false, productionMigrationRecoveryQualified: false};
};
