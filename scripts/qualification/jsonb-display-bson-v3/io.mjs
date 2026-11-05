import assert from 'node:assert/strict';
import {openSync, closeSync, writeSync, fsyncSync, mkdirSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import {join, dirname, relative, isAbsolute} from 'node:path';
import {LIMITS, sha} from './contract.mjs';
export function processIdentity(pid = process.pid) {
  assert(Number.isSafeInteger(pid) && pid > 0); const raw = readFileSync('/proc/' + pid + '/stat', 'utf8'), at = raw.lastIndexOf(')');
  assert(at > 0); const fields = raw.slice(at + 2).trim().split(/\s+/); assert.match(fields[19], /^\d+$/);
  return {pid, birth: fields[19], bootId: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()};
}
export function syncDirectory(path, measure) {
  const fd = openSync(path, 'r'); let primary;
  try {measure?.('directory', 'attempt'); fsyncSync(fd); measure?.('directory', 'complete');} catch (error) {primary = error;}
  try {closeSync(fd);} catch (error) {primary ??= error;}
  if (primary) throw primary;
}
export function exclusiveFile(path, bytes, measure) {
  assert(Buffer.isBuffer(bytes)); const fd = openSync(path, 'wx'); let primary;
  try {assert.equal(writeSync(fd, bytes), bytes.length); measure?.('file', 'attempt'); fsyncSync(fd); measure?.('file', 'complete');} catch (error) {primary = error;}
  try {closeSync(fd);} catch (error) {primary ??= error;}
  if (!primary) try {syncDirectory(dirname(path), measure);} catch (error) {primary = error;}
  if (primary) throw primary;
}
export function evidenceWriter(directory) {
  mkdirSync(directory, {recursive: false}); const root = realpathSync(directory); assert(!lstatSync(root).isSymbolicLink());
  syncDirectory(dirname(root));
  let total = 0, sequence = 0, elapsedNS = 0n; const ledger = [];
  const binary = {attempts: 0, files: 0, bytes: 0, failures: 0, fileFsyncAttempts: 0, fileFsyncCompleted: 0, directoryFsyncAttempts: 0, directoryFsyncCompleted: 0};
  const write = (name, bytes) => {
    assert(/^[A-Za-z0-9_.-]+$/.test(name)); assert(Buffer.isBuffer(bytes));
    assert(sequence < LIMITS.evidenceFiles && bytes.length <= LIMITS.fileBytes && total + bytes.length <= LIMITS.evidenceBytes, 'Evidence bound exceeded');
    const measured = name.endsWith('.bson'), started = measured ? process.hrtime.bigint() : undefined;
    if (measured) binary.attempts++;
    const fsync = (kind, phase) => {binary[kind + 'Fsync' + (phase === 'attempt' ? 'Attempts' : 'Completed')]++;};
    try {exclusiveFile(join(root, name), bytes, measured ? fsync : undefined); if (measured) {binary.files++; binary.bytes += bytes.length;}}
    catch (error) {if (measured) binary.failures++; throw error;}
    finally {if (measured) elapsedNS += process.hrtime.bigint() - started;}
    total += bytes.length; sequence++;
    ledger.push({path: name, bytes: bytes.length, sha256: sha(bytes)}); return undefined;
  };
  return Object.freeze({root, write, persist(row) {return write(String(sequence).padStart(6, '0') + '.json', Buffer.from(JSON.stringify(row) + '\n'));},
    summary() {return {files: sequence, bytes: total, ledger: structuredClone(ledger), binaryIO: {...binary, elapsedNS: elapsedNS.toString()}};}});
}
export function ownedOutput(root, path) {
  const parent = join(realpathSync(root), 'out'); mkdirSync(parent, {recursive: true});
  assert(lstatSync(parent).isDirectory() && !lstatSync(parent).isSymbolicLink());
  syncDirectory(dirname(parent));
  assert.equal(dirname(path), parent); const inner = relative(parent, path); assert(inner && !isAbsolute(inner) && !inner.includes('/') && !inner.includes('\\') && !inner.startsWith('..'));
  mkdirSync(path, {recursive: false}); assert.equal(realpathSync(path), join(realpathSync(parent), inner)); syncDirectory(parent); return path;
}
