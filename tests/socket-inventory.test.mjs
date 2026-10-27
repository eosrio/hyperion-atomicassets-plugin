import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
import test from 'node:test';

const read = async domain => JSON.parse(await readFile(new URL(`../docs/parity/${domain}/inventory.json`, import.meta.url)));
const events = registration => registration.events.map(event => [event.trigger.action, event.event, event.room]);

function assertAtomicAssets(coverage) {
  assert.equal(coverage.registrationCount, 3);
  assert.equal(coverage.distinctNamespaceCount, 2);
  assert.deepEqual(coverage.registrations.map(r => [r.path, r.notification.channel]), [
    ['/atomicassets/v1/assets', 'assets'], ['/atomicassets/v1/offers', 'transfers'], ['/atomicassets/v1/offers', 'offers']
  ]);
  assert.deepEqual(coverage.registrations.map(events), [
    [['logmint', 'new_asset', null], ['logburnasset', 'burn', null], ['logbackasset', 'back', null], ['logsetdata', 'update', null]],
    [['logtransfer', 'new_transfer', null]], [['lognewoffer', 'create', null]]
  ]);
  assert.deepEqual(coverage.registrations.map(r => r.source.line), [202, 153, 303]);
  assert.deepEqual(coverage.registrations.map(r => r.registrationSource.line), [134, 135, 136]);
  assert.deepEqual(coverage.registrations.map(r => r.events.map(e => [e.trigger.source.line, e.source.line])), [
    [[236, 237], [244, 245], [255, 256], [263, 264]], [[191, 192]], [[333, 334]]
  ]);
  const assetEvents = coverage.registrations[0].events;
  assert.deepEqual(assetEvents.map(event => event.featureGates.map(gate => gate.expression)), [[], [],
    ['this.core.args.socket_features.asset_update'], ['this.core.args.socket_features.asset_update']]);
  assert.equal(coverage.featureDefaults.condition, '!this.args.socket_features');
  assert.deepEqual(coverage.featureDefaults.value, {asset_update: true});
  for (const registration of coverage.registrations) {
    assert.deepEqual(registration.subscriptions, []);
    assert.equal(registration.accountFilter.expectedAccount, 'this.core.args.atomicassets_account');
    assert.equal(registration.fork.event, 'fork');
    assert.equal(registration.fork.room, null);
    assert.deepEqual(registration.fork.payloadFields, ['block_num']);
  }
}

test('AtomicAssets socket inventory retains all registrations and the shared offers namespace', async () => {
  assertAtomicAssets((await read('atomicassets')).socketCoverage);
});

test('Market socket inventory records subscribe rooms, events and namespace-wide forks', async () => {
  const {socketCoverage: coverage, sockets} = await read('atomicmarket');
  assert.equal(coverage.registrationCount, 4);
  assert.equal(coverage.distinctNamespaceCount, 4);
  assert.deepEqual(sockets, coverage.registrations);
  assert.deepEqual(sockets.map(r => [r.path, r.notification.channel, r.subscriptions[0].rooms]), [
    ['/atomicmarket/v1/sales', 'sales', ['new_sales', 'purchased_sales']],
    ['/atomicmarket/v1/auctions', 'auctions', ['new_auctions', 'new_bids']],
    ['/atomicmarket/v1/buyoffers', 'buyoffers', ['new_buyoffers']],
    ['/atomicmarket/v1/template_buyoffers', 'template_buyoffers', ['new_template_buyoffers']]
  ]);
  assert.deepEqual(sockets.map(events), [
    [['lognewsale', 'new_sale', 'new_sales'], ['purchasesale', 'purchased_sale', 'purchased_sales']],
    [['lognewauct', 'new_auction', 'new_auctions'], ['auctionbid', 'new_bid', 'new_bids']],
    [['lognewbuyo', 'new_buyoffer', 'new_buyoffers']],
    [['lognewtbuyo', 'new_template_buyoffer', 'new_template_buyoffers']]
  ]);
  assert.deepEqual(sockets.map(r => r.source.line), [202, 158, 131, 129]);
  assert.deepEqual(sockets.map(r => r.registrationSource.line), [193, 194, 195, 196]);
  assert.deepEqual(sockets.map(r => r.events.map(e => [e.trigger.source.line, e.source.line])), [
    [[242, 243], [250, 251]], [[203, 204], [211, 215]], [[172, 173]], [[170, 171]]
  ]);
  for (const registration of sockets) {
    assert.equal(registration.subscriptions[0].event, 'subscribe');
    assert.equal(registration.subscriptions[0].joinWhen, 'data && data[room]');
    assert.equal(registration.subscriptions[0].leaveWhen, 'socket.rooms.has(room)');
    assert.equal(registration.subscriptions[0].separateUnsubscribe, false);
    assert.equal(registration.accountFilter.expectedAccount, 'core.args.atomicmarket_account');
    assert.equal(registration.fork.event, 'fork');
    assert.equal(registration.fork.room, null);
    assert.deepEqual(registration.fork.payloadFields, ['block_num']);
  }
});

