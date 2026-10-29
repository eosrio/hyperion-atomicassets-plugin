import type {AtomicObject, AtomicSchemaField} from '../asset.js';

/** Private domain seam, not an SDK contract or public package export. */
export type DomainRead = {readonly status: 'present'; readonly value: AtomicObject}
  | {readonly status: 'covered-absent'} | {readonly status: 'unavailable'; readonly reason: string};
export interface DomainReader {
  /** All reads must belong to one SDK-owned coherent view; unknown coverage is never absence. */
  get(kind: string, key: string): Promise<DomainRead>;
}
export interface DomainStage extends DomainReader {
  /** Complete logical rows; staged writes shadow base reads, in order. Discard on any failure. */
  put(kind: string, key: string, value: AtomicObject): void;
  delete(kind: string, key: string): void;
}
export interface MetadataCodec {
  readonly sha256: '2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573';
  attributes(value: readonly AtomicObject[]): unknown;
  collection(hex: string, format: readonly AtomicSchemaField[]): unknown;
}
export interface OccurrenceEvidence {
  readonly occurrence: string;
  readonly abiDeployment: string;
  readonly abiSha256: string;
  /** Digest of the applicable schema format, supplied by the source binding. */
  readonly schemaDigest?: string;
}
export interface LifecycleBlock {
  readonly contract: string;
  readonly blockNum: string;
  readonly blockTimeMs: string;
  readonly blockId: string;
}
export type LifecycleEvent = {readonly evidence: OccurrenceEvidence; readonly value: AtomicObject} & (
  {readonly kind: 'row'; readonly table: 'config' | 'collections' | 'authorswaps' | 'schemas' | 'schematypes' | 'templates' | 'templates2';
    readonly scope: string; readonly present: boolean}
  | {readonly kind: 'action'; readonly name: 'logmint' | 'logsetdata' | 'logtransfer' | 'logburnasset';
    readonly transactionId: string});

export class AssetDomainUnavailable extends Error {
  constructor(message: string) {super(message); this.name = 'AssetDomainUnavailable';}
}
export const unavailable = (message: string): never => {throw new AssetDomainUnavailable(message);};
export const domainKey = (...parts: string[]): string => JSON.stringify(parts);

export function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return unavailable('Missing domain string');
  return value;
}
export function decimal(value: unknown): string {
  const result = text(value);
  if (!/^(0|[1-9][0-9]*)$/.test(result) || BigInt(result) > 18446744073709551615n)
    return unavailable('Invalid exact unsigned integer');
  return result;
}
export function hash(value: unknown): string {
  const result = text(value);
  if (!/^[0-9a-f]{64}$/.test(result)) return unavailable('Missing source or schema digest');
  return result;
}

/** Own plain JSON data without invoking getters or silently dropping malformed leaves. */
function copy(value: unknown, ancestors: Set<object>, metadataInput = false): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (!metadataInput && (value.includes('\0') || value.includes('\\u0000'))) return unavailable('NUL metadata requires the original field encoder');
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  if (typeof value !== 'object' || ancestors.has(value)) return unavailable('Expected acyclic JSON domain data');
  if (Object.getOwnPropertySymbols(value).length ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
    return unavailable('Expected plain JSON domain data');
  if (Array.isArray(value) && (Object.keys(value).length !== value.length ||
    Object.keys(value).some((key, index) => key !== String(index)))) return unavailable('Expected dense JSON array');
  ancestors.add(value);
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue;
    if (!descriptor.enumerable || !('value' in descriptor)) return unavailable('Expected data properties');
    copy(key, ancestors, metadataInput);
    Object.defineProperty(result, key, {value: copy(descriptor.value, ancestors, metadataInput), enumerable: true, writable: true, configurable: true});
  }
  if (Array.isArray(value) && Object.keys(result).length !== value.length) return unavailable('Sparse array');
  ancestors.delete(value);
  return result;
}
export function record(value: unknown): AtomicObject {
  const result = copy(value, new Set());
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return unavailable('Expected domain record');
  return result as AtomicObject;
}
/** Raw metadata snapshot only; callers must validate non-metadata fields with record(). */
export function metadataInputRecord(value: unknown): AtomicObject {
  const result = copy(value, new Set(), true);
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return unavailable('Expected metadata input record');
  return result as AtomicObject;
}
export function records(value: unknown): AtomicObject[] {
  if (!Array.isArray(value)) return unavailable('Expected domain array');
  return value.map(record);
}
export function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return unavailable('Expected string array');
  return value.map(text);
}
export function format(value: unknown): AtomicSchemaField[] {
  return records(value).map(row => ({...row, name: text(row.name), type: text(row.type)}));
}
export function evidence(value: OccurrenceEvidence): void {
  text(value?.occurrence); text(value?.abiDeployment); hash(value?.abiSha256);
}
export function block(value: LifecycleBlock): void {
  text(value?.contract); hash(value?.blockId); decimal(value?.blockNum); decimal(value?.blockTimeMs);
  if (BigInt(value.blockTimeMs) > 8640000000000000n) unavailable('Invalid normalized block time');
}
export async function read(reader: DomainReader, kind: string, key: string): Promise<AtomicObject | null> {
  const result = await reader.get(kind, key);
  if (result?.status === 'covered-absent') return null;
  if (result?.status !== 'present') return unavailable('Unavailable domain coverage: ' + kind);
  return record(result.value);
}
export async function required(reader: DomainReader, kind: string, key: string): Promise<AtomicObject> {
  return await read(reader, kind, key) ?? unavailable('Missing required relationship: ' + kind);
}
