import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {executeReferenceFixture} from '../shared/reference.mjs';
import {saleFormatterCases} from '../../tests/fixtures/sale-formatter-cases.mjs';

const destination = process.argv[2];
if (!destination || !process.env.AA_REFERENCE_ROOT) throw new Error('Supply a fresh evidence directory and AA_REFERENCE_ROOT');
await mkdir(dirname(destination), {recursive: true});
await mkdir(destination, {recursive: false});
const base = JSON.parse(await readFile(new URL('../../fixtures/harness/atomicmarket/single-sale.input.json', import.meta.url)));
const golden = {};
for (const {name, fixture} of saleFormatterCases(base)) {
  const result = await executeReferenceFixture({referenceRoot: process.env.AA_REFERENCE_ROOT, fixture});
  await writeFile(`${destination}/${name}.raw.json`, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  const body = structuredClone(result.response.body); delete body.query_time;
  golden[name] = {status: result.response.status, body};
}
if (process.argv[3] === '--write-golden')
  await writeFile(new URL('../../tests/fixtures/sale-formatter.expected.json', import.meta.url), JSON.stringify(golden, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({node: process.version, cases: Object.keys(golden), destination, originalHttp: true,
  boundary: 'Scripted SQL rows; original sale formatter and HTTP wrapper; no engine or enrichment implementation qualification'}));
