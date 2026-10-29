import type {AtomicObject} from '../../atomicassets/asset.js';
import type {DomainReader, DomainStage} from '../../atomicassets/internal/lifecycle-port.js';
import {domainKey, record} from '../../atomicassets/internal/lifecycle-port.js';

export class MarketplaceStateUnavailable extends Error {
  constructor(message: string) {super(message); this.name = 'MarketplaceStateUnavailable';}
}
const unavailable = (message: string): never => {throw new MarketplaceStateUnavailable(message);};
const text = (value: unknown): string => typeof value === 'string' && !value.includes('\0')
  ? value : unavailable('Expected original marketplace text');
function integer(value: unknown): string {
  const selected = text(value);
  if (!/^(0|[1-9][0-9]*)$/.test(selected) || BigInt(selected) > 9223372036854775807n)
    return unavailable('Expected exact supported marketplace creation integer');
  return selected;
}
async function read(reader: DomainReader, contract: string, name: string): Promise<AtomicObject | null> {
  const found = await reader.get('marketplace', domainKey(contract, name));
  if (found.status === 'covered-absent' && Object.keys(found).length === 1) return null;
  if (found.status !== 'present' || Object.keys(found).length !== 2)
    return unavailable('Unavailable marketplace coverage');
  const value = record(found.value);
  if (value.market_contract !== contract || value.marketplace_name !== name)
    return unavailable('Mismatched marketplace identity');
  text(value.creator); integer(value.created_at_block); integer(value.created_at_time);
  return value;
}

/** Original TABLE_MARKETPLACES priority +10; caller orders jobs and owns staged discard. */
export async function reduceMarketplace(
  block: {readonly contract: string; readonly blockNum: string; readonly blockTimeMs: string},
  value: AtomicObject,
  stage: DomainStage,
): Promise<void> {
  const contract = text(block.contract), name = text(value.marketplace_name), creator = text(value.creator);
  const number = integer(block.blockNum), time = integer(block.blockTimeMs);
  const previous = await read(stage, contract, name);
  stage.put('marketplace', domainKey(contract, name), {market_contract: contract, marketplace_name: name, creator,
    created_at_block: previous?.created_at_block ?? number, created_at_time: previous?.created_at_time ?? time});
}

/** Four original PostgreSQL response scalars, read within the host's existing coherent composition. */
export async function readMarketplaceState(reader: DomainReader, contract: string, name: string): Promise<AtomicObject | null> {
  // Original database NUL behavior is outside this component's explicitly supported string profile.
  text(contract); text(name);
  const row = await read(reader, contract, name);
  return row === null ? null : {marketplace_name: row.marketplace_name, creator: row.creator,
    created_at_block: row.created_at_block, created_at_time: row.created_at_time};
}
