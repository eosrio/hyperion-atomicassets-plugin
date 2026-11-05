// New lossless-capture identity; original domain input and acceptance requirements remain binding.
import assert from 'node:assert/strict';
import {PROFILE as FROZEN_PROFILE, ACCEPTANCE, assertRunInput as assertFrozenInput} from '../jsonb-display-mongo-http/contract.mjs';
export {ACCEPTANCE};
export const PROFILE = 'atomic79-hapi7270-jsonb-display-id-bson-host-sdk-mongo-http-v3';
export function assertRunInput(value) {
  assert.equal(value.profile, PROFILE); assert.equal(typeof value.persistBinary, 'function');
  assertFrozenInput({...value, profile: FROZEN_PROFILE});
}
