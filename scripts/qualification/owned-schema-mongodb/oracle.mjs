// Shared differential verifier; callers must provide actual native observations.
// This module neither starts MongoDB nor grants authority to execute a fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const PG_REPORT_SHA256 = 'dcfc8813f9c4fff797d563bb52f979e98cfca9e3071b2f9b06df4037ce7fec93';
export const SNAPSHOTS = Object.freeze(['empty','insert','transfer','burn-one','burn-last','after-rollback','delete-alpha','delete-beta']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = rows => [...rows].sort((a,b)=>a.schema_name < b.schema_name ? -1 : a.schema_name > b.schema_name ? 1 : 0);
function unique(rows) { assert.equal(new Set(rows.map(row=>row.schema_name)).size, rows.length, 'duplicate schema'); }
export function loadOriginalOracle(bytes=readFileSync(new URL('../../../tests/fixtures/owned-schema-pg71-report.json',import.meta.url))) {
 assert.equal(hash(bytes), PG_REPORT_SHA256, 'original PostgreSQL evidence bytes');
 const oracle=JSON.parse(bytes).ownedSchema;
 assert.equal(oracle.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
 assert.equal(oracle.status,'passed');
 assert.deepEqual(oracle.snapshots.map(snapshot=>snapshot.name),SNAPSHOTS);
 return oracle.snapshots;
}
// The original query has no ORDER BY. Compare complete sets and retain exact counts;
// no claim is made that Mongo simple collation matches the PostgreSQL server collation.
export function verifySnapshot(expected, observed) {
 assert.equal(observed.name, expected.name);
 assert.equal(observed.statusCode, 200);
 assert.equal(observed.body?.success, true);
 assert.ok(Array.isArray(observed.body.data));
 const actual=observed.body.data.map(row=>{assert.deepEqual(Object.keys(row),['schema_name']);assert.equal(typeof row.schema_name,'string');return row;});
 const counts=observed.counts.map(row=>{assert.deepEqual(Object.keys(row).sort(),['owned','schema_name']);assert.match(row.owned,/^(0|[1-9][0-9]*)$/);return row;});
 unique(actual); unique(counts);
 assert.deepEqual(sorted(actual),sorted(expected.handlerRows),`${expected.name}: HTTP membership`);
 assert.deepEqual(sorted(counts),sorted(expected.counts),`${expected.name}: owned counts`);
 return {name:expected.name,rows:actual.length,counts:counts.length};
}
// Runner supplies lifecycle transitions, actual Fastify inject, and native count reads.
// It owns source/coverage/publication checks and must persist evidence independently.
export async function compareSnapshots(driver) {
 const oracle=loadOriginalOracle(), evidence=[];
 for (const expected of oracle) {
  await driver.advance(expected.name);
  const observation=await driver.observe(expected.name);
  evidence.push(verifySnapshot(expected,observation));
 }
 return evidence;
}
