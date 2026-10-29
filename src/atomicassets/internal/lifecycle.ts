import {formatAsset, type AtomicAsset, type AtomicAssetInput, type AtomicObject} from '../asset.js';
import {reduceTemplateRow,readTemplateForAsset,templateId} from './templates.js';
import {actionMetadataInput, databaseMetadata} from './database-json.js';
import {reduceAuthorSwap} from './collections.js';
import {block, decimal, domainKey, evidence, format, hash, read, record, records, metadataInputRecord, required, strings, text,
  unavailable, type DomainReader, type DomainStage, type LifecycleBlock, type LifecycleEvent,
  type MetadataCodec} from './lifecycle-port.js';

const CODEC = '2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573';
const rowPriorities = {config: 10, collections: 20, authorswaps:20, schemas: 20, schematypes: 20, templates:40, templates2:40} as const;
const actionPriorities = {logmint: 50, logsetdata: 60, logtransfer: 60, logburnasset: 60} as const;
const updated = (b: LifecycleBlock) => ({updated_at_block: b.blockNum, updated_at_time: b.blockTimeMs});
const bool = (v: unknown): boolean => typeof v === 'boolean' ? v : unavailable('Expected boolean');
const fraction = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : unavailable('Expected finite fraction');

function attributes(codec: MetadataCodec, value: unknown): AtomicObject {
  if (!Array.isArray(value)) return unavailable('Expected metadata attribute array');
  const rows = value.map(metadataInputRecord);
  // Restrict this engineering tracer before the legacy codec can stringify an already
  // rounded numeric uint64, or pass an unknown variant through as successful metadata.
  for (const row of rows) {
    text(Object.hasOwn(row, 'key') ? row.key : row.first);
    const tuple = Object.hasOwn(row, 'value') ? row.value : row.second;
    if (!Array.isArray(tuple) || tuple.length !== 2) unavailable('Malformed attribute tuple');
    const [kind, data] = tuple as readonly unknown[];
    if (kind === 'int64' || kind === 'uint64' || kind === 'INT64_VEC' || kind === 'UINT64_VEC') {
      const vector = kind.endsWith('_VEC');
      if (vector && !Array.isArray(data)) unavailable('Malformed integer vector');
      for (const item of vector ? data as unknown[] : [data]) {
        const exact = typeof item === 'string' ? item : unavailable('Expected exact integer string');
        if (!/^(0|-?[1-9][0-9]*)$/.test(exact)) unavailable('Expected exact integer string');
        const n = BigInt(exact), signed = kind === 'int64' || kind === 'INT64_VEC';
        if (n < (signed ? -9223372036854775808n : 0n) || n > (signed ? 9223372036854775807n : 18446744073709551615n))
          unavailable('Attribute integer outside its exact range');
      }
    } else if (kind === 'string') {
      if (data !== null && typeof data !== 'string') unavailable('Unsupported string attribute');
    } else if (kind === 'float32' || kind === 'float64' || kind === 'FLOAT_VEC' || kind === 'DOUBLE_VEC') {
      const vector = kind.endsWith('_VEC');
      if (vector && !Array.isArray(data)) unavailable('Malformed float vector');
      for (const item of vector ? data as unknown[] : [data])
        if (typeof item !== 'string' && typeof item !== 'number') unavailable('Malformed float attribute');
    } else unavailable('Attribute variant outside this tracer');
  }
  try {return databaseMetadata(codec.attributes(rows));}
  catch {return unavailable('Metadata codec refused the supported input');}
}

async function schemaFor(stage: DomainReader, b: LifecycleBlock, collection: string, schema: string, digest: unknown) {
  const row = await required(stage, 'schema', domainKey(b.contract, collection, schema));
  if (row.contract !== b.contract || row.collection_name !== collection || row.schema_name !== schema)
    unavailable('Mismatched schema relationship');
  if (row.schema_digest !== hash(digest)) unavailable('Schema evidence does not match the staged format');
  format(row.format);
  return row;
}

