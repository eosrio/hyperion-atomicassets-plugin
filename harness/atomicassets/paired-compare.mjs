/** Data-only comparison of retained captures. Matching values do not qualify physical custody or an API. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {validateMintCapture}=createRequire(import.meta.url)('./mint-capture-profile.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=b=>({bytes:b.length,sha256:sha(b)});
const endpoint='/atomicassets/v1/assets/:asset_id';
const inventory=JSON.parse(readFileSync(new URL('../../docs/parity/atomicassets/inventory.json',import.meta.url)));
assert.equal(inventory.baseline.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');

/** Exact JSON differences, including missing/null/type and array order; no allowlist or rewriting. */
export function differences(left,right){
  const result=[],pending=[{path:'',left,right,depth:0}];let visited=0;
  while(pending.length){
    const row=pending.pop();assert.ok(++visited<=16384&&row.depth<=32,'Comparison traversal bound');
    const {left:a,right:b}=row;
    if(Object.is(a,b))continue;
    if(a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
      const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
      if(Array.isArray(a)&&a.length!==b.length)result.push({path:row.path+'/length',original:a.length,portable:b.length});
      for(const key of keys){
        const path=row.path+'/'+key.replaceAll('~','~0').replaceAll('/','~1');
        if(!Object.hasOwn(a,key)||!Object.hasOwn(b,key))result.push({path,originalPresent:Object.hasOwn(a,key),portablePresent:Object.hasOwn(b,key),
          ...(Object.hasOwn(a,key)?{original:a[key]}:{}),...(Object.hasOwn(b,key)?{portable:b[key]}:{})});
        else pending.push({path,left:a[key],right:b[key],depth:row.depth+1});
      }
    }else result.push({path:row.path,original:a,portable:b});
    assert.ok(result.length<=256&&pending.length<=16384,'Comparison difference bound');
  }
  return result;
}

export function compareMintCaptures(original,terminal,portable){
  const profile=validateMintCapture(original.captureProfile);
  assert.equal(original.status,'passed');assert.equal(original.originalConnectionEnded,true);
  assert.equal(original.reference.commit,inventory.baseline.commit);
  assert.equal(terminal.exitCode,0);assert.equal(terminal.signal,null);assert.equal(terminal.error,null);
  for(const key of ['pidAbsent','groupAbsent','reaped'])assert.equal(terminal[key],true);
  assert.equal(original.identity.pid,terminal.pid);assert.equal(original.node,terminal.node);
  for(const value of [terminal.captureProfile,original.result.captureProfile])assert.deepEqual(value,profile);
  for(const value of [original.inputProfile,terminal.inputProfile,original.result.inputProfile])assert.deepEqual(value,profile.inputProfile);
  assert.equal(original.result.scope.realPostgres,true);assert.equal(original.result.scope.originalViewAndHttp,true);
  assert.equal(original.result.stages.length,1);const stage=original.result.stages[0];assert.equal(stage.name,profile.stage);
  assert.deepEqual(JSON.parse(stage.http.rawText),stage.http.body,'Retained raw HTTP and decoded body differ');
  assert.equal(stage.http.status,200);assert.equal(stage.http.body.success,true);
  let valueStatus='not-run',delta=[],portableHTTP=null;
  if(portable!==null){
    assert.equal(portable.kind,'atomicassets-constructed-mint-capture');assert.equal(portable.status,'captured');
    assert.equal(portable.node,original.node);assert.equal(portable.scope.actualMongo,true);assert.equal(portable.clientsClosed,true);
    assert.equal(portable.scope.fullParity,false);assert.equal(portable.scope.sourceAuthority,false);
    assert.deepEqual(validateMintCapture(portable.captureProfile),profile);assert.deepEqual(portable.inputProfile,profile.inputProfile);
    assert.equal(portable.coherentRead.view.checkpoint.blockNum,profile.appliedBlock.blockNum);
    assert.equal(portable.coherentRead.view.checkpoint.blockId,profile.appliedBlock.blockId);
    assert.deepEqual(portable.publicHTTP,{status:'unimplemented',response:null},'No portable public HTTP capture exists in this slice');
    delta=differences(stage.http.body.data,portable.coherentRead.value);valueStatus=delta.length?'different':'matched';portableHTTP=portable.publicHTTP;
  }
  const matrix=inventory.endpoints.filter(e=>e.classification==='json-api').map(e=>({path:e.path,methods:e.methods,
    publicAPI:'unimplemented',selectedCases:e.path===endpoint?[
      {id:'constructed-genesis-mint-v1',coherentValue:valueStatus,publicHTTP:'unimplemented',physicalQualification:'pending-independent-audit'},
      {id:'nul-compatibility',status:'blocked',reason:'Original conversion versus plugin refusal remains unresolved'},
      {id:'literal-backslash-compatibility',status:'blocked',reason:'Original conversion failure versus plugin refusal remains unresolved'}]:[],
    unselectedCases:'not-run'}));
  return {schemaVersion:1,kind:'atomicassets-mint-comparison',baseline:inventory.baseline.commit,inputProfile:profile.inputProfile,captureProfile:profile,
    comparison:{endpoint,method:'GET',coherentValue:valueStatus,differences:delta,originalHTTP:stage.http,portableHTTP,
      originalPhysical:{asset:stage.asset,mints:stage.mints,view:stage.view,collections:stage.collections,schemas:stage.schemas}},
    matrix,summary:{selectedValueCases:1,comparedValueCases:portable===null?0:1,matchingValueCases:valueStatus==='matched'?1:0,
      publicHTTP:'unimplemented',physicalQualification:'pending-independent-audit',fullParity:false,
      omittedResponseFields:[],normalizedResponseFields:[],parityPercentage:null,
      blocked:portable===null?['Fresh same-input portable Mongo/coherent-read capture is absent']:[]}};
}

function read(path,maximum){assert.ok(statSync(path).isFile()&&statSync(path).size<=maximum,'Bounded capture file required');const raw=readFileSync(path);assert.ok(raw.length<=maximum);return {raw,value:JSON.parse(raw)};}
export function runComparison({originalDirectory,portablePath,output}){
  const report=read(join(originalDirectory,'report.json'),16*1024**2),terminal=read(join(originalDirectory,'terminal.json'),16384);
  assert.deepEqual({bytes:terminal.value.reportBytes,sha256:terminal.value.reportSha256},pin(report.raw),'Original terminal/report byte binding differs');
  let portable=null,pins={originalReport:pin(report.raw),originalTerminal:pin(terminal.raw)};
  if(portablePath){
    const capture=read(portablePath,65536);portable=capture.value;pins.portableCapture=pin(capture.raw);
    for(const [field,name,maximum]of [['physical','mint.physical.json',65536],['source','mint.source.json',4*1024**2]]){
      const member=read(join(dirname(portablePath),name),maximum);assert.deepEqual(pin(member.raw),portable[field],'Portable capture member pin differs');pins[field]=pin(member.raw);
    }
  }
  const result={...compareMintCaptures(report.value,terminal.value,portable),capturePins:pins};
  const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n');assert.ok(bytes.length<=2*1024**2,'Comparison report exceeds bound');
  writeFileSync(output,bytes,{flag:'wx',mode:0o600});return result;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const args=process.argv.slice(2);assert.ok([4,6].includes(args.length));assert.equal(args[0],'--original-run');assert.equal(args[2],'--output');
    if(args.length===6)assert.equal(args[4],'--portable-capture');
    const result=runComparison({originalDirectory:args[1],output:args[3],portablePath:args[5]});console.log(JSON.stringify(result.summary));
  }catch(error){console.error(error);process.exitCode=1;}
}
