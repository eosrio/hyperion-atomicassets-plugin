// Verification only: the caller must supply actual native and Fastify observations.
// No connection, fixture launch or admission is provided by this module.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const PG_SNAPSHOT_SHA256='d33f0e77f8995c2d0c4301277c1359bcac45f88408413b6feb5285a8505abb08';
export const SUCCESS=Object.freeze(['none','scalar','two','ten','eleven','weak','duplicates','safe-offset','unsafe-offset','ignored']);
export const REFUSALS=Object.freeze(['null-one','null-two','null-eleven','overflow-one','overflow-two','overflow-eleven']);
export function originalSnapshot(bytes=readFileSync(new URL('../../../tests/fixtures/royalty-template-pg16-ci-snapshot.json',import.meta.url))){
 const normalized=Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
 assert.equal(createHash('sha256').update(normalized).digest('hex'),PG_SNAPSHOT_SHA256,'Original snapshot bytes differ');
 const data=JSON.parse(normalized);assert.equal(data.provenance.run,41783292706);assert.equal(data.provenance.head,'a537b5eb533d507077c52b4cd06b8267f374e618');
 assert.equal(data.royaltyTemplate.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(data.royaltyTemplate.metadata.server_version,'16.15');
 assert.deepEqual(data.royaltyTemplate.physicalRows.map(row=>row.template_id),['-2','0','1','2','10','9223372036854775807']);return data.royaltyTemplate;
}
const clean=value=>{const out=structuredClone(value);delete out.query_time;return out;};
export function verifySuccess(expected,observed){
 assert.equal(expected.http.status,200);assert.equal(observed.statusCode,200,expected.name);assert.equal(observed.nativeComplete,true,expected.name);
 assert.deepEqual(clean(observed.body),expected.http.body,expected.name+': HTTP payload');
 assert.deepEqual(observed.nativeRows,expected.http.body.data,expected.name+': native rows');
 return {name:expected.name,rows:observed.nativeRows.length};
}
export function verifyRefusal(expected,observed){
 assert.equal(expected.http.status,500);assert.ok(expected.dbError?.code);assert.equal(observed.statusCode,503,expected.name);assert.equal(observed.body?.success,false);
 assert.equal(observed.nativeAttempts,0,expected.name+': unsupported input must not query native data');
 return {name:expected.name,originalPgCode:expected.dbError.code,candidateStatus:observed.statusCode};
}
// Driver owns fixture custody, real adapter, Fastify request, trace and durable receipt.
// A passing verifier alone is not evidence that driver observations are physical.
export async function compareRoyaltyTemplates(driver){
 const original=originalSnapshot(),byName=new Map(original.results.map(row=>[row.name,row]));
 await driver.initialize(original.physicalRows.map(row=>row.template_id));
 const successes=[],refusals=[];
 for(const name of SUCCESS){const expected=byName.get(name);assert.ok(expected,name);successes.push(verifySuccess(expected,await driver.observe(expected.query,name)));}
 for(const name of REFUSALS){const expected=byName.get(name);assert.ok(expected,name);refusals.push(verifyRefusal(expected,await driver.observe(expected.query,name)));}
 const invalid=byName.get('invalid-before-sql');assert.equal(invalid.http.status,400);assert.equal(invalid.sql,null);
 const rejected=await driver.observe(invalid.query,'invalid-before-sql');assert.equal(rejected.statusCode,400);assert.equal(rejected.nativeAttempts,0);
 return {successes,refusals,invalidStatus:rejected.statusCode,qualification:'unproven-without-independent-native-driver-custody'};
}
