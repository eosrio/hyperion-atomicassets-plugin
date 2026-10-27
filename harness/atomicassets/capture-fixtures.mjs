import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {executeReferenceFixture} from '../shared/reference.mjs';

if (!process.env.AA_REFERENCE_ROOT) throw new Error('AA_REFERENCE_ROOT is required');
const destination = process.argv[2];
if (!destination) throw new Error('Supply an output directory');
const writeGolden = process.argv[3] === '--write-golden';
await mkdir(destination, {recursive: true});
const summary = [];
for (const name of ['single-asset', 'asset-not-found', 'asset-invalid-id']) {
  const inputPath = `fixtures/harness/atomicassets/${name}.input.json`;
  const input = await readFile(inputPath);
  const fixture = JSON.parse(input);
  const result = await executeReferenceFixture({referenceRoot: process.env.AA_REFERENCE_ROOT, fixture});
  const raw = Buffer.from(JSON.stringify(result, null, 2) + '\n');
  await writeFile(`${destination}/${name}.raw.json`, raw);
  const body = structuredClone(result.response.body);
  if (Object.hasOwn(body, 'query_time')) delete body.query_time;
  const deterministic = {status: result.response.status, body};
  if (writeGolden) await writeFile(`fixtures/harness/atomicassets/${name}.expected.json`, JSON.stringify(deterministic, null, 2) + '\n');
  else {
    const expected = JSON.parse(await readFile(`fixtures/harness/atomicassets/${name}.expected.json`, 'utf8'));
    if (JSON.stringify(expected) !== JSON.stringify(deterministic)) throw new Error(`Reference comparison changed: ${name}`);
  }
  summary.push({fixture: name, node: result.nodeVersion, status: result.response.status,
    inputSha256: createHash('sha256').update(input).digest('hex'),
    rawSha256: createHash('sha256').update(raw).digest('hex'), rawBytes: raw.length,
    queries: result.database.executed.length, unused: result.database.unused,
    originalHttpServer: result.scope.originalHttpServer, postgresExecution: false, hyperionPluginExecution: false});
}
await writeFile(`${destination}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
