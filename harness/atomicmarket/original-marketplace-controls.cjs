'use strict';
// Original processor/transaction methods, with an explicitly scripted SQL boundary; no PostgreSQL engine.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');

module.exports = async function marketplaceControls(fromReference, root, input) {
  assert.equal(input.contract, 'atomicmarket');
  assert.ok(Array.isArray(input.blocks) && input.blocks.length > 0 && input.blocks.length <= 8);
  const sources = [];
  for (const path of ['src/filler/processor.ts', 'src/filler/database.ts', 'src/utils/eosio.ts',
    'src/filler/handlers/atomicmarket/processors/marketplaces.ts', 'src/api/namespaces/atomicmarket/handlers/marketplaces.ts']) {
    const original = execFileSync('git', ['show', '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e:' + path],
      {cwd: root, timeout: 10_000, maxBuffer: 2 * 1024 * 1024});
    const actual = readFileSync(join(root, path));
    assert.equal(actual.toString().replaceAll('\r\n', '\n'), original.toString());
    sources.push({path, gitSha256: createHash('sha256').update(original).digest('hex'),
      workingSha256: createHash('sha256').update(actual).digest('hex')});
  }
  const {default: DataProcessor, ProcessingState} = fromReference('./src/filler/processor.ts');
  const {marketplaceProcessor} = fromReference('./src/filler/handlers/atomicmarket/processors/marketplaces.ts');
  const {ContractDBTransaction} = fromReference('./src/filler/database.ts');
  const processor = new DataProcessor(ProcessingState.HEAD, {checkTrace: () => true, checkDelta: () => true});
  const release = marketplaceProcessor({args: {atomicmarket_account: input.contract}}, processor);
  const listeners = processor.getActiveListeners();
  assert.equal(listeners.table_listeners.length, 1); assert.equal(listeners.trace_listeners.length, 0);
  const calls = [], snapshots = [], records = new Map();
  const db = {async replace(table, candidate, keys, preserve) {
    assert.equal(table, 'atomicmarket_marketplaces');
    assert.deepEqual(keys, ['market_contract', 'marketplace_name']);
    assert.deepEqual(preserve, ['created_at_block', 'created_at_time']);
    const old = records.get(candidate.marketplace_name), value = structuredClone(candidate);
    if (old) for (const field of preserve) value[field] = old[field];
    records.set(candidate.marketplace_name, value);
    assert.ok(calls.length < 32); calls.push({table, candidate: structuredClone(candidate), keys, preserve});
  }};
  let error = null;
  try {
    for (const entry of input.blocks) {
      assert.ok(Number.isSafeInteger(entry.block.block_num)); assert.ok(typeof entry.block.timestamp === 'string');
      assert.ok(Array.isArray(entry.rows) && entry.rows.length <= 4);
      for (const row of entry.rows) processor.processContractRow(entry.block, {code: input.contract, scope: '',
        table: 'marketplaces', present: row.present, value: row.value});
      await processor.executeHeadQueue(db);
      snapshots.push({blockNum: entry.block.block_num, rows: structuredClone([...records.values()])});
    }
  } catch (failure) {error = {name: failure.name, message: failure.message};}
  finally {release();}
  assert.equal(processor.getActiveListeners().table_listeners.length, 0);
  // Independently execute the actual original replace SQL generator for the first update.
  const first = calls[0], update = calls[1], sql = [];
  if (first && update) {
    const script = [
      ['BEGIN', [], []], ['SET LOCAL synchronous_commit = off', [], []], ['SET CONSTRAINTS ALL DEFERRED', [], []],
      ['SET LOCAL statement_timeout = 300000', [], []],
      ['SELECT * FROM "atomicmarket_marketplaces" WHERE "market_contract" = $1 AND "marketplace_name" = $2 LIMIT 1;',
        [input.contract, first.candidate.marketplace_name], [first.candidate]],
      ['UPDATE "atomicmarket_marketplaces" SET "creator" = $1 WHERE "market_contract" = $2 AND "marketplace_name" = $3 RETURNING "market_contract", "marketplace_name" ',
        [update.candidate.creator, input.contract, update.candidate.marketplace_name],
        [{market_contract: input.contract, marketplace_name: update.candidate.marketplace_name}]],
      ['ROLLBACK', [], []],
    ];
    let releases = 0;
    const transaction = new ContractDBTransaction({escapeIdentifier: value => '"' + value + '"', release() {releases++;},
      async query(query, parameters = []) {
        const expected = script.shift(); assert.ok(expected, 'Unexpected original transaction SQL');
        assert.equal(query, expected[0]); assert.deepEqual(parameters, expected[1]);
        sql.push({query, parameters}); return {rowCount: expected[2].length, rows: structuredClone(expected[2])};
      }}, 'marketplace-original-controls', {operations: 0});
    await transaction.replace(update.table, update.candidate, update.keys, update.preserve);
    await transaction.abort(); assert.equal(script.length, 0); assert.equal(releases, 1);
  }
  return {nodeVersion: process.version, scope: {originalDataProcessor: true, originalMarketplaceProcessor: true,
    originalReplaceSqlGenerator: sql.length > 0, scriptedDatabaseBoundary: true, postgresExecution: false,
    mongoExecution: false, chainCapture: false, hyperionHostActivation: false}, sources, calls, snapshots, error, sql,
    finalRows: structuredClone([...records.values()]), listenersReleased: true};
};
