// Pure classification against the original processor and codec. No store/HTTP/workload effects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire, stripTypeScriptTypes} from 'node:module';
const root = new URL('../../../', import.meta.url), read = path => readFileSync(new URL(path, root));
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const CODEC_SHA = '2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573';
const bytes = read('tests/fixtures/jsonb-display-pg16.json');
assert.equal(sha(bytes), 'c2eb66d9ab596f8142a1c35cb6770854169d281baf1611b09f392b368018786b');
export const corpus = JSON.parse(bytes);
assert.equal(corpus.referenceCommit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
assert.equal(corpus.workflowRun, 41958628616); assert.equal(corpus.cases.length, 63);
const codecPath = new URL('vendor/atomicassets-2.2.0/build/index.cjs', root);
assert.equal(sha(readFileSync(codecPath)), CODEC_SHA);
export const codec = createRequire(import.meta.url)(codecPath.pathname.replace(/^\/(\w:)/, '$1'));
const provenance = JSON.parse(read('fixtures/harness/atomicassets/lifecycle/provenance.json'));
function original(path) {
  const bytes = read('fixtures/harness/atomicassets/lifecycle/original/' + path);
  const pin = provenance.sources.find(row => row.path === path); assert(pin, path);
  assert.equal(sha(bytes), pin.sha256, 'Original callback source differs: ' + path);
  return bytes.toString();
}
const utils = stripTypeScriptTypes(original('src/filler/utils.ts'), {mode: 'strip'}).replaceAll('export ', '');
export const originalEncode = new Function(utils + '\nreturn encodeDatabaseJson;')();
const timestampSource = original('src/utils/eosio.ts').match(/export function eosioTimestampToDate\(timestamp: string\): Date \{[^}]+\}/)[0];
const eosioTimestampToDate = new Function(stripTypeScriptTypes(timestampSource, {mode: 'strip'}).replace('export ', '') + ';return eosioTimestampToDate;')();
const collections = stripTypeScriptTypes(original('src/filler/handlers/atomicassets/processors/collections.ts')
  .replace(/^import [^\n]+\n/gm, ''), {mode: 'strip'}).replaceAll('export ', '');
const collectionProcessor = new Function('deserialize', 'CachedObjectSchema', 'encodeDatabaseJson', 'eosioTimestampToDate', 'AtomicAssetsUpdatePriority',
  collections + '\nreturn collectionProcessor;')(codec.deserialize, codec.CachedObjectSchema, originalEncode, eosioTimestampToDate,
  {TABLE_COLLECTIONS: 20});

export function inputFor(row) {
  const value = JSON.parse(row.rawInput);
  for (const path of row.negativeZeroPaths) {
    let target = value; for (const part of path.slice(0, -1)) target = target[part];
    Object.defineProperty(target, path.at(-1), {value: -0, enumerable: true, writable: true, configurable: true});
  }
  return value;
}
function fieldType(value) {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' && Number.isFinite(value)) return 'double';
  if (typeof value === 'boolean') return 'bool'; // The original decoder returns 0/1; exact comparison below decides.
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return 'string[]';
  if (Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item))) return 'double[]';
  throw new Error('No exact declared Atomic 2.2.0 scalar/vector collection type for this value');
}

/** Observe the actual original collections callback's DB-bound write. This is not a SQL execution. */
export async function originalCollectionWrite(plan) {
  assert.equal(plan.sourceRepresentable, true); let callback, write;
  const release = collectionProcessor({args: {atomicassets_account: 'atomicassets'}, config: {collection_format: plan.format}}, {
    onContractRow(_contract, table, run) {if (table === 'collections') callback = run; return () => {};}
  });
  try {
    await callback({async replace(table, value) {assert.equal(table, 'atomicassets_collections'); write = structuredClone(value);}},
      {block_num: 1, timestamp: '2026-10-26T12:00:00.500'}, {present: true, value: {
        collection_name: 'fixturecoll', author: 'author', allow_notify: true, authorized_accounts: ['author', 'editor'],
        notify_accounts: ['watcher'], market_fee: 0.05, serialized_data: plan.serializedHex
      }});
    assert(write); return write;
  } finally {release();}
}

export async function classifyCorpus() {
  const plans = [];
  for (const [index, row] of corpus.cases.entries()) {
    const plan = {id: row.name + ':' + row.rotation, index, name: row.name, rotation: row.rotation,
      rawInput: row.rawInput, negativeZeroPaths: structuredClone(row.negativeZeroPaths), originalSqlAccepted: row.storageAccepted,
      sourceRepresentable: false, projectionCoverage: 'pending-source-or-import-path'};
    try {
      const input = inputFor(row), format = Object.entries(input).map(([name, value]) => {
        assert(name.length > 0 && !name.includes('\0') && !name.includes('\\u0000') &&
          !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name),
          'NUL or unpaired-surrogate format names require separate original config/JSONB-array proof');
        return {name, type: fieldType(value)};
      });
      const schema = codec.CachedObjectSchema(format), serializedHex = Buffer.from(codec.serialize(input, schema)).toString('hex');
      const decoded = codec.deserialize(serializedHex, schema);
      plan.codecAttempt = {format, serializedHex, originalDecoded: decoded, originalEncoded: originalEncode(decoded)};
      assert.deepEqual(decoded, input, 'Codec cannot produce the exact original JS input');
      const encoded = originalEncode(decoded); assert.equal(encoded, row.encoded, 'Original callback encoder bytes differ from the measured SQL vector');
      Object.assign(plan, {sourceRepresentable: true, projectionCoverage: 'pending-physical-execution', format, serializedHex,
        originalDecoded: decoded, originalEncoded: encoded, encodedSha256: sha(encoded)});
      const write = await originalCollectionWrite(plan); assert.equal(write.data, row.encoded);
      plan.originalCallbackWrite = write;
    } catch (error) {
      plan.sourceRepresentable = false; plan.projectionCoverage = 'pending-source-or-import-path';
      plan.reason = String(error.message).split('\n')[0];
      delete plan.format; delete plan.serializedHex; delete plan.originalDecoded; delete plan.originalEncoded; delete plan.encodedSha256;
    }
    plans.push(plan);
  }
  return plans;
}
