import type {AtomicObject} from '../../atomicassets/asset.js';

/** Private structural domain port. Coherence, bounded staging and abort belong to the caller. */
export type SaleRead = {readonly status: 'present'; readonly value: AtomicObject}
  | {readonly status: 'covered-absent'} | {readonly status: 'unavailable'; readonly reason: string};
export interface SaleReader {get(kind: string, key: string): Promise<SaleRead>}
export interface SaleStage extends SaleReader {
  put(kind: string, key: string, completeRecord: AtomicObject): void;
  delete(kind: string, key: string): void;
}
export interface SaleSourceEvidence {
  readonly occurrence: string;
  readonly abiDeployment: string;
  readonly abiSha256: string;
}
export interface FixedSaleContext {
  readonly marketContract: string;
  readonly assetsContract: string;
  readonly blockNum: string;
  readonly blockTimeMs: string;
  readonly blockId: string;
  readonly contractVersion: SaleSourceEvidence & {readonly version: '1.2.2'};
}
export type FixedSaleAction = 'lognewsale' | 'logsalestart' | 'cancelsale' | 'purchasesale';
export interface FixedSaleOccurrence {
  readonly kind: 'action';
  readonly contract: string;
  readonly name: FixedSaleAction;
  readonly transactionId: string;
  readonly evidence: SaleSourceEvidence;
  readonly value: AtomicObject;
}
export class FixedSaleUnavailable extends Error {
  constructor(message: string) {super(message); this.name = 'FixedSaleUnavailable';}
}
export function unavailable(message: string): never {throw new FixedSaleUnavailable(message);}
export const key = (...parts: string[]): string => JSON.stringify(parts);
export const PG_MAX = 9223372036854775807n;

/** Shallow data selection only; nested domain shapes are checked explicitly before use. */
export function object(value: unknown, allowed?: readonly string[]): AtomicObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getOwnPropertySymbols(value).length ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
    return unavailable('Expected plain domain data');
  const result: Record<string, unknown> = {};
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined || allowed && !allowed.includes(name))
      return unavailable('Unexpected domain field or accessor');
    Object.defineProperty(result, name, {value: descriptor.value, enumerable: true});
  }
  return result as AtomicObject;
}
export function text(value: unknown, empty = false): string {
  if (typeof value !== 'string' || !empty && value.length === 0 || value.includes('\0')) return unavailable('Expected domain text');
  return value;
}
export function uint(value: unknown, maximum = PG_MAX): string {
  const result = text(value);
  if (!/^(0|[1-9][0-9]*)$/.test(result) || BigInt(result) > maximum) return unavailable('Expected exact supported unsigned integer');
  return result;
}
export function hash(value: unknown): string {
  const result = text(value);
  if (!/^[0-9a-f]{64}$/.test(result)) return unavailable('Missing source digest');
  return result;
}
export function strings(value: unknown): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length ||
    Object.keys(value).length !== value.length || Object.keys(value).some((name, index) => name !== String(index)))
    return unavailable('Expected dense domain string array');
  return Array.from({length: value.length}, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) return unavailable('Unexpected array accessor');
    return text(descriptor.value);
  });
}
export function fraction(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : unavailable('Expected finite fee');
}
export function bool(value: unknown): boolean {return typeof value === 'boolean' ? value : unavailable('Expected boolean');}
export function marketplace(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : text(value);
}
export function source(value: unknown): SaleSourceEvidence {
  const row = object(value, ['occurrence','abiDeployment','abiSha256']);
  return {occurrence: text(row.occurrence), abiDeployment: text(row.abiDeployment), abiSha256: hash(row.abiSha256)};
}
export async function read(reader: SaleReader, kind: string, identity: string): Promise<AtomicObject | null> {
  const result = object(await reader.get(kind, identity), ['status','value','reason']);
  if (result.status === 'covered-absent') {
    if (Object.keys(result).length !== 1) return unavailable('Malformed absence tag');
    return null;
  }
  if (result.status !== 'present') return unavailable('Unavailable relationship coverage: ' + kind);
  if (Object.keys(result).length !== 2 || !Object.hasOwn(result, 'value')) return unavailable('Malformed present tag');
  return object(result.value);
}
