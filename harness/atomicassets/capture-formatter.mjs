import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {executeReferenceFixture} from '../shared/reference.mjs';
import {assetFormatterCases} from '../../tests/fixtures/asset-formatter-cases.mjs';

const destination = process.argv[2];
if (!destination || !process.env.AA_REFERENCE_ROOT) throw new Error('Supply an evidence directory and AA_REFERENCE_ROOT');
await mkdir(destination, {recursive: true});
const base = JSON.parse(await readFile(new URL('../../fixtures/harness/atomicassets/single-asset.input.json', import.meta.url)));
const golden = {};
for (const {name, fixture} of assetFormatterCases(base)) {
  const result = await executeReferenceFixture({referenceRoot: process.env.AA_REFERENCE_ROOT, fixture});
  await writeFile(`${destination}/${name}.raw.json`, JSON.stringify(result, null, 2) + '\n');
  const body = structuredClone(result.response.body); delete body.query_time;
  golden[name] = {status: result.response.status, body};
}
if (process.argv[3] === '--write-golden')
  await writeFile(new URL('../../tests/fixtures/asset-formatter.expected.json', import.meta.url), JSON.stringify(golden, null, 2) + '\n');
console.log(JSON.stringify({node: process.version, cases: Object.keys(golden), destination, originalHttp: true}));
