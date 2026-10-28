'use strict';
const assert = require('node:assert/strict');
const {SAFE_IMAGE, validateInputProfile} = require('./lifecycle-input.cjs');

const MINT_CAPTURE = 'constructed-genesis-mint-v1';

/** Explicit engineering chronology, shared by both physical captures; never rewrites raw input. */
function mintCaptureProfile(inputProfile) {
  const {input, descriptor} = validateInputProfile(inputProfile);
  assert.equal(descriptor.profile, SAFE_IMAGE, 'Mint comparison requires the explicit safe-image input; codec exceptions remain unresolved');
  return {
    profile: MINT_CAPTURE, stage: 'mint-and-replacement', inputProfile: descriptor,
    originalBlock: {blockNum: input.block.block_num, timestamp: input.block.timestamp},
    appliedBlock: {blockNum: 1, blockId: '1'.padStart(64, '0'), previousBlockId: '0'.repeat(64),
      timeMs: String(Date.parse(input.block.timestamp + 'Z'))},
    sequenceStart: '9007199254741093', transactionId: 'ab'.repeat(32),
    configData: {supported_tokens: [{sym: '4,WAX', contract: 'eosio.token'}], collection_format: input.collectionFormat},
    constructedInputs: true, chronologyRebased: true, rawInputRewritten: false,
    sourceAuthority: false, originalDefaultLifecycleQualified: false,
  };
}

function validateMintCapture(profile) {
  assert.ok(profile && typeof profile === 'object' && !Array.isArray(profile), 'Mint capture profile required');
  const expected = mintCaptureProfile(profile.inputProfile);
  assert.deepEqual(profile, expected, 'Mint capture stage/input/chronology binding differs');
  return expected;
}

module.exports = {MINT_CAPTURE, mintCaptureProfile, validateMintCapture};
