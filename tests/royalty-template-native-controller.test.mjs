import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareRoyaltyDeclaration,runRoyaltyQualification,verifyRoyaltyProfile,MODEL_SHA256} from '../scripts/qualification/royalty-template-mongodb/controller.mjs';
test('royalty declaration is a distinct exact model and rejects unsafe names',async()=>{
 const x=await prepareRoyaltyDeclaration('h45_indexed_0123456789ab','am-royalty-0123456789abcdef');assert.equal(x.requirement.model.textComparison,'mongodb-simple-utf8-v1');assert.equal(x.requirement.model.id,'atomicmarket-royalty-templates');assert.equal(MODEL_SHA256,'04a67391497f89d053ddf4df27d62bd73b38f82a7fb5fa06476d43ee549ce684');
 await assert.rejects(prepareRoyaltyDeclaration('production','am-royalty-0123456789abcdef'));await assert.rejects(prepareRoyaltyDeclaration('h45_indexed_0123456789ab','existing'));
});
test('royalty qualification rejects wrong authority and modified source before native I/O',async()=>{
 let touched=false;const nativeOwner=new Proxy({},{get(){touched=true;throw Error('unexpected');}});await assert.rejects(runRoyaltyQualification({profile:'other',nativeOwner}));assert.equal(touched,false);
 assert.equal(verifyRoyaltyProfile().files.length,11);assert.throws(()=>verifyRoyaltyProfile(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')+(p==='src/stateful/royalty-rules.ts'?'x':'')),/royalty source differs/);
});
