import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {verifySchemaReports as load} from './reports.mjs';
const require=createRequire(import.meta.url),{check}=require('../../../harness/atomicassets/postgres/schema-id-json39-gate.cjs');
export async function verifySchemaReports(directory) {
  const reports=await load(directory); assert.equal(reports.length,4);
  for(const row of reports) {assert.equal(check(row.report).captureComplete,true); assert.equal(row.report.plugin.head,'fec2bc877be9869e1ddd8b18ab4d8628515e8790');}
  return reports;
}
export function schemaExpectations(reports,plans) {
  assert.equal(reports.length,4);assert.equal(plans.length,63);const expected=[];
  for(let i=0;i<63;i++) {
    const plan=plans[i];let display;
    for(const {report} of reports) {
      const row=report.result.display.cases[i];assert.equal(row.name,plan.name);assert.equal(row.rotation,plan.rotation);assert.equal(row.rawInput,plan.rawInput);
      assert.equal(row.storage.accepted,plan.originalSqlAccepted);assert.equal(row.sourceFrontier.sourceRepresentable,plan.sourceRepresentable);
      if(plan.sourceRepresentable)assert.equal(row.encoded,plan.codecAttempt.originalEncoded);
      if(row.storage.accepted) {
        const view=JSON.parse(row.views.schema[0].raw_json),http=JSON.parse(row.http.schema.rawText);
        assert.equal(row.http.schema.status,200);assert.equal(http.success,true);assert.deepEqual(http.data.collection,view.collection);
        const fields=Object.fromEntries(['name','img','images'].map(k=>[k,view.collection[k]]));
        if(display)assert.deepEqual(fields,display);else display=fields;
      } else assert.equal(row.storage.error.code,'22P02');
    }
    expected.push(display??null);
  }
  assert.equal(plans.filter(p=>p.sourceRepresentable&&p.originalSqlAccepted).length,27);assert.equal(plans.filter(p=>p.sourceRepresentable&&!p.originalSqlAccepted).length,6);
  return expected;
}
