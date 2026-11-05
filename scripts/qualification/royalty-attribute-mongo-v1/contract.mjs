import assert from 'node:assert/strict';
export {LIMITS,IMAGE,expectedHead,assertOwnedUri,assertChildReceipt,sha} from '../jsonb-display-bson-v3/contract.mjs';
export const PROFILE='atomicmarket-royalty-attribute-b55-hapi06-native-v1';
export const CI_PROFILE='atomicmarket-royalty-attribute-owned-linux-v1';
export const RUN_PROFILE='atomicmarket-royalty-attribute-six-case-native-http-v1';
export const PINS=Object.freeze({atomic:'b55fab683828cddeba292f9e5a7761e14a008aa1',atomicTree:'2ce0eaaa7a67ab3957a31ae7f2a103a239f83e19',hapi:'06a3c96eb44947740fa8daaf4f3956dda69e3f6b',hapiTree:'b8ca77a8b15d6d08d12f5b25ec72528e3c95f241',sdk:'cbfb26694b90b52266d1e0b9b5dbf6f8389e736b',original:'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e'});
export const ACCEPTANCE=Object.freeze({scope:'six-original-attribute-cases-with-four-constructed-source-stages',physicalMongoHTTP:'pending',sourceAuthority:'controlled-synthetic-only',rawWireBSON:'not-claimed',textProfileEquivalence:'pending-outside-this-input',fullAtomicParity:'pending',WireReplay:'none',productionOffers:'empty'});
export function assertRunInput(value){
 assert.equal(value.profile,RUN_PROFILE);assert.match(value.databaseName,/^h45_indexed_[a-f0-9]{12}$/);
 assert.equal(value.inputProfile,'original-lifecycle');
 for(const field of ['commit','tree'])assert.match(value.reviewedHarness?.[field],/^[a-f0-9]{40}$/);
 for(const field of ['guard','persist','persistBinary'])assert.equal(typeof value[field],'function');
}
