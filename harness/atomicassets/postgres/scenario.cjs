"use strict";
const assert = require('node:assert/strict');
const {once} = require('node:events');
const {createHash} = require('node:crypto');
const copy = value => structuredClone(value);
const json = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v));
module.exports = async function scenario(fromReference, connection, config, record, inputProfile) {
  const profiles = require('../lifecycle-input.cjs');
  const selected = inputProfile === undefined ? profiles.loadInputProfile() : profiles.validateInputProfile(inputProfile);
  const {input, descriptor} = selected;
  const codec = fromReference('@atomichub/atomicassets');
  const {encodeDatabaseJson} = fromReference('./src/filler/utils.ts');
  const {default: DataProcessor, ProcessingState} = fromReference('./src/filler/processor.ts');
  const {default: AtomicAssetsHandler} = fromReference('./src/filler/handlers/atomicassets/index.ts');
  const helper = fromReference('./src/filler/handlers/test-helper.ts');
  const {HTTPServer} = fromReference('./src/api/server.ts');
  const {AtomicAssetsNamespace} = fromReference('./src/api/namespaces/atomicassets/index.ts');
  const {formatAsset} = fromReference('./src/api/namespaces/atomicassets/format.ts');
  const {Client} = fromReference('pg');
  const client = new Client({...config, ssl: false, application_name: 'aa-original-oracle', connectionTimeoutMillis: 5000, statement_timeout: 30000});
  require('./query-observer.cjs')(client,record,'lifecycle-sql');
  const rpc = [], notifications = [], stages = [], queue = [], executed = [];
  const {contract, collection, schema, assetId} = input;
  record({kind:'constructed-lifecycle-input',sequenceStart:'9007199254741093',inputProfile:descriptor,
    input:Object.fromEntries(['fixtureKind','contract','collection','schema','assetId','block','collectionFormat','collectionData','format','immutableAttributes','mutableAttributes','updatedAttributes','codecAttributes'].map(key=>[key,input[key]]))});
  assert.equal(assetId, '9007199254740993');
  const rpcBoundary = {async get_table_rows(args) {
    assert.equal(args.code, contract); assert.equal(args.scope, contract); assert.equal(args.json, true);
    let rows;
    if (args.table === 'tokenconfigs') rows = [{version: '1.0.0', standard: 'atomicassets'}];
    else if (args.table === 'config') rows = [{supported_tokens: [{sym: '4,WAX', contract: 'eosio.token'}], collection_format: input.collectionFormat}];
    else throw new Error('Unexpected bootstrap RPC request');
    rpc.push({args, rows: copy(rows)}); record({kind:'constructed-bootstrap-rpc',args,rows:copy(rows)}); return {rows};
  }, async get_info() {return {head_block_num: input.block.block_num, last_irreversible_block_num: input.block.block_num - 1};}};
  const core = new AtomicAssetsHandler({connection: {database: connection, chain: {rpc: rpcBoundary}}, reader: {name: 'original-pg-oracle'}},
    {atomicassets_account: contract, store_transfers: true, store_logs: false});
  const bootstrap = await connection.begin();
  try {await core.init(bootstrap); await bootstrap.query('COMMIT');}
  catch (error) {await bootstrap.query('ROLLBACK'); throw error;} finally {bootstrap.release();}
  const processor = new DataProcessor(ProcessingState.HEAD, helper.createMockModuleLoader());
  for (const [method, kind] of [['onContractRow','row'],['onActionTrace','action']]) {
    const register = processor[method].bind(processor);
    processor[method] = (account, name, callback, priority, ...rest) => register(account, name, async (...args) => {
      executed.push({kind, name, priority, block: args[1].block_num}); return await callback(...args);
    }, priority, ...rest);
  }
  const priority = processor.onPriorityComplete.bind(processor);
  processor.onPriorityComplete = (threshold, callback, value) => priority(threshold, async (...args) => {
    executed.push({kind: 'priority-complete', threshold, priority: value}); return await callback(...args);
  }, value);
  const releases = [fromReference('./src/filler/handlers/atomicassets/processors/config.ts').configProcessor(core, processor),
    fromReference('./src/filler/handlers/atomicassets/processors/collections.ts').collectionProcessor(core, processor),
    fromReference('./src/filler/handlers/atomicassets/processors/schemas.ts').schemaProcessor(core, processor),
    fromReference('./src/filler/handlers/atomicassets/processors/assets.ts').assetProcessor(core, processor,
      {sendActionTrace: (channel, block, tx, trace) => notifications.push(json({channel, block, tx, trace}))})];
  const unavailableRedis = new Proxy({}, {get() {throw new Error('Redis is outside the original PG fixture');}});
  let healthCalls = 0;
  const server = new HTTPServer({server_name: 'original-pg.invalid', cache_life: 0, max_db_connections: 2, max_query_time_ms: 10000},
    {database: connection, redis: {ioRedis: unavailableRedis}, chain: {name: 'original-pg-fixture', rpc: {async get_info() {healthCalls++; return {};}}}});
  const namespace = new AtomicAssetsNamespace('/atomicassets', server.connection,
    {atomicassets_account: contract, connected_reader: 'original-pg-oracle'});
  let sequence = 9007199254741093n;
  const tx = {id: 'ab'.repeat(32)};
  const block = n => ({block_num: input.block.block_num + n, block_id: BigInt(n + 1).toString(16).padStart(64, '0'),
    timestamp: new Date(Date.parse(input.block.timestamp + 'Z') + n * 1000).toISOString().slice(0, -1)});
  const action = (name, data) => ({kind: 'action', value: {act: {account: contract, name, data}, global_sequence: String(sequence++)}});
  const delta = (table, value, scope = collection, present = true) => ({kind: 'row', value: {code: contract, scope, table, present, value}});
  const serialize = (data, format) => Buffer.from(codec.serialize(data, codec.CachedObjectSchema(format))).toString('hex');
  const coll = data => delta('collections', {collection_name: collection, author: 'author', allow_notify: true,
    authorized_accounts: ['author','editor'], notify_accounts: ['watcher'], market_fee: .05,
    serialized_data: serialize(data, input.collectionFormat)});
  async function commit(name, n, events) {
    const b = block(n); await client.query('BEGIN');
    try {
      for (const event of events) event.kind === 'row' ? processor.processContractRow(b, copy(event.value)) : processor.processActionTrace(b, tx, copy(event.value));
      queue.push({name, jobs: processor.liveQueue.map(job => ({priority: job.priority, index: job.index, input: job.args.at(-1).table ?? job.args.at(-1).act.name}))});
      await processor.executeHeadQueue(helper.createTestTransaction(client)); await client.query('COMMIT');
    } catch (error) {await client.query('ROLLBACK'); throw error;}
  }
  async function snapshot(name) {
    const asset = (await client.query('SELECT * FROM atomicassets_assets WHERE contract=$1 AND asset_id=$2', [contract,assetId])).rows;
    const mints = (await client.query('SELECT * FROM atomicassets_mints WHERE contract=$1 AND asset_id=$2', [contract,assetId])).rows;
    const view = (await client.query('SELECT * FROM atomicassets_assets_master WHERE contract=$1 AND asset_id=$2', [contract,assetId])).rows;
    assert.equal(asset.length, 1); assert.equal(mints.length, 1); assert.equal(view.length, 1); assert.equal(asset[0].asset_id, assetId);
    const collections = (await client.query('SELECT * FROM atomicassets_collections WHERE contract=$1 AND collection_name=$2',[contract,collection])).rows;
    const schemas = (await client.query('SELECT * FROM atomicassets_schemas WHERE contract=$1 AND collection_name=$2 AND schema_name=$3',[contract,collection,schema])).rows;
    const transfers = (await client.query('SELECT * FROM atomicassets_transfers WHERE contract=$1 ORDER BY transfer_id',[contract])).rows;
    const response = await fetch('http://127.0.0.1:' + server.httpServer.address().port + '/atomicassets/v1/assets/' + assetId,
      {redirect: 'manual', signal: AbortSignal.timeout(10000)});
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {bytes += chunk.length; assert.ok(bytes <= 2097152); chunks.push(chunk);}
    const text = Buffer.concat(chunks).toString('utf8'), body = JSON.parse(text);
    assert.equal(response.status, 200); assert.equal(body.success, true);
    assert.deepEqual(body.data, json(formatAsset(copy(view[0])))); assert.equal(body.data.asset_id, assetId);
    const value = {name, asset: asset[0], mints, view: view[0], collections, schemas, transfers,
      http: {status: response.status, headers: Object.fromEntries(response.headers), rawText: text, body}};
    stages.push(value); record({kind:'physical-view-http-stage',value}); return value;
  }
  try {
    await client.connect(); await namespace.init(); server.web.express.use('/atomicassets', await namespace.router(server));
    server.httpServer.listen(0, '127.0.0.1'); await once(server.httpServer, 'listening');
    await commit('dependencies-mint-same-block-update', 0, [action('logsetdata',{asset_id:assetId,new_data:input.updatedAttributes}),
      action('logmint',{asset_id:assetId,collection_name:collection,schema_name:schema,template_id:-1,new_asset_owner:'alice',authorized_minter:'author',
        immutable_data:input.immutableAttributes,mutable_data:input.mutableAttributes}),
      delta('schemas',{schema_name:schema,format:input.format}), coll(input.collectionData),
      delta('config',{supported_tokens:[{sym:'4,WAX',contract:'eosio.token'}],collection_format:input.collectionFormat})]);
    assert.deepEqual(executed.filter(row=>row.kind!=='priority-complete').slice(0,5).map(row=>row.name),['config','schemas','collections','logmint','logsetdata']);
    const completedMintIndex=executed.findIndex(row=>row.kind==='priority-complete'&&row.threshold===50);
    assert.ok(completedMintIndex>=0&&completedMintIndex<executed.findIndex(row=>row.name==='logsetdata'));
    const minted = await snapshot('mint-and-replacement'); assert.equal(minted.asset.template_id,null);
    assert.equal(minted.asset.mutable_data.name,'replacement mutable'); assert.equal(Object.hasOwn(minted.asset.mutable_data,'old'),false);
    assert.equal(minted.asset.immutable_data.serial,'18446744073709551615');
    const transfer = (from,to) => action('logtransfer',{from,to,asset_ids:[assetId],memo:'original PG transfer'});
    await commit('wrong-owner-transfer',1,[transfer('mallory','wrong')]); const wrong = await snapshot('wrong-owner-transfer');
    assert.deepEqual(wrong.asset,minted.asset); assert.equal(wrong.transfers.length,1); assert.equal(typeof wrong.transfers[0].transfer_id,'string');
    assert.ok(BigInt(wrong.transfers[0].transfer_id)>9007199254740992n);
    await commit('right-owner-transfer',2,[transfer('alice','bob')]); const right = await snapshot('right-owner-transfer');
    assert.equal(right.asset.owner,'bob'); assert.equal(right.transfers.length,2);
    await commit('relationship-only-update',3,[delta('schemas',{schema_name:schema,format:[...input.format,{name:'new_field',type:'string'}]}),
      delta('schematypes',{schema_name:schema,format_type:[{name:'image',mediatype:'video',info:'video/mp4'}]}),coll({...input.collectionData,name:'current joined collection'})]);
    const joined = await snapshot('relationship-only-update'); assert.deepEqual(joined.asset,right.asset); assert.notDeepEqual(joined.http.body.data,right.http.body.data);
    assert.equal(joined.http.body.data.collection.name,'current joined collection');
    assert.ok(joined.http.body.data.schema.format.some(row=>row.name==='new_field'));
    assert.equal(joined.http.body.data.schema.format.find(row=>row.name==='image').mediatype,'video');
    assert.equal(joined.http.body.data.schema.format.find(row=>row.name==='image').info,'video/mp4');
    for (const field of ['created_at_block','created_at_time']) {
      assert.equal(joined.collections[0][field],minted.collections[0][field]); assert.equal(joined.schemas[0][field],minted.schemas[0][field]);
    }
    await commit('burn',4,[action('logburnasset',{asset_id:assetId,asset_owner:'bob'})]); const burned=await snapshot('burn');
    assert.equal(burned.asset.owner,null); assert.equal(burned.asset.burned_by_account,'bob');
    for (const field of ['minted_at_block','minted_at_time']) assert.equal(burned.asset[field],minted.asset[field]);
    const negatives=[];
    try {await commit('missing-collection-deferred-fk',5,[delta('schemas',{schema_name:'missing',format:input.format},'missingcoll')]); throw new Error('Missing FK unexpectedly committed');}
    catch(error) {assert.equal(error.code,'23503'); negatives.push({name:'missing-collection-deferred-fk',code:error.code,message:error.message});}
    assert.deepEqual((await snapshot('after-negative-rollback')).asset,burned.asset);
    const missingAsset=String(BigInt(assetId)+1n);
    try {await commit('missing-schema-mint-deferred-fk',6,[action('logmint',{asset_id:missingAsset,collection_name:collection,schema_name:'missing',
      template_id:-1,new_asset_owner:'alice',authorized_minter:'author',immutable_data:input.immutableAttributes,mutable_data:input.mutableAttributes})]);
      throw new Error('Missing relationship mint unexpectedly committed');}
    catch(error) {assert.equal(error.code,'23503'); negatives.push({name:'missing-schema-mint-deferred-fk',assetId:missingAsset,code:error.code,message:error.message});}
    assert.equal((await client.query('SELECT * FROM atomicassets_assets_master WHERE contract=$1 AND asset_id=$2',[contract,missingAsset])).rows.length,0);
    try {await commit('collection-delete-rejected',6,[delta('collections',{collection_name:collection},collection,false)]); throw new Error('Original collection deletion unexpectedly accepted');}
    catch(error) {assert.match(error.message,/A collection was deleted/); negatives.push({name:'collection-delete-rejected',message:error.message});}
    assert.deepEqual((await snapshot('after-original-processor-refusal')).asset,burned.asset);
    const probes=[];
    const converted=codec.convertAttributeMapToObject(input.codecAttributes);
    for (const [name,value] of module.exports.codecProbeCases(converted)) {
      const encoded=encodeDatabaseJson(value); await client.query('BEGIN');
      try {const result=await client.query('SELECT $1::jsonb AS native_value, $1::jsonb::text AS postgres_text, jsonb_typeof($1::jsonb) AS type',[encoded]);
        probes.push({name,encoded,rows:result.rows,accepted:true});}
      catch(error) {probes.push({name,encoded,accepted:false,code:error.code,message:error.message});}
      finally {await client.query('ROLLBACK');}
    }
    const nativeInput='{"integer":9007199254740993,"fraction":0.1,"nil":null,"nested":{"values":[1,null]}}';
    const nativeRows=(await client.query("SELECT $1::jsonb AS native_value, $1::jsonb::text AS postgres_text, $1::jsonb->>'integer' AS integer_text",[nativeInput])).rows;
    assert.equal(nativeRows[0].integer_text,'9007199254740993'); assert.equal(nativeRows[0].native_value.nil,null);
    assert.equal(Object.hasOwn(nativeRows[0].native_value,'missing'),false);
    probes.push({name:'native-jsonb-types-not-mint-state',rawInput:nativeInput,rows:nativeRows,mintState:false});
    assert.equal(probes.find(row=>row.name==='nul').accepted,true);
    assert.equal(probes.find(row=>row.name==='literal-escape').accepted,false);
    const currentView=(await client.query("SELECT pg_get_viewdef('atomicassets_assets_master'::regclass,true) AS definition")).rows[0].definition;
    assert.ok(currentView.includes('atomicassets_original_mints'));
    const constraints=(await client.query("SELECT conname,condeferrable,condeferred,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='atomicassets_assets'::regclass ORDER BY conname")).rows;
    for (const name of ['atomicassets_assets_collections_fkey','atomicassets_assets_schemas_fkey']) assert.ok(constraints.some(row=>row.conname===name&&row.condeferrable&&row.condeferred));
    record({kind:'original-pg-scenario-complete',stages:stages.length});
    return {inputProfile:descriptor,stages,negatives,codec:{converted:json(converted),negativeZero:Object.is(converted.fv[3],-0),probes},queue,executed,notifications,
      bootstrapRpc:{constructedInputs:true,requests:rpc,maintenanceSkippedForUnknownReader:true},schemaAudit:{currentView,constraints},healthCalls,
      scope:{originalProcessors:true,originalHandlerBootstrap:true,originalViewAndHttp:true,realPostgres:true,reversibleBookkeeping:false,
        constructedInputs:true,mongoParity:false,postgresFixtureCleanupQualified:false,fullParity:false}};
  } finally {
    for(const release of releases)release(); assert.equal(processor.getActiveListeners().trace_listeners.length,0);
    assert.equal(processor.getActiveListeners().table_listeners.length,0);
    server.httpServer.closeAllConnections(); await new Promise(resolve=>server.socket.io.close(resolve));
    await server.database.end(); await client.end();
  }
};

module.exports.codecProbeCases=converted=>[['locked-codec',converted],['nul',{text:'a\u0000b'}],['literal-escape',{text:'a\\u0000b'}]];
