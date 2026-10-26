import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

const files = [];
async function visit(directory) {
  let entries;
  try { entries = await readdir(directory, {withFileTypes: true}); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(path);
  }
}
await visit('tests');
await visit('fixtures/harness/atomicmarket');
if (files.length === 0) throw new Error('No tests discovered');
const child = spawnSync(process.execPath, ['--test', ...files.sort()], {stdio: 'inherit', windowsHide: true});
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
