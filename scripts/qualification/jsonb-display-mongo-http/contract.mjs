// Named controlled-input consumer, not a production capability or deployment declaration.
import assert from 'node:assert/strict';
export const PROFILE = 'atomic79-hapi7270-jsonb-display-id-mongo-http-v1';
export const PINS = Object.freeze({atomic: 'a410e16497bd2a6529b72691bad03507f90dcc7f',
  atomicTree: '64cdd7076a3bfbc20ff44c4591a3bdc25c4d4644',
  hapi: '7270b1eba0e4e118e61fd282dbf44a66f361df47', hapiTree: 'e4039b76850b365806cfb10e65702751e604a99d',
  sdk: 'cbfb26694b90b52266d1e0b9b5dbf6f8389e736b', reference: '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e'});
export const DISPLAY_EMISSIONS = Object.freeze(['atomicassets/internal/lifecycle.js', 'atomicassets/internal/collections.js',
  'atomicassets/internal/templates.js', 'atomicassets/internal/schema-query.js', 'atomicmarket/internal/fixed-sale.js',
  'atomicmarket/internal/auctions.js', 'atomicmarket/internal/buyoffers.js']);
export const ACCEPTANCE = Object.freeze({scope: 'controlled-source-collection-id-and-asset-id',
  physicalMongoHTTP: 'pending', originalSQLCases: 63, originalSQLAccepted: 51, originalSQLRefused: 12,
  sourceRepresentableAccepted: 27, sourceRepresentableRefused: 6, otherSQLCases: 30,
  sourceAuthority: 'synthetic-only', rawNumericProbes: 'separate-original-SQL-evidence',
  otherFiveDisplayJoins: 'pending', retainedImportedState: 'pending', fullAtomicParity: 'pending',
  redisCache: 'not-mounted', WireReplay: 'none', release: 'pending'});
export function assertRunInput(value) {
  assert.equal(value.profile, PROFILE); assert.match(value.databaseName, /^h45_indexed_[a-f0-9]{12}$/);
  assert(['original-lifecycle', 'portable-safe-image'].includes(value.inputProfile));
  for (const key of ['commit', 'tree']) assert.match(value.reviewedHarness?.[key], /^[a-f0-9]{40}$/);
  for (const key of ['guard', 'persist']) assert.equal(typeof value[key], 'function');
}
