// Test-only decoder: use the fully hashed existing BSON package, without creating a client.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {inventory} from '../jsonb-display-mongo-http/assembly.mjs';
const root=process.env.HYPERION_ATTRIBUTE_TEST_BSON_ROOT;
assert(root,'Explicit pinned BSON package path required for custody-only tests');
const profile=JSON.parse(readFileSync(new URL('./profile.json',import.meta.url)));
assert.deepEqual(inventory(realpathSync(root)),profile.observation.dependencies.rootBSON,'Test BSON bytes differ');
const bson=createRequire(import.meta.url)(join(realpathSync(root),'lib/bson.cjs'));
export const BSON=bson.BSON,Long=bson.Long;
