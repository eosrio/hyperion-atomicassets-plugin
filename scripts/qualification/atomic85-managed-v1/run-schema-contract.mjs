import assert from 'node:assert/strict';
import {PROFILE as priorProfile, ACCEPTANCE, assertRunInput as prior} from '../schema-id-mongo-v1/contract.mjs';
export {ACCEPTANCE};
export const PROFILE = 'atomic85-626-schema-id-display-host-sdk-mongo-v1';
export function assertRunInput(value) {assert.equal(value.profile, PROFILE); prior({...value, profile: priorProfile});}
