import assert from 'node:assert/strict';
import {PROFILE as priorProfile, ACCEPTANCE, assertRunInput as prior} from '../jsonb-display-bson-v3/run-contract-v3.mjs';
export {ACCEPTANCE};
export const PROFILE = 'atomic85-626-jsonb-id-bson-host-sdk-mongo-http-v1';
export function assertRunInput(value) {assert.equal(value.profile, PROFILE); prior({...value, profile: priorProfile});}
