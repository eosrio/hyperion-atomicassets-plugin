import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {executeOriginalAssetControls} from '../harness/shared/reference.mjs';

const referenceRoot = process.env.AA_REFERENCE_ROOT;
assert.ok(referenceRoot, 'AA_REFERENCE_ROOT must identify the installed exact reference checkout');
const expected = JSON.parse(await readFile(new URL('../fixtures/harness/atomicassets/lifecycle/expected.json', import.meta.url)));
let execution;
const original = () => execution ??= executeOriginalAssetControls({referenceRoot});
const scenario = (result, name) => result.controls.cases.find(value => value.name === name);

test('actual original lifecycle processors and locked codec match their complete original capture', async () => {
  const result = await original();
  assert.deepEqual(result.controls, expected);
  assert.equal(result.reference.commit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  assert.equal(result.scope.originalDataProcessor, true);
  assert.equal(result.scope.originalProcessors, true);
  assert.equal(result.scope.lockedCodec, '@atomichub/atomicassets@2.2.0');
  assert.equal(result.scope.database, 'bounded-scripted-transaction-effects');
  for (const field of ['postgresExecution', 'mongoExecution', 'chainCapture', 'hyperionPluginExecution',
    'servingViewExecution', 'initializationReplayRollbackQualified', 'fullParity']) assert.equal(result.scope[field], false);
  for (const entry of result.controls.cases)
    assert.deepEqual(entry.activeListenersAfterRelease, {trace_listeners: [], table_listeners: []});
  for (const file of ['processor.ts', 'handlers/atomicassets/processors/assets.ts', 'handlers/atomicassets/processors/templates.ts'])
    assert.ok(result.loadedSource.some(entry => entry.path === 'src/filler/' + file));
});

test('original priority sorting and mint flush precede updates queued before mint', async () => {
  const value = scenario(await original(), 'same-block-dependencies-mint-flush-owner-guards');
  assert.equal(value.error, null);
  assert.equal(value.queued[0][0].input, 'logsetdata');
  assert.equal(value.queued[0].at(-1).input, 'config');
  const pos = (operation, table) => value.calls.findIndex(call => call.operation === operation && call.table === table);
  assert(pos('update', 'atomicassets_config') < pos('replace', 'atomicassets_collections'));
  assert(pos('replace', 'atomicassets_schemas') < pos('insert', 'atomicassets_templates'));
  assert(pos('insert', 'atomicassets_templates') < pos('insert', 'atomicassets_assets'));
  assert(pos('insert', 'atomicassets_assets') < pos('update', 'atomicassets_assets'));
  const assets = value.finalRows.atomicassets_assets;
  assert.equal(assets[0].asset_id, '9007199254740993');
  assert.equal(assets[0].template_id, null);
  assert.equal(assets[0].owner, 'bob');
  assert.deepEqual(JSON.parse(assets[0].mutable_data), {name: 'replacement mutable', signed: '-9223372036854775808'});
  assert.equal(assets[1].asset_id, '18446744073709551615');
  assert.equal(assets[1].template_id, 42);
  const guarded = value.calls.filter(call => call.where?.str.endsWith('AND owner = $3'));
  assert.deepEqual(guarded.map(call => [call.where.values[2], call.scriptedAffectedRows]), [['mallory', 0], ['alice', 1]]);
  assert.equal(assets[0].minted_at_block, 123456);
  assert.equal(assets[0].minted_at_time, 1793016000500);
});

test('original burn preserves null-owned asset, backing uses exact integers, and relationships remain separate', async () => {
  const value = scenario(await original(), 'burn-backing-relationships-and-template-clearing');
  assert.equal(value.error, null);
  const assets = value.finalRows.atomicassets_assets;
  assert.equal(assets.length, 2);
  assert.equal(assets[1].owner, null);
  assert.equal(assets[1].burned_by_account, 'alice');
  assert.equal(assets[1].burned_at_block, 123457);
  assert.equal(assets[1].minted_at_block, 123456);
  assert.equal(value.finalRows.atomicassets_assets_backed_tokens[0].amount, '18014398509481986');
  const template = value.finalRows.atomicassets_templates[0];
  assert.equal(template.mutable_data, null);
  assert.equal(JSON.parse(template.immutable_data).name, 'template immutable');
  assert.equal(template.deleted_at_block, 123458);
  assert.equal(template.created_at_block, 123456);
  assert.equal(JSON.parse(value.finalRows.atomicassets_collections[0].data).name, 'current collection');
  assert.equal(value.finalRows.atomicassets_collections[0].new_author_name, null);
  assert.equal(JSON.parse(value.finalRows.atomicassets_schemas[0].types[0]).type, 'video/mp4');
  assert.equal(Object.hasOwn(assets[0], 'schema'), false);
  assert.equal(Object.hasOwn(assets[0], 'template'), false);
  assert.equal(Object.hasOwn(assets[0], 'collection'), false);
  const emptyTransfer = value.notifications.find(entry => entry.trace.act.name === 'logtransfer' && entry.trace.act.data.asset_ids.length === 0);
  assert.ok(emptyTransfer);
  assert.equal(value.finalRows.atomicassets_transfers.length, 2);
});

test('original required-schema failures and stable equal-priority ordering remain observable', async () => {
  const result = await original();
  for (const name of ['missing-schema-for-template', 'missing-schema-for-mutable-template']) {
    const value = scenario(result, name);
    assert.equal(value.error.message, 'AtomicAssets: Schema of template not found. Should not be possible by contract');
    assert.equal(value.calls.some(call => call.operation === 'insert'), false);
  }
  const ordered = scenario(result, 'equal-priority-input-order-matters');
  assert.equal(ordered.error, null);
  const mutable = ordered.calls.find(call => call.operation === 'update' && call.table === 'atomicassets_templates');
  assert.equal(mutable.scriptedAffectedRows, 0);
  assert.equal(Object.hasOwn(ordered.finalRows.atomicassets_templates[0], 'mutable_data'), false);
  const unknown = scenario(result, 'unknown-template-delete-does-not-invent-row');
  assert.equal(unknown.calls.length, 1);
  assert.deepEqual(unknown.finalRows.atomicassets_templates, []);
  assert.match(scenario(result, 'collection-delete-is-rejected').error.message, /collection was deleted/);
  assert.match(scenario(result, 'schema-delete-is-rejected').error.message, /schema was deleted/);
  const noDependencyRead = scenario(result, 'mint-does-not-read-or-certify-related-rows');
  assert.equal(noDependencyRead.error, null);
  assert.equal(noDependencyRead.calls.some(call => call.operation === 'query'), false);
  assert.equal(noDependencyRead.finalRows.atomicassets_assets.length, 1);
  // Scripted writes are not FK checks or evidence that required serving relationships exist.
  assert.equal(Object.hasOwn(noDependencyRead.finalRows, 'atomicassets_schemas'), false);
});

test('locked typed codec retains scalar/vector integers, float coercion, serialized bytes, and NUL boundary behavior', async () => {
  const value = (await original()).controls.codec;
  assert.equal(value.converted.signed, '-9223372036854775808');
  assert.equal(value.converted.unsigned, '18446744073709551615');
  assert.deepEqual(value.converted.uv, ['0', '18446744073709551615']);
  assert.deepEqual(value.converted.sv, ['-9223372036854775808', '9007199254740993']);
  assert.equal(value.converted.f32, Math.fround(0.1));
  assert.equal(value.converted.f64, 0.1);
  assert.deepEqual(value.converted.fv.slice(1, 3), ['1e-60', '3.4028236e38']);
  assert.deepEqual(value.converted.dv.slice(1, 3), ['1e-400', '1e400']);
  assert.deepEqual(value.negativeZero, {floatVector: true, doubleVector: true});
  assert.equal(value.converted.nul, 'before\u0000after');
  assert.equal(JSON.parse(value.encodedDatabaseJson).nul, 'before after');
  assert.equal(value.converted.text, 'last duplicate wins');
  assert.equal(value.decoded.unsigned, value.converted.unsigned);
  assert.equal(value.decodedTypes.unsigned, 'string');
  assert.deepEqual(value.decodedTypes.uv, ['string', 'string']);
  assert.equal(value.decoded.name, 'serialized\u0000name');
  assert.equal(value.decoded.f32, Math.fround(0.1));
  assert.match(value.nulBoundary.encoded, /a\\ b/);
  assert.throws(() => JSON.parse(value.nulBoundary.encoded), SyntaxError,
    'Original global NUL-escape replacement can invalidate a literal backslash-u0000 string');
});
