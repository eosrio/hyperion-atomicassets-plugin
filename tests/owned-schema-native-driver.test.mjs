import test from 'node:test';
import assert from 'node:assert/strict';
import {runOwnedSchemaNativeDifferential} from '../scripts/qualification/owned-schema-mongodb/driver.mjs';
test('qualification driver refuses a different model before accessing an adapter',async()=>{
 let used=false;const adapter=new Proxy({}, {get(){used=true;throw Error('adapter accessed');}});
 await assert.rejects(runOwnedSchemaNativeDifferential({model:{model:{id:'other'}},adapter}),/atomicassets-owned-schemas/);
 assert.equal(used,false);
});
test('qualification driver refuses the SQL comparison before accessing an adapter',async()=>{
 let used=false;const adapter=new Proxy({}, {get(){used=true;throw Error('adapter accessed');}});
 await assert.rejects(runOwnedSchemaNativeDifferential({model:{model:{id:'atomicassets-owned-schemas',textComparison:'atomicassets-sql-en-us-utf8-unqualified'}},adapter}),/mongodb-simple-utf8-v1/);
 assert.equal(used,false);
});
