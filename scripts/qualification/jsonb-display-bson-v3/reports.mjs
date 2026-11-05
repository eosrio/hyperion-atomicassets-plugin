import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {inflateRawSync} from 'node:zlib';

const hash = b => createHash('sha256').update(b).digest('hex');
const archiveHosts = new Set(['productionresultssa0.blob.core.windows.net', 'productionresultssa1.blob.core.windows.net',
  'productionresultssa2.blob.core.windows.net', 'productionresultssa3.blob.core.windows.net',
  'productionresultssa4.blob.core.windows.net', 'productionresultssa5.blob.core.windows.net',
  'productionresultssa6.blob.core.windows.net', 'productionresultssa7.blob.core.windows.net',
  'productionresultssa8.blob.core.windows.net', 'productionresultssa9.blob.core.windows.net',
  'github-production-repository-file-5c1aeb.s3.amazonaws.com', 'results-receiver.actions.githubusercontent.com']);

// Exactly one regular file, no extraction to the filesystem. Reject ZIP64, encryption,
// traversal, extra entries and oversized output before decompression.
export function extractReport(zip, expectedBytes) {
  assert.ok(Buffer.isBuffer(zip) && zip.length >= 22 && zip.length <= 1024 * 1024);
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50); assert.equal(zip.readUInt16LE(end + 20), 0);
  assert.equal(zip.readUInt16LE(end + 4), 0); assert.equal(zip.readUInt16LE(end + 6), 0);
  assert.equal(zip.readUInt16LE(end + 8), 1); assert.equal(zip.readUInt16LE(end + 10), 1);
  const size = zip.readUInt32LE(end + 12), offset = zip.readUInt32LE(end + 16);
  assert.equal(offset + size, end); assert.ok(offset + 46 <= end);
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  const flags = zip.readUInt16LE(offset + 8), method = zip.readUInt16LE(offset + 10);
  assert.equal(flags & 1, 0); assert.ok(method === 0 || method === 8);
  const compressed = zip.readUInt32LE(offset + 20), uncompressed = zip.readUInt32LE(offset + 24);
  const nameLen = zip.readUInt16LE(offset + 28), extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
  assert.equal(offset + 46 + nameLen + extra + comment, end);
  assert.equal(zip.subarray(offset + 46, offset + 46 + nameLen).toString(), 'json-display-oracle.json');
  const mode = zip.readUInt32LE(offset + 38) >>> 16;
  assert.ok((mode & 0xf000) === 0 || (mode & 0xf000) === 0x8000);
  assert.equal(uncompressed, expectedBytes); assert.ok(uncompressed <= 2_100_000);
  const local = zip.readUInt32LE(offset + 42); assert.ok(local + 30 <= offset);
  assert.equal(zip.readUInt32LE(local), 0x04034b50);
  assert.equal(zip.readUInt16LE(local + 6), flags); assert.equal(zip.readUInt16LE(local + 8), method);
  const ln = zip.readUInt16LE(local + 26), le = zip.readUInt16LE(local + 28);
  assert.equal(zip.subarray(local + 30, local + 30 + ln).toString(), 'json-display-oracle.json');
  const start = local + 30 + ln + le; assert.ok(start + compressed <= offset);
  const data = zip.subarray(start, start + compressed);
  const raw = method === 8 ? inflateRawSync(data, {maxOutputLength: expectedBytes}) : data;
  assert.equal(raw.length, expectedBytes); return raw;
}

async function download(url, token, fetchImpl, guard) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    let current = new URL(url), chain = [];
    for (let i = 0; i < 4; i++) {
      guard();
      assert.equal(current.protocol, 'https:'); assert.equal(current.port, '');
      assert.ok(current.hostname === 'api.github.com' || archiveHosts.has(current.hostname), 'untrusted artifact host: ' + current.hostname);
      const headers = {'accept': 'application/vnd.github+json', 'x-github-api-version': '2022-11-28'};
      if (current.hostname === 'api.github.com' && token) headers.authorization = 'Bearer ' + token;
      const response = await fetchImpl(current.href, {headers, redirect: 'manual', signal: controller.signal});
      chain.push({host: current.hostname, status: response.status, contentLength: response.headers.get('content-length'), contentType: response.headers.get('content-type')});
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); assert.ok(location); current = new URL(location, current); continue;
      }
      assert.equal(response.status, 200);
      const declared = response.headers.get('content-length');
      if (declared !== null) assert.ok(/^\d+$/.test(declared) && Number(declared) <= 1024 * 1024);
      assert.ok(response.body); const chunks = []; let length = 0;
      for await (const chunk of response.body) { length += chunk.length; assert.ok(length <= 1024 * 1024); chunks.push(chunk); }
      return {bytes: Buffer.concat(chunks), chain};
    }
    throw new Error('Too many artifact redirects');
  } finally { clearTimeout(timer); }
}

// Called only under the Linux root controller guard. All reports are validated
// before any output is written; persistence records the original bytes.
export async function stageOriginalReports({output, token, persist, guard, fetch: fetchImpl = globalThis.fetch}) {
  assert.equal(process.platform, 'linux', 'artifact staging requires Linux');
  assert.equal(typeof guard, 'function'); assert.equal(typeof persist, 'function');
  assert.equal(typeof output, 'string'); assert.equal(typeof fetchImpl, 'function');
  guard();
  const pins = JSON.parse(await readFile(new URL('./original-artifacts.json', import.meta.url)));
  const fixture = JSON.parse(await readFile(new URL('../../../tests/fixtures/jsonb-display-pg16.json', import.meta.url)));
  assert.equal(fixture.workflowRun, pins.run); assert.equal(pins.artifacts.length, 4);
  assert.equal(fixture.reports.length, 4);
  const rows = [];
  for (const pin of pins.artifacts) {
    const report = fixture.reports.find(r => r.file === pin.name + '.json'); assert.ok(report);
    const url = 'https://api.github.com/repos/' + pins.repository + '/actions/artifacts/' + pin.id + '/zip';
    const result = await download(url, token, fetchImpl, guard);
    assert.equal(result.bytes.length, pin.size); assert.equal(hash(result.bytes), pin.sha256);
    const raw = extractReport(result.bytes, report.bytes); assert.equal(hash(raw), report.sha256);
    JSON.parse(raw); rows.push({pin, report, raw, http: result.chain});
  }
  guard(); await mkdir(output, {recursive: true});
  for (const row of rows) {
    guard(); await writeFile(join(output, row.report.file), row.raw, {flag: 'wx'});
    await persist(row.report.file, row.raw);
  }
  return rows.map(({pin, report, http}) => ({artifactId: pin.id, artifactName: pin.name, zipBytes: pin.size, zipSha256: pin.sha256,
    file: report.file, reportBytes: report.bytes, reportSha256: report.sha256, http}));
}