/**
 * INTERNAL restricted asset/template reducer. The caller supplies the pinned codec and an
 * SDK-owned transactional staging view. Any throw discards that entire view, including
 * already staged writes. This function owns no commit, retry, identity fence or rollback.
 */
export async function reduceAssetLifecycle(b: LifecycleBlock, events: readonly LifecycleEvent[],
  stage: DomainStage, codec: MetadataCodec): Promise<void> {
  b = record(b) as unknown as LifecycleBlock;
  block(b);
  if (codec?.sha256 !== CODEC) unavailable('Unpinned metadata codec');
  if (!Array.isArray(events)) unavailable('Missing lifecycle occurrences');
  // Detach before awaits; later caller mutation must not change an occurrence being reduced.
  const jobs = events.map((event, index) => {
    const raw = metadataInputRecord(event), {value: payload, ...header} = raw;
    const checked = record(header);
    const value = {...checked, value: checked.kind === 'action' ? actionMetadataInput(text(checked.name), payload) : record(payload)} as unknown as LifecycleEvent;
    evidence(value.evidence);
    let priority: number;
    if (value.kind === 'row') {
      if (typeof value.table !== 'string' || !Object.hasOwn(rowPriorities, value.table)) return unavailable('Unsupported lifecycle row');
      priority = rowPriorities[value.table];
      text(value.scope); bool(value.present);
    } else if (value.kind === 'action') {
      if (typeof value.name !== 'string' || !Object.hasOwn(actionPriorities, value.name)) return unavailable('Unsupported lifecycle action');
      priority = actionPriorities[value.name];
      hash(value.transactionId);
    } else return unavailable('Unsupported lifecycle kind');
    return {event: value, index, priority};
  }).sort((a, z) => a.priority - z.priority || a.index - z.index);
  const mintBuffer: {asset: AtomicObject; mint: AtomicObject}[] = [];
  async function flushMints() {
    for (const {asset, mint} of mintBuffer) {
      const key = domainKey(b.contract, decimal(asset.asset_id));
      stage.put('asset', key, record(asset));
      // Original mints are immutable facts: ON CONFLICT DO NOTHING.
      if (await read(stage, 'mint', key) === null) stage.put('mint', key, record(mint));
    }
    mintBuffer.length = 0;
  }
  for (const {event, priority} of jobs) {
    if (priority > 50 && mintBuffer.length) await flushMints();
    const v = event.value;
    if (event.kind === 'row') {
      if (event.table === 'authorswaps') {
        await reduceAuthorSwap(b,event,stage);continue;
      }
      if (event.table === 'templates' || event.table === 'templates2') {
        await reduceTemplateRow(b,event,stage,codec);continue;
      }
      if (!event.present) unavailable('Original processor refuses deletion of ' + event.table);
      if (event.table === 'config') {
        // This private row holds only the collection decoder dependency. Token indexing is outside this slice.
        stage.put('config', domainKey(b.contract), {collection_format: format(v.collection_format)});
      } else if (event.table === 'collections') {
        const name = text(v.collection_name), key = domainKey(b.contract, name);
        const config = await required(stage, 'config', domainKey(b.contract));
        const bytes = v.serialized_data;
        const hex = typeof bytes === 'string' ? bytes : Array.isArray(bytes)
          ? bytes.map(byte => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255
            ? byte.toString(16).padStart(2, '0') : unavailable('Invalid serialized collection data')).join('')
          : unavailable('Missing serialized collection data');
        if (!/^(?:[0-9a-f]{2})*$/.test(hex)) unavailable('Invalid serialized collection data');
        let data: AtomicObject;
        try {data = databaseMetadata(codec.collection(hex, format(config.collection_format)));}
        catch {return unavailable('Collection codec refused the supported input');}
        const old = await read(stage, 'collection', key);
        stage.put('collection', key, {contract: b.contract, collection_name: name, author: text(v.author),
          allow_notify: bool(v.allow_notify), authorized_accounts: strings(v.authorized_accounts), notify_accounts: strings(v.notify_accounts),
          market_fee: fraction(v.market_fee), data, new_author_name: old?.new_author_name ?? null,
          new_author_date: old?.new_author_date ?? null,
          created_at_block: old ? decimal(old.created_at_block) : b.blockNum,
          created_at_time: old ? decimal(old.created_at_time) : b.blockTimeMs});
      } else {
        const collection = event.scope, name = text(v.schema_name), key = domainKey(b.contract, collection, name);
        const old = await read(stage, 'schema', key);
        if (event.table === 'schemas') {
          stage.put('schema', key, {contract: b.contract, collection_name: collection, schema_name: name,
            format: format(v.format), types: old?.types ?? [], schema_digest: hash(event.evidence.schemaDigest),
            created_at_block: old ? decimal(old.created_at_block) : b.blockNum,
            created_at_time: old ? decimal(old.created_at_time) : b.blockTimeMs});
        } else if (old) stage.put('schema', key, {...old, types: records(v.format_type)});
      }
    } else if (event.name === 'logmint') {
      const template = v.template_id === -1 ? null : templateId(v.template_id);
      const collection = text(v.collection_name), schema = text(v.schema_name), id = decimal(v.asset_id);
      await schemaFor(stage, b, collection, schema, event.evidence.schemaDigest);
      const asset = {contract: b.contract, asset_id: id, collection_name: collection, schema_name: schema,
        template_id: template, owner: text(v.new_asset_owner), mutable_data: attributes(codec, v.mutable_data),
        immutable_data: attributes(codec, v.immutable_data), template_mint: null,
        burned_by_account: null, burned_at_block: null, burned_at_time: null,
        transferred_at_block: b.blockNum, transferred_at_time: b.blockTimeMs,
        ...updated(b), minted_at_block: b.blockNum, minted_at_time: b.blockTimeMs};
      mintBuffer.push({asset, mint: {contract: b.contract, asset_id: id, minter: text(v.authorized_minter),
        receiver: text(v.new_asset_owner), txid: event.transactionId}});
    } else if (event.name === 'logtransfer') {
      const from = text(v.from), to = text(v.to);
      for (const id of strings(v.asset_ids).map(decimal)) {
        const key = domainKey(b.contract, id), old = await read(stage, 'asset', key);
        if (old && old.owner === from) stage.put('asset', key, {...old, owner: to,
          transferred_at_block: b.blockNum, transferred_at_time: b.blockTimeMs, ...updated(b)});
      }
      // Transfer history and notifications are separate occurrence effects, not asset-state writes.
    } else if (event.name === 'logsetdata') {
      const key = domainKey(b.contract, decimal(v.asset_id)), old = await read(stage, 'asset', key);
      if (!old) continue; // Covered absent UPDATE affects zero rows, unlike unknown coverage.
      await schemaFor(stage, b, text(old.collection_name), text(old.schema_name), event.evidence.schemaDigest);
      stage.put('asset', key, {...old, mutable_data: attributes(codec, v.new_data), ...updated(b)});
    } else if (event.name === 'logburnasset') {
      const key = domainKey(b.contract, decimal(v.asset_id)), old = await read(stage, 'asset', key);
      if (!old) continue;
      stage.put('asset', key, {...old, owner: null, burned_by_account: text(v.asset_owner),
        burned_at_block: b.blockNum, burned_at_time: b.blockTimeMs, ...updated(b)});
    } else unavailable('Unsupported lifecycle action');
  }
  if (mintBuffer.length) await flushMints();
  // Deferred original FK constraints: validate final staged dependencies, not intermediate order.
  for (const {event} of jobs) {
    if (event.kind === 'row' && event.table === 'templates' && event.present) {
      const template = await required(stage,'template',domainKey(b.contract,templateId(event.value.template_id)));
      await required(stage,'collection',domainKey(b.contract,text(template.collection_name)));
    }
    if (event.kind === 'row' && event.table === 'schemas')
      await required(stage, 'collection', domainKey(b.contract, event.scope));
    if (event.kind === 'action' && event.name === 'logmint') {
      await required(stage, 'collection', domainKey(b.contract, text(event.value.collection_name)));
      if (event.value.template_id !== -1) await required(stage,'template',domainKey(b.contract,templateId(event.value.template_id)));
    }
  }
}

