import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyRoyaltyAttributeSourceProfile} from '../scripts/qualification/royalty-attribute-source-profile.mjs';
import {prepareOwnedSchemaDeclaration,runOwnedSchemaQualification,verifyDomainProfile} from '../scripts/qualification/owned-schema-mongodb/controller.mjs';
test('real SDK captures a distinct complete 22-kind owned-schema declaration and engineering model',async()=>{
 const p=await prepareOwnedSchemaDeclaration('h45_indexed_0123456789ab','aa-owned-0123456789abcdef');
 assert.equal(p.registration.definition.records.length,22);
 assert.equal(p.registration.definition.records.filter(x=>x.kind==='owned-schema-count').length,1);
 assert.equal(p.requirement.model.textComparison,'mongodb-simple-utf8-v1');
 assert.match(p.projection.digest,/^[a-f0-9]{64}$/);
});
test('qualification refuses incorrect profile before touching native adapter',async()=>{
 let touched=false;const nativeOwner=new Proxy({}, {get(){touched=true;throw Error('unexpected');}});
 await assert.rejects(runOwnedSchemaQualification({profile:'other',nativeOwner}),/atomicassets-owned-schema/);
 assert.equal(touched,false);
});
test('qualification refuses unsafe backend and generation identifiers',async()=>{
 await assert.rejects(prepareOwnedSchemaDeclaration('production','aa-owned-0123456789abcdef'));
 await assert.rejects(prepareOwnedSchemaDeclaration('h45_indexed_0123456789ab','existing-generation'));
});

test('historical domain profile rejects current source and successor seals exact source and emissions',()=>{
 assert.throws(()=>verifyDomainProfile(),/domain source differs: src\/stateful\/plugin.ts/);
 const profile=verifyRoyaltyAttributeSourceProfile('owned');assert.equal(profile.files.length,21);assert.equal(profile.physicalQualification,'pending');
 assert.throws(()=>verifyDomainProfile(path=>path.endsWith('profile.json')?'{}':''),/profile bytes differ/);
 assert.throws(()=>verifyRoyaltyAttributeSourceProfile('owned',path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')+(path==='src/stateful/plugin.ts'?'x':'')),/successor source differs/);
 assert.throws(()=>verifyRoyaltyAttributeSourceProfile('owned',undefined,()=>[]),/successor plugin emissions differ/);
 assert.throws(()=>verifyRoyaltyAttributeSourceProfile('owned',path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')+(path.endsWith('royalty-attribute-source-profile.json')?'x':'')),/successor profile bytes differ/);
 let trees=0;assert.throws(()=>verifyRoyaltyAttributeSourceProfile('owned',undefined,path=>{trees++;return trees===1?verifyRoyaltyAttributeSourceProfile('owned').pluginDist:[];}),/successor SDK emissions differ/);
 for(const file of ['src/atomicassets/internal/jsonb-text.ts','src/atomicassets/internal/lifecycle-port.ts']){
  assert.ok(profile.files.some(row=>row.path===file));
  assert.throws(()=>verifyRoyaltyAttributeSourceProfile('owned',path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')+(path===file?'x':'')),/successor source differs/);
 }
});
