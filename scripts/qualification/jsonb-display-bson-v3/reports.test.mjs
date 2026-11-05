import test from 'node:test';
import assert from 'node:assert/strict';
import {extractReport, stageOriginalReports} from './reports.mjs';
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';

function zip(name = 'json-display-oracle.json', mode = 0x8000) {
  const n = Buffer.from(name), data = Buffer.from('{"ok":true}');
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(n.length, 26);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28); central.writeUInt32LE((mode << 16) >>> 0, 38);
  const offset = local.length + n.length + data.length, size = central.length + n.length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, n, data, central, n, end]);
}

test('extracts only the exact bounded regular report', () => {
  assert.equal(extractReport(zip(), 11).toString(), '{"ok":true}');
  assert.throws(() => extractReport(zip('../json-display-oracle.json'), 11));
  assert.throws(() => extractReport(zip('json-display-oracle.json', 0xa000), 11));
  assert.throws(() => extractReport(zip(), 12));
  const multiple = zip(); multiple.writeUInt16LE(2, multiple.length - 12);
  assert.throws(() => extractReport(multiple, 11));
});

test('actual staging function refuses Windows before network or filesystem effects on every test platform', async () => {
  const source = readFileSync(new URL('./reports.mjs', import.meta.url), 'utf8'), start = source.indexOf('export async function stageOriginalReports(');
  const run = new Function('assert', 'process', source.slice(start).replace('export ', '').replaceAll('import.meta.url', "'file:///inert/reports.mjs'") + '\nreturn stageOriginalReports;')(assert, {platform: 'win32'});
  await assert.rejects(run({output: 'unused', persist() {}, guard() {}}), /requires Linux/);
});

test('actual staging validates the complete four-report set before any filesystem or persistence effect', async () => {
  const source = readFileSync(new URL('./reports.mjs', import.meta.url), 'utf8'), start = source.indexOf('export async function stageOriginalReports(');
  const pins = JSON.parse(readFileSync(new URL('./original-artifacts.json', import.meta.url)));
  const fixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/jsonb-display-pg16.json', import.meta.url)));
  for (const badDigest of [null, 2]) {
    const effects = [], hashes = new Map(), reports = new Map(); let downloaded = 0;
    const download = async url => {
      const index = downloaded++, pin = pins.artifacts[index], report = fixture.reports.find(row => row.file === pin.name + '.json');
      assert.equal(url, 'https://api.github.com/repos/' + pins.repository + '/actions/artifacts/' + pin.id + '/zip');
      const bytes = Buffer.alloc(pin.size, index + 1), raw = Buffer.alloc(report.bytes, ' '); raw.write('{"case":' + index + '}');
      hashes.set(bytes, index === badDigest ? 'wrong-digest' : pin.sha256); hashes.set(raw, report.sha256); reports.set(bytes, raw);
      effects.push('download:' + index); return {bytes, chain: []};
    };
    const body = source.slice(start).replace('export ', '').replaceAll('import.meta.url', "'file:///inert/reports.mjs'");
    const run = new Function('assert', 'process', 'readFile', 'download', 'extractReport', 'hash', 'mkdir', 'writeFile', 'join', body + '\nreturn stageOriginalReports;')(
      assert, {platform: 'linux'}, async url => JSON.stringify(String(url).includes('original-artifacts') ? pins : fixture), download,
      (bytes, expected) => {assert.equal(reports.get(bytes).length, expected); return reports.get(bytes);}, bytes => hashes.get(bytes),
      async () => effects.push('mkdir'), async () => effects.push('write'), posix.join);
    const options = {output: '/owned/reports', guard: () => effects.push('guard'), persist: async () => effects.push('persist')};
    if (badDigest !== null) {
      await assert.rejects(run(options)); assert.equal(downloaded, badDigest + 1);
      assert(!effects.some(value => ['mkdir', 'write', 'persist'].includes(value)));
    } else {
      const result = await run(options); assert.equal(result.length, 4); assert.equal(downloaded, 4);
      assert(effects.indexOf('mkdir') > effects.indexOf('download:3'));
      assert.equal(effects.filter(value => value === 'write').length, 4); assert.equal(effects.filter(value => value === 'persist').length, 4);
    }
  }
});
