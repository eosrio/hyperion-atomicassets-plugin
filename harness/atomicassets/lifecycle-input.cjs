'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {createHash} = require('node:crypto');

const REFERENCE = '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e';
const ORIGINAL = 'original-lifecycle';
const SAFE_IMAGE = 'portable-safe-image';
const PROFILES = Object.freeze([ORIGINAL, SAFE_IMAGE]);
const files = {
  // These are the existing Git blob and observed Windows checkout, not a normalization rule.
  [ORIGINAL]: {name: 'input.json', variants: [
    {checkout: 'git-lf', bytes: 2855, sha256: '8006d4c79506d19bbdad4cab6f794368be960f30f90b673e07e1cc42e1fc7f6a'},
    {checkout: 'observed-windows-crlf', bytes: 2908, sha256: '6c4a2a25d7d57afe043c18cb20b9c9125992a5d90965fa8409cc0d689f6cfbfe'},
  ]},
  [SAFE_IMAGE]: {name: 'input-safe-image.json', variants: [
    {checkout: 'pinned-lf', bytes: 2850, sha256: '612d44a7dfab5d722aeafc07ab768f9abc05875aac4992265b1ac9fff95d1115'},
  ]},
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const difference = () => ({field: 'collectionData.img', original: 'image\u0000hash', safeImage: 'image hash'});

function read(name) {
  const file = files[name];
  const bytes = readFileSync(join(__dirname, '../../fixtures/harness/atomicassets/lifecycle', file.name));
  const variant = file.variants.find(value => value.bytes === bytes.length && value.sha256 === sha(bytes));
  assert.ok(variant, 'Pinned lifecycle input digest drift: ' + name);
  return {bytes, input: JSON.parse(bytes), pin: {file: file.name, ...variant}};
}

/** Named engineering fixtures only; never accepts a path or normalizes caller input. */
function loadInputProfile(name = ORIGINAL) {
  assert.ok(PROFILES.includes(name), 'Unknown lifecycle input profile');
  const original = read(ORIGINAL), selected = name === ORIGINAL ? original : read(name);
  if (name === SAFE_IMAGE) {
    const expected = structuredClone(original.input);
    expected.collectionData.img = 'image hash';
    assert.deepEqual(selected.input, expected, 'Safe profile must differ only at its declared image field');
  }
  return {input: selected.input, descriptor: {
    schemaVersion: 1, profile: name, referenceCommit: REFERENCE,
    selectedInput: selected.pin, originalInput: original.pin,
    safeImageDifference: difference(), substitutionApplied: name === SAFE_IMAGE,
    codecExceptions: {nul: 'unresolved', literalBackslash: 'unresolved'},
    inputsNormalized: false, constructedFixture: true, selectionDoesNotEstablishParity: true,
  }};
}

/** Parent/child binding includes the explicit exception/difference evidence. */
function validateInputProfile(descriptor) {
  assert.ok(descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor), 'Input profile descriptor required');
  const selected = loadInputProfile(descriptor.profile);
  assert.deepEqual(descriptor, selected.descriptor, 'Lifecycle input profile binding differs');
  return selected;
}

module.exports = {ORIGINAL, SAFE_IMAGE, PROFILES, loadInputProfile, validateInputProfile};
