import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createMarketplaceDefinition} from '../../dist/atomicmarket/marketplace-indexing.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');

/** Actual original genesis plus explicitly constructed ABI/KV sections, never a deployed Market capture.
 * Original coordinator/journal/source/provider code executes; only ES transport is in memory.
 */
export async function marketplaceSource(host) {
  const {nativeApiWireSource} = await host.load('tests/unit/protocol-native-api-source.mjs');
  const {ProtocolSourceBindingStore} = await host.load('build/indexer/protocol/source-bindings.js');
  const {ProtocolAbiObservationStore, protocolAbiCaptureDigest} = await host.load('build/indexer/protocol/abi-observation-store.js');
  const {PortableProjectionSource} = await host.load('build/indexer/projection/source.js');
  const original = await nativeApiWireSource({nativeMarker: false});
  let constructedSession;
  try {
    await original.appendUntil(1);
    const bindings = new ProtocolSourceBindingStore(original.client, original.chain);
    const observations = new ProtocolAbiObservationStore(original.client, original.chain);
    const initial = await bindings.readSelection(original.retained.get(1).selectionId);
    const {schemaJson} = initial.context, schema = JSON.parse(schemaJson);
    const followBytes = readFileSync(join(host.root, 'tests/unit/fixtures/wire-native-genesis/receipt-forward-2-4-20261020.json'));
    assert.equal(hash(followBytes), '38d75b7a1ba28e3abd77512854f963e7723631d6837df73bd7aeff656cc8a450');
    const frames = JSON.parse(followBytes).messages.filter(row => row.kind === 'block').map(entry => {
      const bytes = Buffer.from(entry.response.base64, 'base64'); assert.equal(hash(bytes), entry.response.sha256);
      return bytes;
    });
    // The retained receipt labels are not an authority; decode every original position with the actual provider.
    const session = original.provider.createShipSession(schema);
    constructedSession = session;
    const byHeight = new Map(frames.map(bytes => [Number(session.decodeResult(bytes)[1].this_block.block_num), bytes]));
    assert.deepEqual([...byHeight.keys()], [2, 3, 4]);
    const abi = JSON.parse(readFileSync(new URL('../../fixtures/harness/atomicmarket/constructed-marketplace.abi.json', import.meta.url), 'utf8'));
    const codec = original.provider.contractCodec;
    const abiHex = hex(codec.encodeAbi(abi)), abiSha256 = hash(Buffer.from(abiHex, 'hex'));
    const contract = 'atomicmarket', rows = [], retained = new Map(original.retained);
    let generation = (await original.coordinator.inspect()).generation;
    const source = new PortableProjectionSource({client: original.client, chain: original.chain,
      chainId: original.chainId, profile: original.profile, provider: original.provider});
    async function append(number, creators = [], {present = true, replacement = false, malformedRow = false} = {}) {
      assert.ok([2, 3, 4].includes(number)); assert.ok(creators.length <= 4);
      const decoded = session.decodeResult(byHeight.get(number)), result = decoded[1];
      const header = session.decodeBlock(Buffer.from(result.block, 'hex'));
      if (replacement) {
        assert.equal(number, 3); header.timestamp = '2026-10-19T18:50:17.000';
        result.block = hex(codec.encodeValue(schema, 'signed_block', header));
        result.this_block.block_id = '00000003' + hash(Buffer.from(result.block, 'hex')).slice(8);
      }
      const deltas = [];
      if (number === 2) deltas.push(['table_delta_v0', {name: 'account', rows: [{present: 1,
        data: hex(codec.encodeValue(schema, 'account', ['account_v0', {name: contract,
          creation_date: '2026-10-19T18:50:11.500', abi: abiHex}]))}]}]);
      const keyHex = hex(codec.encodeValue(abi, 'string', 'marketplace1'));
      const changes = creators.map(creator => ({marketplace_name: 'marketplace1', creator}));
      if (changes.length) deltas.push(['table_delta_v0', {name: 'contract_row_kv', rows: changes.map(value => ({present: present ? 1 : 0,
        data: hex(codec.encodeValue(schema, 'contract_row_kv', ['contract_row_kv_v0', {code: contract, payer: contract,
          table_id: 7, key: keyHex, value: present ? (malformedRow ? '00' : hex(codec.encodeValue(abi, 'marketplace', value))) : ''}]))}))}]);
      result.deltas = hex(codec.encodeValue(schema, 'table_delta[]', deltas));
      const position = {chainId: original.chainId, blockNum: number, blockId: String(result.this_block.block_id),
        previousBlockId: String(result.prev_block.block_id)};
      result.head = {block_num: number, block_id: position.blockId};
      result.last_irreversible = {block_num: 1, block_id: retained.get(1).source.blockId};
      const bytes = codec.encodeValue(schema, 'result', decoded);
      const capture = {kind: 'unattested-ship-result-sections-v1', schemaJson,
        blockHex: result.block, tracesHex: result.traces, deltasHex: result.deltas};
      const captureSha256 = protocolAbiCaptureDigest(position, capture), accountRows = [];
      let ordinal = 0;
      for (const [, delta] of session.decodeDeltas(Buffer.from(result.deltas, 'hex'))) for (const row of delta.rows) {
        const raw = Buffer.from(row.data, 'hex');
        if (delta.name === 'account') accountRows.push({ordinal, present: true, raw, value: session.decodeRow('account', raw)});
        ordinal++;
      }
      const observation = {status: 'observed', facts: original.provider.observeBlockAbi({
        traces: session.decodeTraces(Buffer.from(result.traces, 'hex')), accountRows}, position)};
      const selectionId = (await bindings.prepareSelection({schemaVersion: 1, contextId: initial.selection.contextId,
        source: position, readerSessionId: initial.selection.readerSessionId, readerRole: 'live', assignmentId: null,
        frameSha256: hash(bytes), captureSha256,
        head: {blockNum: number, blockId: position.blockId},
        irreversible: {blockNum: 1, blockId: retained.get(1).source.blockId}})).id;
      const receipt = await observations.prepare({schemaVersion: 1, protocol: original.profile,
        source: {...position, inputSha256: captureSha256}, capture, observation});
      await bindings.prepareObservationLink({schemaVersion: 1, selectionId, observationId: receipt.id, observationDigest: receipt.digest});
      const admission = await original.coordinator.admit(selectionId, generation); assert.equal(admission.status, 'accepted');
      generation = admission.generation; await original.coordinator.drain();
      const item = {source: position, selectionId, observationId: receipt.id, keyHex,
        originalTimestamp: header.timestamp, constructed: true, captureSha256, frameSha256: hash(bytes), changes};
      rows.push(item); retained.set(number, item);
      return item;
    }
    await append(2);
    const definition = createMarketplaceDefinition({id: 'marketplaces', mappingRevision: 'a'.repeat(64), marketContract: contract,
      abiDeployment: `${retained.get(2).source.blockId}:${contract}:${abiSha256}`, abiSha256});
    return {...original, retained, source, definition, append, rows, abiHex, abiSha256,
      async dispose() {session.close?.(); await original.dispose();}};
  } catch (error) {constructedSession?.close?.(); await original.dispose(); throw error;}
}