test('every socket declaration and shared transport anchor has exact source pins', async () => {
  for (const domain of ['atomicassets', 'atomicmarket']) {
    const {socketCoverage: coverage} = await read(domain);
    assert.equal(coverage.runtimeQualified, false);
    assert.deepEqual(coverage.transport.options, {cors: {origin: '*'}, allowEIO3: true, transports: ['websocket']});
    assert.equal(coverage.namespaceFactory.expression, 'server.socket.io.of(path)');
    const anchors = [coverage.transport.source, coverage.namespaceFactory.source, coverage.featureDefaults.source,
      ...coverage.registrations.flatMap(r => [r.source, r.registrationSource, r.notification.source, r.accountFilter.source,
        r.fork.source, r.fork.trigger.source, ...r.events.flatMap(e => [e.source, e.trigger.source, ...e.featureGates.map(g => g.source)]),
        ...r.subscriptions.flatMap(s => [s.source, s.roomsSource, s.joinSource, s.leaveSource])])];
    for (const source of anchors) {
      const pin = coverage.sourcePins.find(pin => pin.path === source.path);
      assert.ok(pin, source.path);
      assert.equal(source.gitBlob, pin.gitBlob);
      assert.equal(source.sha256, pin.sha256);
      assert.match(source.url, /\/blob\/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e\//);
      assert.ok(source.line > 0 && source.endLine >= source.line);
    }
  }
});

test('the inventory guard rejects collapsed duplicate namespaces and missing source events', async () => {
  const original = (await read('atomicassets')).socketCoverage;
  const collapsed = structuredClone(original);
  collapsed.registrations.splice(1, 1);
  assert.throws(() => assertAtomicAssets(collapsed), assert.AssertionError);
  const missingEvent = structuredClone(original);
  missingEvent.registrations[0].events.splice(2, 1);
  assert.throws(() => assertAtomicAssets(missingEvent), assert.AssertionError);
});

test('normal inventory generators reproduce both golden contracts from exact pinned source', async () => {
  assert.ok(process.env.AA_REFERENCE_ROOT, 'AA_REFERENCE_ROOT is required; no silent inventory skip');
  await mkdir('out', {recursive: true});
  const output = await mkdtemp(resolve('out/inventory-golden-'));
  const commands = [
    ['harness/atomicassets/inventory.mjs', join(output, 'atomicassets')],
    ['fixtures/harness/atomicmarket/inventory-reference.mjs', process.env.AA_REFERENCE_ROOT,
      'harness/shared/reference.mjs', join(output, 'atomicmarket.json'), process.execPath]
  ];
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, {encoding: 'utf8', windowsHide: true, timeout: 60000});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.error, undefined);
  }
  const aa = JSON.parse(await readFile(join(output, 'atomicassets/inventory.json')));
  const market = JSON.parse(await readFile(join(output, 'atomicmarket.json')));
  const aaGolden = await read('atomicassets'), marketGolden = await read('atomicmarket');
  // The harness records physical lock bytes. A clean Git checkout can materialize LF or CRLF.
  // Verify those bytes against the exact upstream Git blob before treating this observation as portable.
  const canonicalLock = execFileSync('git', ['show', '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e:pnpm-lock.yaml'],
    {cwd: process.env.AA_REFERENCE_ROOT, timeout: 10000});
  const materializedLock = await readFile(join(process.env.AA_REFERENCE_ROOT, 'pnpm-lock.yaml'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(canonicalLock), '91dc5c040888673788bca9778b7a87ea285b5a5f1aa834da7707a2e6cdb52e5c');
  assert.equal(materializedLock.toString().replaceAll('\r\n', '\n'), canonicalLock.toString());
  assert.equal(aa.runtime.referenceLockSha256, sha(materializedLock));
  const validLockMaterializations = new Set([sha(canonicalLock), sha(canonicalLock.toString().replaceAll('\n', '\r\n'))]);
  assert.ok(validLockMaterializations.has(aaGolden.runtime.referenceLockSha256));
  aa.runtime.referenceLockSha256 = aaGolden.runtime.referenceLockSha256;
  // The executing Node version is an observation, not part of the pinned source contract.
  aa.runtime.node = aaGolden.runtime.node;
  market.inspection.nodeVersion = marketGolden.inspection.nodeVersion;
  assert.deepEqual(aa, aaGolden);
  assert.deepEqual(market, marketGolden);
});
