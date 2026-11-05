import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupOwnedDatabase} from './cleanup.mjs';

function fixture({persistFailure = false, markerMismatch = false, physicalFailure = false, openActor = false} = {}) {
  const events = [], report = {cleanup: {}}, original = new Error('native recorder failed'), failures = [original];
  return {events, report, failures, original, async run() {
    await cleanupOwnedDatabase({hosts: [{async close() {events.push('close-host'); if (openActor) throw new Error('read remains open'); return {httpClosed: true};}}],
      sessions: [{ended: true}], owned: true, marker: 'owned-marker', profile: 'v3', report,
      captureSummary: () => ({firstError: 'native recorder failed'}), retain: error => failures.push(error),
      physicalGuard() {events.push('physical-guard'); if (physicalFailure) throw new Error('physical guard failed');},
      async persist() {events.push('persist'); if (persistFailure) throw new Error('capture evidence failed');},
      database: {collection(name) {assert.equal(name, '_qualification_owner'); return {async findOne(query) {assert.equal(query._id, 'owned-marker'); events.push('marker'); return {profile: markerMismatch ? 'foreign' : 'v3'};}};},
        async dropDatabase(options) {assert.deepEqual(options.writeConcern, {w: 'majority', j: true}); events.push('drop-owned');},
        listCollections: () => ({async toArray() {events.push('confirm-empty'); return [];}})}});
  }};
}

test('recording and evidence failures do not prevent closed-actor owned database cleanup or erase the first failure', async () => {
  for (const persistFailure of [false, true]) {
    const f = fixture({persistFailure}); await f.run();
    assert(f.events.indexOf('close-host') < f.events.indexOf('drop-owned'));
    assert(f.events.indexOf('marker') < f.events.indexOf('drop-owned')); assert(f.events.includes('confirm-empty'));
    assert.equal(f.report.cleanup.databaseDropped, true); assert.equal(f.report.cleanup.evidenceComplete, !persistFailure);
    assert.equal(f.failures[0], f.original); assert.equal(f.events.filter(name => name === 'physical-guard').length, 4);
  }
});

test('cleanup never bypasses the original physical guard, marker identity or actor-closure requirement', async () => {
  for (const change of [{physicalFailure: true}, {markerMismatch: true}, {openActor: true}]) {
    const f = fixture(change); await f.run(); assert(!f.events.includes('drop-owned')); assert.notEqual(f.report.cleanup.databaseDropped, true);
  }
});
