import {mkdir, writeFile} from 'node:fs/promises';
import {executeOriginalAssetControls} from '../shared/reference.mjs';

const destination = process.argv[2];
if (!destination || !process.env.AA_REFERENCE_ROOT)
  throw new Error('Supply an evidence directory and AA_REFERENCE_ROOT');
await mkdir(destination, {recursive: true});
const result = await executeOriginalAssetControls({referenceRoot: process.env.AA_REFERENCE_ROOT});
await writeFile(`${destination}/original-controls.raw.json`, JSON.stringify(result, null, 2) + '\n');
if (process.argv[3] === '--write-golden')
  await writeFile(new URL('../../fixtures/harness/atomicassets/lifecycle/expected.json', import.meta.url),
    JSON.stringify(result.controls, null, 2) + '\n');
console.log(JSON.stringify({node: process.version, cases: result.controls.cases.map(value => value.name),
  destination, originalProcessors: true, postgresExecution: false}));
