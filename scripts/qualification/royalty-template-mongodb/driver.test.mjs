import test from 'node:test';
import assert from 'node:assert/strict';
import {runRoyaltyTemplateNativeDifferential} from './driver.mjs';
test('driver refuses an unselected or wrong comparison model before native access',async()=>{
 let calls=0;const input={registration:{},declaration:{projection:{definition:{}}},limits:{},adapter:{recovery(){calls++;throw Error('must not run');}},engineering:{},identity:{},lease:{},guard(){},retain(){},load(){}};
 await assert.rejects(runRoyaltyTemplateNativeDifferential({...input,model:{model:{id:'other',textComparison:'mongodb-simple-utf8-v1'}}}));
 await assert.rejects(runRoyaltyTemplateNativeDifferential({...input,model:{model:{id:'atomicmarket-royalty-templates',textComparison:'atomicmarket-270-royalty-template-pg16-v1'}}}));
 assert.equal(calls,0);
});
