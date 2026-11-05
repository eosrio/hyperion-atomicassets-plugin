// A new current-product qualification identity; no prior physical result is adopted.
import {PINS as priorPins} from '../jsonb-display-mongo-http/contract.mjs';
export {DISPLAY_EMISSIONS} from '../jsonb-display-mongo-http/contract.mjs';
export {LIMITS, IMAGE, expectedHead, assertOwnedUri, assertChildReceipt, sha} from '../jsonb-display-bson-v3/contract.mjs';
export const PRODUCT = '6261491b37e85c735bad563152147c9c59822f6e';
export const PRODUCT_TREE = 'fa01541686ed5ee2eadb3fb09f29a1e960f7d6d4';
export const PROFILE = 'atomic85-626-hapi7270-managed-assembly-v1';
export const CI_PROFILE = 'atomic85-626-owned-jsonb-bson-managed-linux-v1';
export const SCHEMA_CI_PROFILE = 'atomic85-626-schema-id-managed-linux-v1';
export const PINS = Object.freeze({...priorPins, atomic: PRODUCT, atomicTree: PRODUCT_TREE});
export const FROZEN_ASSEMBLY = 'scripts/qualification/jsonb-display-mongo-http/profile.json';
export const FROZEN_ASSEMBLY_SHA256 = '638329108ebcb9ec5810b7ec10b2842c126dd300665149d6c43072b1682f14ae';
