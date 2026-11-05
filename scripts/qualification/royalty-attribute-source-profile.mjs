// Source/emission successors only; historical physical qualification remains separate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const profiles=Object.freeze({
 owned:{path:'scripts/qualification/owned-schema-mongodb/royalty-attribute-source-profile.json',hash:'f901709a3aa88a0f74f36329cf39fd0d5529e8db390f595984aacd2ad41628b7',name:'atomicassets-owned-schema-cbfb-royalty-attribute-source-v3'},
 royalty:{path:'scripts/qualification/royalty-template-mongodb/royalty-attribute-source-profile.json',hash:'79dba2b8ee192033baae01ecf37d67c95d958bf13e2e63235fae4d7c40bd4306',name:'atomicmarket-royalty-template-cbfb-royalty-attribute-source-v2'}
});
function inventory(base){const rows=[];let total=0;function visit(dir){for(const name of readdirSync(dir).sort()){const path=join(dir,name),s=lstatSync(path);assert(!s.isSymbolicLink());if(s.isDirectory())visit(path);else{assert(s.isFile()&&rows.length<2048&&(total+=s.size)<=67108864);const b=readFileSync(path);rows.push({path:relative(base,path).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});}}}visit(base);return rows;}
export function verifyRoyaltyAttributeSourceProfile(kind,read=path=>readFileSync(join(root,path),'utf8'),inspect=inventory){
 const selected=profiles[kind];assert(selected,'Unknown source profile');const raw=read(selected.path).replace(/\r\n/g,'\n');assert.equal(sha(raw),selected.hash,'successor profile bytes differ');const profile=JSON.parse(raw);
 assert.equal(profile.profile,selected.name);assert.equal(profile.sourceCommit,'6261491b37e85c735bad563152147c9c59822f6e');assert.equal(profile.sourceTree,'fa01541686ed5ee2eadb3fb09f29a1e960f7d6d4');
 assert.equal(profile.sdk,'cbfb26694b90b52266d1e0b9b5dbf6f8389e736b');assert.equal(profile.physicalQualification,'pending');
 assert.equal(sha(read(profile.supersedes.path).replace(/\r\n/g,'\n')),profile.supersedes.sha256,'historical profile differs');
 for(const file of profile.files)assert.equal(sha(read(file.path).replace(/\r\n/g,'\n')),file.sha256,'successor source differs: '+file.path);
 assert.deepEqual(inspect(join(root,'dist')),profile.pluginDist,'successor plugin emissions differ');assert.deepEqual(inspect(join(root,'node_modules/@eosrio/hyperion-sdk/dist')),profile.sdkDist,'successor SDK emissions differ');return profile;
}