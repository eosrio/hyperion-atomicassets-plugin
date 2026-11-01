import type {AtomicObject, AtomicSchemaField} from '../asset.js';
import {domainKey, format, read, record, text, unavailable,
  type DomainReader, type DomainStage, type LifecycleBlock, type LifecycleEvent} from './lifecycle-port.js';

type Token = {sym: string; contract: string};
type TokenRow = {token_symbol: string; token_contract: string; token_precision: number};
type ConfigState = {interfaceVersion: 1; contract: string; version: string | null;
  collection_format: AtomicSchemaField[] | null; supported_tokens: TokenRow[] | null;
  cached_tokens: Token[] | null; cached_format: AtomicSchemaField[] | null};

function varchar(input: unknown, maximum: number, empty = false): string {
  if (typeof input !== 'string' || !empty && input.length === 0 || [...input].length > maximum)
    return unavailable('Invalid original config text');
  // The existing inert domain/SDK captures also validate Unicode and the recorded NUL frontier.
  record({value: input}); return input;
}
function token(input: unknown): Token {
  const value = record(input);
  return {sym: text(value.sym), contract: varchar(value.contract, 12)};
}
function tokenRow(input: unknown): TokenRow {
  const value = record(input), precision = value.token_precision;
  if (typeof precision !== 'number' || !Number.isSafeInteger(precision) || precision < -2147483648 || precision > 2147483647)
    return unavailable('Invalid original token precision');
  return {token_symbol: varchar(value.token_symbol, 12), token_contract: varchar(value.token_contract, 12), token_precision: precision};
}
function tokens(input: unknown): Token[] {
  if (!Array.isArray(input)) return unavailable('Missing actual supported-token config');
  return input.map(input=>{const value=token(input);rowFromToken(value);return value;});
}
function rowFromToken(value: Token): TokenRow {
  // Original processors split symbol text and PostgreSQL stores precision as int4.
  const parts = value.sym.split(','), precision = parts[0]!;
  if (parts.length !== 2 || !/^(0|-?[1-9][0-9]*)$/.test(precision)) return unavailable('Malformed actual token symbol');
  const exact = BigInt(precision);
  if (exact < -2147483648n || exact > 2147483647n) return unavailable('Original token precision exceeds int4');
  return tokenRow({token_symbol: parts[1], token_contract: value.contract, token_precision: Number(exact)});
}
function state(input: unknown, contract: string): ConfigState {
  if (input === undefined) return {interfaceVersion: 1, contract, version: null, collection_format: null,
    supported_tokens: null, cached_tokens: null, cached_format: null};
  const value = record(input);
  const names = ['interfaceVersion','contract','version','collection_format','supported_tokens','cached_tokens','cached_format'];
  if (Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value,name))
    || value.interfaceVersion !== 1 || value.contract !== contract) return unavailable('Incompatible config projection state');
  if (value.supported_tokens !== null && !Array.isArray(value.supported_tokens)) return unavailable('Missing token row coverage');
  const result: ConfigState = {interfaceVersion: 1, contract, version: value.version === null ? null : varchar(value.version,64,true),
    collection_format: value.collection_format === null ? null : format(value.collection_format),
    supported_tokens: value.supported_tokens === null ? null : value.supported_tokens.map(tokenRow),
    cached_tokens: value.cached_tokens === null ? null : tokens(value.cached_tokens),
    cached_format: value.cached_format === null ? null : format(value.cached_format)};
  if ((result.supported_tokens === null) !== (result.collection_format === null)
    || (result.cached_tokens === null) !== (result.cached_format === null)
    || (result.supported_tokens === null) !== (result.cached_tokens === null)) return unavailable('Partial config source state differs');
  if (result.supported_tokens && new Set(result.supported_tokens.map(row=>row.token_symbol)).size !== result.supported_tokens.length)
    return unavailable('Duplicate canonical supported-token identity');
  return result;
}

/**
 * One bounded canonical row contains decoder data, API rows and original callback comparison state.
 * SDK staging/commit/undo owns them together; there is no process-global config cache or readiness grant.
 */
export async function reduceAssetConfig(b: LifecycleBlock, event: Extract<LifecycleEvent,{kind:'row'}>, stage: DomainStage): Promise<void> {
  if (!event.present) return unavailable('AtomicAssets: '+event.table+' row was deleted. Should not be possible by contract');
  const key = domainKey(b.contract), previous = await read(stage,'config',key), next = state(previous?.api_config,b.contract), value = event.value;
  if (event.table === 'tokenconfigs') {
    if (next.version === null && value.standard !== 'atomicassets') return unavailable('AtomicAssets: Contract not deployed on the account');
    next.version = varchar(value.version,64,true);
    stage.put('config',key,{...previous,api_config:next}); return;
  }
  if (event.table !== 'config') return unavailable('Not an AtomicAssets configuration row');
  const incomingFormat = format(value.collection_format);
  if (!Object.hasOwn(value,'supported_tokens')) {
    // Existing restricted decoder-only profiles remain usable, but never become config-API coverage.
    if (previous?.api_config !== undefined) return unavailable('Complete config source cannot lose supported-token inputs');
    stage.put('config',key,{collection_format:incomingFormat}); return;
  }
  const incomingTokens = tokens(value.supported_tokens);
  const rows = next.supported_tokens === null ? [] : next.supported_tokens.map(tokenRow);
  const retainedSymbols = new Set(rows.map(row=>row.token_symbol));
  const initialize = next.cached_tokens === null;
  if (initialize || next.cached_tokens!.length !== incomingTokens.length) {
    const previousSymbols = new Set((next.cached_tokens ?? []).map(token=>token.sym));
    for (const item of incomingTokens) if (initialize || !previousSymbols.has(item.sym)) {
      const row = rowFromToken(item);
      // Original ON CONFLICT(contract,token_symbol) DO NOTHING; never remove retained token rows.
      if (!retainedSymbols.has(row.token_symbol)) {rows.push(row);retainedSymbols.add(row.token_symbol);}
    }
  }
  if (initialize || next.cached_format!.length !== incomingFormat.length) next.collection_format = incomingFormat;
  next.supported_tokens = rows; next.cached_tokens = incomingTokens; next.cached_format = incomingFormat;
  stage.put('config',key,{collection_format:incomingFormat,api_config:next});
}

/** The entire finite token inventory is materialized at write time, never found by enumerating a kind. */
export async function readAssetConfig(reader: DomainReader, contract: string): Promise<AtomicObject | null> {
  contract = text(contract);
  const stored = await read(reader,'config',domainKey(contract)); if (stored === null) return null;
  if (stored.api_config === undefined) return unavailable('Config API requires complete config/tokenconfigs initialization');
  const selected = state(stored.api_config,contract);
  if (selected.version === null || selected.collection_format === null || selected.supported_tokens === null)
    return unavailable('Config source initialization is incomplete');
  return {contract,version:selected.version,collection_format:selected.collection_format,supported_tokens:selected.supported_tokens};
}
