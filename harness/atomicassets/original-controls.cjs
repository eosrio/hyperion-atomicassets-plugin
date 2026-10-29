'use strict';
// Qualification fixture only: original processors, bounded scripted transaction effects, no DB engine.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join, relative, sep} = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => structuredClone(value);
const json = value => JSON.parse(JSON.stringify(value, (_, entry) => typeof entry === 'bigint' ? entry.toString() : entry));
const fixtureRoot = join(__dirname, '../../fixtures/harness/atomicassets/lifecycle');

// These predicates are deliberately the complete supported script, not a SQL implementation.
const predicates = {
  'contract = $1': (row, values) => row.contract === values[0],
  'contract = $1 AND collection_name = $2': (row, values) => row.contract === values[0] && row.collection_name === values[1],
  'contract = $1 AND collection_name = $2 AND schema_name = $3': (row, values) => row.contract === values[0] && row.collection_name === values[1] && row.schema_name === values[2],
  'contract = $1 AND template_id = $2': (row, values) => row.contract === values[0] && row.template_id === values[1],
  'contract = $1 AND asset_id = $2': (row, values) => row.contract === values[0] && row.asset_id === values[1],
  'contract = $1 AND asset_id = $2 AND token_symbol = $3': (row, values) => row.contract === values[0] && row.asset_id === values[1] && row.token_symbol === values[2],
  'contract = $1 AND asset_id = ANY ($2) AND owner = $3': (row, values) => row.contract === values[0] && values[1].includes(row.asset_id) && row.owner === values[2],
};

function scriptedTransaction(contract) {
  const tables = new Map([['atomicassets_config', [{contract, collection_format: []}]]]);
  const calls = [];
  const rows = table => {
    assert.match(table, /^atomicassets_(?:config|collections|schemas|templates|assets|mints|tokens|assets_backed_tokens|transfers|transfers_assets)$/);
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };
  const record = call => {assert(calls.length < 128, 'Scripted transaction call budget'); calls.push(json(call));};
  const write = (operation, table, data, keys, preserve = [], args = []) => {
    const batch = Array.isArray(data) ? data : [data];
    assert(batch.length <= 8, 'Bounded fixture rows');
    for (const incoming of batch) {
      const list = rows(table), old = list.find(row => keys.every(key => row[key] === incoming[key]));
      const replacement = copy(incoming);
      if (old && args.at(-1) === 'nothing') continue;
      if (old && operation === 'replace') for (const key of preserve) replacement[key] = old[key];
      if (old) Object.assign(old, replacement); else {assert(list.length < 16); list.push(replacement);}
    }
    record({operation, table, data, keys, ...(operation === 'replace' ? {preserve} : {args})});
  };
  return {
    calls, tables,
    db: {
      async insert(table, data, keys, ...args) {write('insert', table, data, keys, [], args);},
      async replace(table, data, keys, preserve) {write('replace', table, data, keys, preserve);},
      async update(table, data, where, keys) {
        assert(Object.hasOwn(predicates, where.str), 'Unexpected scripted update predicate');
        const selected = rows(table).filter(row => predicates[where.str](row, where.values));
        for (const row of selected) Object.assign(row, copy(data));
        record({operation: 'update', table, data, where, keys, scriptedAffectedRows: selected.length});
      },
      async query(sql, parameters = []) {
        let selected;
        if (sql === "SET LOCAL statement_timeout = '300s'") selected = [];
        else if (sql === 'SELECT contract, collection_name, schema_name FROM atomicassets_templates WHERE contract = $1 AND template_id = $2')
          selected = rows('atomicassets_templates').filter(row => row.contract === parameters[0] && row.template_id === parameters[1])
            .map(({contract, collection_name, schema_name}) => ({contract, collection_name, schema_name}));
        else if (sql === 'SELECT format FROM atomicassets_schemas WHERE contract = $1 AND collection_name = $2 AND schema_name = $3')
          selected = rows('atomicassets_schemas').filter(row => row.contract === parameters[0] && row.collection_name === parameters[1] && row.schema_name === parameters[2])
            // Explicit scripted json[] decoding; this does not measure pg's type parser/casts.
            .map(row => ({format: row.format.map(value => JSON.parse(value))}));
        else if (sql === 'SELECT amount FROM atomicassets_assets_backed_tokens WHERE contract = $1 AND asset_id = $2 AND token_symbol = $3')
          selected = rows('atomicassets_assets_backed_tokens').filter(row => row.contract === parameters[0] && row.asset_id === parameters[1] && row.token_symbol === parameters[2])
            .map(({amount}) => ({amount}));
        else throw new Error('Unexpected scripted query: ' + sql);
        record({operation: 'query', sql, parameters, scriptedRows: selected});
        return {rowCount: selected.length, rows: copy(selected)};
      },
    },
  };
}

