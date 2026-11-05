import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyRoyaltyAttributeSourceProfile} from '../scripts/qualification/royalty-attribute-source-profile.mjs';
import {prepareRoyaltyDeclaration,runRoyaltyQualification,verifyRoyaltyProfile,MODEL_SHA256} from '../scripts/qualification/royalty-template-mongodb/controller.mjs';
test('royalty declaration is a distinct exact model and rejects unsafe names',async()=>{
 const x=await prepareRoyaltyDeclaration('h45_indexed_0123456789ab','am-royalty-0123456789abcdef');assert.equal(x.requirement.model.textComparison,'mongodb-simple-utf8-v1');assert.equal(x.requirement.model.id,'atomicmarket-royalty-templates');assert.equal(MODEL_SHA256,'04a67391497f89d053ddf4df27d62bd73b38f82a7fb5fa06476d43ee549ce684');
 await assert.rejects(prepareRoyaltyDeclaration('production','am-royalty-0123456789abcdef'));await assert.rejects(prepareRoyaltyDeclaration('h45_indexed_0123456789ab','existing'));
});
test('royalty qualification rejects wrong authority and modified source before native I/O',async()=>{
 let touched=false;const nativeOwner=new Proxy({},{get(){touched=true;throw Error('unexpected');}});await assert.rejects(runRoyaltyQualification({profile:'other',nativeOwner}));assert.equal(touched,false);
 assert.throws(()=>verifyRoyaltyProfile(),/royalty source differs: src\/stateful\/plugin.ts/);
 assert.equal(verifyRoyaltyAttributeSourceProfile('royalty').files.length,11);
 assert.throws(()=>verifyRoyaltyAttributeSourceProfile('royalty',p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')+(p==='src/stateful/royalty-rules.ts'?'x':'')),/successor source differs/);
 assert.throws(()=>verifyRoyaltyAttributeSourceProfile('royalty',undefined,()=>[]),/successor plugin emissions differ/);
 assert.throws(()=>verifyRoyaltyAttributeSourceProfile('royalty',path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')+(path.endsWith('royalty-attribute-source-profile.json')?'x':'')),/successor profile bytes differ/);
 let trees=0;assert.throws(()=>verifyRoyaltyAttributeSourceProfile('royalty',undefined,path=>{trees++;return trees===1?verifyRoyaltyAttributeSourceProfile('royalty').pluginDist:[];}),/successor SDK emissions differ/);
});
