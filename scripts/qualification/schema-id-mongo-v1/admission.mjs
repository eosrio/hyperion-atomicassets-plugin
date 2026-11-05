import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {admitController as prior,root,hapiRoot} from '../jsonb-display-bson-v3/admission.mjs';
import {sha} from '../jsonb-display-bson-v3/contract.mjs';
export {root,hapiRoot};
export async function admitController() {
  const admitted=await prior(); const paths=execFileSync('git',['ls-tree','-r','--name-only',admitted.reviewedHarness.commit,'--','scripts/qualification/schema-id-mongo-v1','.github/workflows/schema-id-mongo-v1.yml'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  assert(paths.length>=7);const files=paths.map(path=>{const blob=execFileSync('git',['show',admitted.reviewedHarness.commit+':'+path],{cwd:root});const working=readFileSync(join(root,path));assert.equal(sha(blob),sha(working));return {path,bytes:working.length,sha256:sha(working)};});
  return {...admitted,profile:'schema-id-mongo-owned-v1',schemaPairInputs:files};
}