module.exports = async function originalAssetControls(fromReference, referenceRoot) {
  const provenance = JSON.parse(readFileSync(join(fixtureRoot, 'provenance.json'), 'utf8'));
  assert.equal(provenance.commit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  for (const source of provenance.sources) {
    const retained = readFileSync(join(fixtureRoot, 'original', source.path));
    assert.equal(sha(retained), source.sha256, source.path);
    const original = execFileSync('git', ['show', provenance.commit + ':' + source.path], {cwd: referenceRoot, timeout: 10000});
    assert.deepEqual(original, retained, 'Original Git blob: ' + source.path);
  }
  const codecPath = fromReference.resolve('@atomichub/atomicassets');
  const codecPackage = fromReference('@atomichub/atomicassets/package.json');
  assert.equal(codecPackage.version, '2.2.0');
  for (const file of provenance.codec.files) {
    const actual = file.path === 'build/index.cjs' ? codecPath : join(codecPath, '../../', file.path);
    assert.equal(sha(readFileSync(actual)), file.sha256, 'Locked installed helper: ' + file.path);
    assert.equal(sha(readFileSync(join(fixtureRoot, 'original/codec', file.path))), file.sha256);
  }
  const codec = fromReference('@atomichub/atomicassets');
  const {encodeDatabaseJson} = fromReference('./src/filler/utils.ts');
  const {default: DataProcessor, ProcessingState} = fromReference('./src/filler/processor.ts');
  const {configProcessor} = fromReference('./src/filler/handlers/atomicassets/processors/config.ts');
  const {collectionProcessor} = fromReference('./src/filler/handlers/atomicassets/processors/collections.ts');
  const {schemaProcessor} = fromReference('./src/filler/handlers/atomicassets/processors/schemas.ts');
  const {templateProcessor} = fromReference('./src/filler/handlers/atomicassets/processors/templates.ts');
  const {assetProcessor} = fromReference('./src/filler/handlers/atomicassets/processors/assets.ts');
  const input = JSON.parse(readFileSync(join(fixtureRoot, 'input.json'), 'utf8'));
  const {contract, collection, schema, assetId, templatedAssetId, templateId} = input;
  const block = offset => ({block_num: input.block.block_num + offset, block_id: String(offset + 1).padStart(64, '0'),
    timestamp: new Date(Date.parse(input.block.timestamp + 'Z') + offset * 1000).toISOString().slice(0, -1)});
  const tx = {id: 'ab'.repeat(32)};
  const delta = (table, value, present = true) => ({kind: 'row', value: {code: contract, scope: collection, table, present, value}});
  let sequence = BigInt(input.sequence);
  const action = (name, data) => ({kind: 'action', value: {act: {account: contract, name, data}, global_sequence: String(sequence++)}});
  const serialize = (data, format) => Buffer.from(codec.serialize(data, codec.CachedObjectSchema(format))).toString('hex');
  const collectionRow = (data = input.collectionData) => delta('collections', {collection_name: collection, author: 'author', allow_notify: true,
    authorized_accounts: ['author', 'editor'], notify_accounts: ['watcher'], market_fee: 0.05,
    serialized_data: serialize(data, input.collectionFormat)});
  const schemaRow = (format = input.format) => delta('schemas', {schema_name: schema, format});
  const templateRow = (data = input.templateData, present = true, id = templateId) => delta('templates', {template_id: id,
    schema_name: schema, transferable: true, burnable: false, max_supply: '18446744073709551615', issued_supply: '9007199254740993',
    immutable_serialized_data: serialize(data, input.format)}, present);
  const mutableTemplate = (present = true) => delta('templates2', {template_id: templateId, schema_name: schema,
    mutable_serialized_data: serialize(input.mutableTemplateData, input.format)}, present);
  const mint = (id, tpl) => action('logmint', {asset_id: id, collection_name: collection, schema_name: schema, template_id: tpl,
    new_asset_owner: 'alice', authorized_minter: 'author', immutable_data: input.immutableAttributes, mutable_data: input.mutableAttributes});
  const transfer = (from, to, ids = [assetId]) => action('logtransfer', {from, to, asset_ids: ids, memo: 'original transfer\u0000memo'});
  const config = delta('config', {supported_tokens: [{sym: '4,WAX', contract: 'eosio.token'}], collection_format: input.collectionFormat});
  const scenarios = [];
  async function run(name, blocks) {
    const boundary = scriptedTransaction(contract), notifications = [];
    const core = {args: {atomicassets_account: contract, store_transfers: true}, config: {supported_tokens: [], collection_format: []}, tokenconfigs: {version: '1.0.0'}};
    const processor = new DataProcessor(ProcessingState.HEAD, {checkTrace: () => true, checkDelta: () => true});
    const releases = [configProcessor(core, processor), collectionProcessor(core, processor), schemaProcessor(core, processor),
      templateProcessor(core, processor), assetProcessor(core, processor, {sendActionTrace: (topic, b, t, trace) => notifications.push(json({topic, block: b, tx: t, trace}))})];
    const registrations = processor.getActiveListeners();
    const result = {name, inputs: [], queued: [], calls: boundary.calls, notifications, error: null};
    try {
      for (const [offset, events] of blocks) {
        const b = block(offset); result.inputs.push(json({block: b, tx, events}));
        for (const event of events) {
          if (event.kind === 'action') processor.processActionTrace(b, tx, copy(event.value));
          else processor.processContractRow(b, copy(event.value));
        }
        result.queued.push(processor.liveQueue.map(job => ({priority: job.priority, index: job.index,
          input: job.args.at(-1).table ?? job.args.at(-1).act.name})));
        await processor.executeHeadQueue(boundary.db);
      }
    } catch (error) {result.error = {name: error.name, message: error.message};}
    finally {for (const release of releases) release();}
    result.finalRows = json(Object.fromEntries(boundary.tables));
    result.activeListenersAfterRelease = processor.getActiveListeners();
    result.registrations = {actions: registrations.trace_listeners.map(({action, priority}) => ({action, priority})),
      tables: registrations.table_listeners.map(({table, priority}) => ({table, priority}))};
    scenarios.push(result);
  }
  await run('same-block-dependencies-mint-flush-owner-guards', [[0, [
    action('logsetdata', {asset_id: assetId, new_data: input.updatedAttributes}),
    transfer('mallory', 'wrong'), transfer('alice', 'bob'), mint(assetId, -1), mint(templatedAssetId, templateId),
    templateRow(), mutableTemplate(), collectionRow(), schemaRow(),
    delta('schematypes', {schema_name: schema, format_type: [{name: 'image', type: 'image/png'}]}), config,
  ]]]);
  await run('burn-backing-relationships-and-template-clearing', [
    [0, [config, collectionRow(), schemaRow(), templateRow(), mutableTemplate(), mint(assetId, -1), mint(templatedAssetId, templateId)]],
    [1, [collectionRow({...input.collectionData, name: 'current collection'}), schemaRow([...input.format, {name: 'new_field', type: 'string'}]),
      delta('schematypes', {schema_name: schema, format_type: [{name: 'image', type: 'video/mp4'}]}),
      delta('authorswaps', {collection_name: collection, new_author: 'nextauthor', acceptance_date: 1800000000}),
      delta('authorswaps', {collection_name: collection}, false), templateRow({...input.templateData, name: 'must not replace original immutable'}),
      mutableTemplate(false), action('logburnasset', {asset_id: templatedAssetId, asset_owner: 'alice'}),
      action('logbackasset', {asset_id: assetId, backed_token: '900719925474.0993 WAX'}),
      action('logbackasset', {asset_id: assetId, backed_token: '900719925474.0993 WAX'}), transfer('alice', 'bob'), transfer('alice', 'wrong'), transfer('alice', 'nobody', []),
    ]],
    [2, [templateRow(input.templateData, false)]],
  ]);
  await run('missing-schema-for-template', [[0, [templateRow()]]]);
  await run('missing-schema-for-mutable-template', [[0, [mutableTemplate()]]]);
  await run('equal-priority-input-order-matters', [[0, [mutableTemplate(), templateRow(), schemaRow()]]]);
  await run('unknown-template-delete-does-not-invent-row', [[0, [templateRow(input.templateData, false, templateId + 1)]]]);
  await run('collection-delete-is-rejected', [[0, [delta('collections', {collection_name: collection}, false)]]]);
  await run('schema-delete-is-rejected', [[0, [delta('schemas', {schema_name: schema}, false)]]]);
  await run('mint-does-not-read-or-certify-related-rows', [[0, [mint(assetId, templateId)]]]);

  const converted = codec.convertAttributeMapToObject(input.codecAttributes);
  const encoded = serialize(input.serializedData, input.format);
  const decoded = codec.deserialize(encoded, codec.CachedObjectSchema(input.format));
  const codecResult = json({attributes: input.codecAttributes, converted,
    negativeZero: {floatVector: Object.is(converted.fv[3], -0), doubleVector: Object.is(converted.dv[3], -0)},
    encodedDatabaseJson: encodeDatabaseJson(converted), serializedInput: input.serializedData, serializedHex: encoded, decoded,
    decodedTypes: Object.fromEntries(Object.entries(decoded).map(([key, value]) => [key, Array.isArray(value) ? value.map(item => typeof item) : typeof value])),
    nulBoundary: {input: {text: 'a\u0000b', literalEscape: 'a\\u0000b', vector: ['x\u0000y']},
      encoded: encodeDatabaseJson({text: 'a\u0000b', literalEscape: 'a\\u0000b', vector: ['x\u0000y']})}});
  const loadedSource = Object.keys(require.cache).filter(path => path.startsWith(join(referenceRoot, 'src') + sep))
    .map(path => ({path: relative(referenceRoot, path).split(sep).join('/'), sha256: sha(readFileSync(path))}));
  const result = {nodeVersion: process.version, scope: {originalDataProcessor: true, originalProcessors: true,
    lockedCodec: '@atomichub/atomicassets@2.2.0', database: 'bounded-scripted-transaction-effects',
    postgresExecution: false, mongoExecution: false, chainCapture: false, hyperionPluginExecution: false,
    servingViewExecution: false, initializationReplayRollbackQualified: false, fullParity: false},
    controls: {codec: codecResult, cases: scenarios}, loadedSource, provenance};
  assert(Buffer.byteLength(JSON.stringify(result)) < 1024 * 1024, 'Bounded original result');
  return result;
};
// The same finite SQL collaborator can support additional original callback slices.
module.exports.scriptedTransaction = scriptedTransaction;
