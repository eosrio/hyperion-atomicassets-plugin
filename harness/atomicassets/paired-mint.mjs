/** One constructed mint-stage seam; no client, service, source authority or HTTP implementation. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateMintCapture}=require('./mint-capture-profile.cjs');
const {validateInputProfile}=require('./lifecycle-input.cjs');

export function mintSource(definition,profile,scenario,assets) {
  const fixed=validateMintCapture(profile),selected=validateInputProfile(fixed.inputProfile);
  assert.deepEqual(assets.input,selected.input,'Portable inputs must be the same complete named input');
  const events=assets.initial();
  const config=events.filter(e=>e.kind==='row'&&e.table==='config');assert.equal(config.length,1);
  config[0].value=structuredClone(fixed.configData);
  const source=scenario.atomicSource(definition,1,events);
  assert.deepEqual(source.block,fixed.appliedBlock,'Portable mint chronology differs');
  let sequence=BigInt(fixed.sequenceStart);
  for(const input of source.inputs)if(input.kind==='action'){
    input.transactionId=fixed.transactionId;input.sequence=String(sequence++);
  }
  return source;
}

export async function captureMint({sdk,declaration,adapter,custody,guard,bridge,scenario,assets,assetModule,formatter,profile}) {
  const fixed=validateMintCapture(profile),source=mintSource(declaration.definition,fixed,scenario,assets);
  guard();
  const captured=await sdk.captureStatefulSource(declaration,source);guard();
  const applied=await sdk.executeStatefulBlock(declaration,source,adapter,custody,
    port=>bridge.reduceAtomicSource(port,{assets:assets.input.contract,market:'atomicmarket',codec:assets.codec}),guard);
  guard();
  const read=await sdk.composeStatefulRead(declaration,adapter,applied.progress,
    port=>assetModule.assembleAssetLightView(port,assets.input.contract,assets.input.assetId),guard);
  guard();assert.notEqual(read.value,null,'Mint stage must contain the selected asset');
  const json=JSON.stringify(formatter.formatAsset(read.value));
  assert.ok(Buffer.byteLength(json)<=declaration.limits.responseBytes,'Formatted asset response exceeds declared bound');
  const candidate=await custody.load(declaration.digest,captured.digest);guard();assert.ok(candidate);
  return {inputProfile:fixed.inputProfile,captureProfile:fixed,source:captured,
    candidateDigest:candidate.digest,application:applied,coherentRead:{view:read.view,value:JSON.parse(json)}};
}
