// Raw original PostgreSQL evidence is pinned independently of this controller.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import gate from '../../../harness/atomicassets/postgres/royalty-rule-gate.cjs';
import {verifyOriginalReports} from './original.mjs';
export const pins=JSON.parse(readFileSync(new URL('./pg-pins.json',import.meta.url)));
export function loadOriginalReports(directory){
 const read=name=>{const path=join(directory,name),s=lstatSync(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.size<=1024*1024);return readFileSync(path);};
 return verifyOriginalReports({pins,read,readArchive:read,check:gate.check});
}
