// The new qualification owns its controller binding; historical defaults remain untouched.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {CI_PROFILE,expectedHead,sha,PINS} from './contract.mjs';
import {root,verifyAssembly} from './assembly.mjs';
export {root};
export const hapiRoot=join(root,'out/royalty-attribute-inputs/hapi');
const git=(...args)=>execFileSync('git',['-c','core.autocrlf=false',...args],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
export function observeController(){
 const cycles=['scripts/qualification/royalty-attribute-mongo-v1/admission.mjs','scripts/qualification/royalty-attribute-mongo-v1/binding.json'];
 const paths=git('ls-files','-z').split('\0').filter(Boolean).sort(),files=[];assert(paths.includes(cycles[0])&&paths.includes(cycles[1]));
 for(const path of paths){if(cycles.includes(path))continue;const p=join(root,path),s=lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.size<=4*1024*1024);const b=readFileSync(p);assert.equal(b.length,s.size);files.push({path,bytes:b.length,sha256:sha(b)});}
 return {schemaVersion:1,profile:CI_PROFILE,product:PINS.atomic,hapi:PINS.hapi,physicalAcceptance:'pending',cycleInputsBoundByReviewedGitTree:cycles,files};
}
export async function admitOwnedController(){
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.versions.bun,undefined);assert(['v24.22.1','v26.4.0'].includes(process.version));
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_OS,'Linux');assert.equal(realpathSync(process.env.GITHUB_WORKSPACE),realpathSync(root));
 const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),expected=expectedHead(process.env.GITHUB_EVENT_NAME,event,process.env.GITHUB_SHA);
 assert.equal(process.env.HYPERION_EXPECTED_HEAD,expected);assert.equal(git('rev-parse','HEAD'),expected);assert.equal(git('status','--porcelain=v1','--untracked-files=all'),'');
 const reviewedHarness={commit:expected,tree:git('rev-parse','HEAD^{tree}')},binding=JSON.parse(readFileSync(new URL('./binding.json',import.meta.url)));assert.equal(binding.physicalAcceptance,'pending');
 assert.deepEqual(observeController(),binding.observation,'Complete current harness/source binding differs');
 const assembly=await verifyAssembly(hapiRoot,reviewedHarness);
 return {profile:CI_PROFILE,reviewedHarness,assembly,workflowSha:process.env.GITHUB_WORKFLOW_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,job:process.env.GITHUB_JOB,
 runtime:{node:process.version,executable:process.execPath,sha256:sha(readFileSync(process.execPath))}};
}