const pgText = (value: unknown): string | null => value === undefined || value === null ? null
  : typeof value === 'string' ? value : unavailable('Nontext selected collection metadata is outside this tracer');

/** INTERNAL fixed light-view assembly; caller's read view must fence every awaited lookup. */
export async function assembleAssetLightView(reader: DomainReader, contract: string, assetId: string): Promise<AtomicAssetInput | null> {
  text(contract); decimal(assetId);
  const key = domainKey(contract, assetId), asset = await read(reader, 'asset', key);
  if (!asset) return null;
  if (asset.contract !== contract || asset.asset_id !== assetId)
    return unavailable('Unsupported or mismatched asset row');
  const template = asset.template_id === null ? null : await readTemplateForAsset(reader,contract,text(asset.template_id));
  const collection = await required(reader, 'collection', domainKey(contract, text(asset.collection_name)));
  const schema = await required(reader, 'schema', domainKey(contract, text(asset.collection_name), text(asset.schema_name)));
  if (collection.contract !== contract || collection.collection_name !== asset.collection_name || schema.contract !== contract ||
    schema.collection_name !== asset.collection_name || schema.schema_name !== asset.schema_name) unavailable('Mismatched required relationship');
  hash(schema.schema_digest);
  // Explicit complete absence for this restricted fixture; never infer absence from a missing join.
  for (const kind of ['template-link', 'backed-tokens', 'original-mint'])
    if (await read(reader, kind, key) !== null) unavailable('Unsupported relationship: ' + kind);
  const data = record(collection.data), view: AtomicObject = {
    contract, asset_id: assetId, owner: asset.owner === null ? null : text(asset.owner),
    is_transferable: template?.is_transferable ?? true, is_burnable: template?.is_burnable ?? true, collection_name: asset.collection_name,
    collection: {collection_name: collection.collection_name, name: pgText(data.name), img: pgText(data.img), images: pgText(data.images),
      author: text(collection.author), allow_notify: bool(collection.allow_notify), authorized_accounts: strings(collection.authorized_accounts),
      notify_accounts: strings(collection.notify_accounts), market_fee: fraction(collection.market_fee),
      created_at_block: decimal(collection.created_at_block), created_at_time: decimal(collection.created_at_time)},
    schema_name: asset.schema_name, schema: {schema_name: schema.schema_name, format: format(schema.format), types: records(schema.types),
      created_at_block: decimal(schema.created_at_block), created_at_time: decimal(schema.created_at_time)},
    template_id: asset.template_id, template, mutable_data: record(asset.mutable_data), immutable_data: record(asset.immutable_data),
    template_mint: asset.template_mint === null ? '0' : decimal(asset.template_mint), backed_tokens: [],
    burned_by_account: asset.burned_by_account, burned_at_block: asset.burned_at_block, burned_at_time: asset.burned_at_time,
    updated_at_block: decimal(asset.updated_at_block), updated_at_time: decimal(asset.updated_at_time),
    transferred_at_block: decimal(asset.transferred_at_block), transferred_at_time: decimal(asset.transferred_at_time),
    minted_at_block: decimal(asset.minted_at_block), minted_at_time: decimal(asset.minted_at_time), original_mint: null};
  if (view.burned_by_account !== null) text(view.burned_by_account);
  if (view.burned_at_block !== null) decimal(view.burned_at_block);
  if (view.burned_at_time !== null) decimal(view.burned_at_time);
  return record(view) as AtomicAssetInput;
}

export async function readLifecycleAsset(reader: DomainReader, contract: string, assetId: string): Promise<AtomicAsset | null> {
  const view = await assembleAssetLightView(reader, contract, assetId);
  return view === null ? null : formatAsset(view);
}
