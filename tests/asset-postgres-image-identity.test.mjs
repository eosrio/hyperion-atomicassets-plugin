import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PIN, verifyImageIdentity, verifyImageDescriptor, verifyPinnedImageMetadata} from '../harness/atomicassets/postgres/image-identity.mjs';

const manifestDigest = 'sha256:cbf42f0edc946c0bc1b8eeed62403734e1f25dc67a3491455d07a92fdb558b28';
const configDigest = 'sha256:6a2e324ebe59af6031c4c1cd96c1d5072c2ebc36563d2196365e43b8297c062d';
const descriptor = () => ({mediaType:'application/vnd.oci.image.manifest.v1+json', digest:manifestDigest, size:3054});
const manifestImage = () => ({Id:manifestDigest, Os:'linux', Architecture:'amd64', Variant:null,
  RepoDigests:['postgres@'+manifestDigest], Descriptor:descriptor()});

test('immutable official manifest and config bytes prove the exact same pinned image',()=>{
  const proof=verifyPinnedImageMetadata();assert.equal(proof.manifestDigest,manifestDigest);assert.equal(proof.configDigest,configDigest);
  assert.equal(proof.manifestBytes,3054);assert.equal(proof.configBytes,9073);assert.equal(proof.platform,'linux/amd64');
  assert.equal(PIN.image,'docker.io/library/postgres@'+manifestDigest);
});

test('classic config ID and observed containerd manifest ID both admit only the linked image',()=>{
  assert.equal(verifyImageIdentity(manifestImage()).kind,'manifest');
  const classic={...manifestImage(),Id:configDigest};delete classic.Descriptor;
  assert.equal(verifyImageIdentity(classic).kind,'config');
  assert.equal(verifyImageIdentity({...classic,Descriptor:descriptor()}).kind,'config');
  const full=manifestImage();full.Descriptor.platform={os:'linux',architecture:'amd64'};
  assert.equal(verifyImageIdentity(full).id,manifestDigest);
});

test('foreign, missing or contradictory IDs and repository digests fail closed',()=>{
  for(const mutate of [v=>delete v.Id,v=>v.Id='sha256:'+'f'.repeat(64),v=>v.Id=PIN.registryInspection.indexDigest,
    v=>v.Id=null,v=>delete v.RepoDigests,v=>v.RepoDigests=[],v=>v.RepoDigests=['foreign/postgres@'+manifestDigest],
    v=>v.RepoDigests=[configDigest],v=>v.RepoDigests=[null]]){
    const image=manifestImage();mutate(image);assert.throws(()=>verifyImageIdentity(image));
  }
});

test('manifest ID requires exact descriptor digest, media type, byte size and object shape',()=>{
  for(const value of [undefined,null,{},[],manifestDigest,{...descriptor(),digest:configDigest},
    {...descriptor(),mediaType:'application/vnd.oci.image.index.v1+json'},{...descriptor(),size:3053},
    {...descriptor(),size:'3054'},{...descriptor(),size:NaN}]){
    assert.throws(()=>verifyImageIdentity({...manifestImage(),Descriptor:value}));
  }
  assert.throws(()=>verifyImageIdentity({...manifestImage(),Id:configDigest,Descriptor:{...descriptor(),digest:configDigest}}));
  assert.throws(()=>verifyImageDescriptor({...descriptor(),digest:configDigest}));
});

test('wrong or malformed image and descriptor platform observations are refused',()=>{
  for(const mutate of [v=>delete v.Os,v=>v.Os='windows',v=>v.Architecture='arm64',v=>v.Variant='v8',
    v=>v.Descriptor.platform=null,v=>v.Descriptor.platform={},v=>v.Descriptor.platform={os:'linux',architecture:'arm64'},
    v=>v.Descriptor.platform={os:'windows',architecture:'amd64'},v=>v.Descriptor.platform={os:'linux',architecture:'amd64',variant:'v8'}]){
    const image=manifestImage();mutate(image);assert.throws(()=>verifyImageIdentity(image));
  }
});

test('changed, malformed, truncated or contradictory raw manifest/config bytes cannot change the pin',()=>{
  const root=new URL('../harness/atomicassets/postgres/',import.meta.url);
  const manifest=readFileSync(new URL('postgres-16.15-linux-amd64.manifest.json',root));
  const config=readFileSync(new URL('postgres-16.15-linux-amd64.config.json',root));
  const changed=Buffer.from(manifest);changed[changed.indexOf(Buffer.from(configDigest))]='f'.charCodeAt(0);
  const wrongPlatform=Buffer.from(config);wrongPlatform[wrongPlatform.indexOf(Buffer.from('amd64'))]='f'.charCodeAt(0);
  for(const [m,c] of [[changed,config],[manifest,wrongPlatform],[manifest.subarray(1),config],[manifest,config.subarray(1)],
    [Buffer.alloc(manifest.length,32),config],[manifest,Buffer.alloc(config.length,32)],[manifest.toString(),config]]){
    assert.throws(()=>verifyPinnedImageMetadata(m,c));
  }
});
