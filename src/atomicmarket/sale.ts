import type {AtomicObject, AtomicValue} from '../atomicassets/asset.js';

export type AtomicSaleState = 0 | 1 | 2 | 3 | 4;

export interface AtomicSalePrice extends AtomicObject {
  readonly token_contract?: string;
  readonly token_symbol?: string;
  readonly token_precision?: number;
  readonly amount?: string | null | undefined;
}

/** An already assembled row: prices and ordered asset relationships are supplied by the caller. */
export interface AtomicSaleInput extends AtomicObject {
  readonly market_contract: string;
  readonly assets_contract: string;
  readonly sale_id: string;
  readonly offer_id: string;
  readonly seller: string;
  readonly buyer?: string | null;
  readonly sale_state: number | null;
  readonly offer_state?: number | null;
  readonly raw_price?: string | null;
  readonly raw_token_symbol?: string;
  readonly raw_token_precision?: number;
  readonly price: AtomicSalePrice;
  readonly assets: readonly AtomicValue[];
}

export interface AtomicSale extends AtomicObject {
  readonly market_contract: string;
  readonly assets_contract: string;
  readonly sale_id: string;
  readonly offer_id: string;
  readonly seller: string;
  readonly buyer?: string | null;
  readonly state: AtomicSaleState;
  readonly price: AtomicSalePrice & {readonly amount: string | null | undefined};
  readonly assets: readonly AtomicValue[];
}

/** Original 2.7.0 formatSale output, without mutating the caller or granting serving authority. */
export function formatSale(row: AtomicSaleInput): AtomicSale {
  const {raw_price, sale_state, offer_state, ...data} = structuredClone(row);
  const price = Object.assign(data.price, {amount: raw_price});
  let state: AtomicSaleState;
  if (sale_state === 0) state = 0;
  else if (sale_state === 1 && offer_state === 0) state = 1;
  else if (sale_state === 2) state = 2;
  else if (sale_state === 3) state = 3;
  else state = 4;
  delete data.raw_token_symbol;
  delete data.raw_token_precision;
  return {...data, price, state};
}
