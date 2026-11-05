// New fixture identity; preserve all original workload inputs and admission requirements.
import assert from 'node:assert/strict';
import {PROFILE as FROZEN_PROFILE, ACCEPTANCE, assertRunInput as assertFrozenInput} from '../jsonb-display-mongo-http/contract.mjs';
export {ACCEPTANCE};
export const PROFILE = 'atomic79-hapi7270-jsonb-display-id-host-sdk-mongo-http-v2';
export function assertRunInput(value) {
  assert.equal(value.profile, PROFILE);
  assertFrozenInput({...value, profile: FROZEN_PROFILE});
}
