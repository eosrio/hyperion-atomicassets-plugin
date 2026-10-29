import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,input,codec,key,block,action,row,collectionRow,mint,transfer,initial,stages,storage,schemaDigest} from './fixtures/asset-domain-cases.mjs';
const root = process.env.AA_DOMAIN_MODULE_ROOT ? pathToFileURL(process.env.AA_DOMAIN_MODULE_ROOT.replaceAll('\\','/')+'/') : new URL('../dist/',import.meta.url);
const {reduceAssetLifecycle:reduce,assembleAssetLightView:assemble,readLifecycleAsset:read} = await import(new URL('atomicassets/internal/lifecycle.js',root));
const {AssetDomainUnavailable} = await import(new URL('atomicassets/internal/lifecycle-port.js',root));
const rejects = promise => assert.rejects(promise,AssetDomainUnavailable);
const json = v => JSON.parse(JSON.stringify(v));
const assetKey = key(input.contract,input.assetId);
const asset = s => s.snapshot().get('asset:'+assetKey);
async function minted() {const s=storage();await s.run(reduce,block(0),initial());return s;}

test('seven original native24/26 PG stage rows, light views and formatted HTTP domain values match the supported subset',async()=>{
  const s=storage(), plan=stages();
  for(let n=0;n<plan.length;n++) {
    await s.run(reduce,block(n),plan[n]);
    const expected=fixture.stages[n],snapshot=s.snapshot();
    assert.deepEqual(asset(s),expected.asset,expected.name);
    assert.deepEqual(snapshot.get('mint:'+assetKey),expected.mints[0]);
    assert.deepEqual(snapshot.get('collection:'+key(input.contract,input.collection)),expected.collections[0]);
    const schema=structuredClone(snapshot.get('schema:'+key(input.contract,input.collection,input.schema)));delete schema.schema_digest;
    assert.deepEqual(schema,expected.schemas[0]);
    assert.deepEqual(json(await assemble(s.reader(),input.contract,input.assetId)),expected.view);
    assert.deepEqual(json(await read(s.reader(),input.contract,input.assetId)),expected.formatted);
  }
});

test('fixture hashes pin both closed original reports and explicitly changed safe input, without runtime data',async()=>{
  const data=await readFile(new URL('../fixtures/harness/atomicassets/domain/expected.json',import.meta.url));
  const p=JSON.parse(await readFile(new URL('../fixtures/harness/atomicassets/domain/provenance.json',import.meta.url)));
  assert.equal(createHash('sha256').update(data).digest('hex'),p.fixtureSha256);
  assert.equal(p.referenceCommit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(p.reports.length,2);
  assert.equal(p.scope.newSameInputPhysicalPGComparison,false);assert.equal(p.scope.mongo,false);assert.equal(p.scope.fullParity,false);
  assert.equal(p.substitution.field,'collectionData.img');assert.equal(input.collectionData.img,'image hash');
});

test('same-priority input order and mint flush remain observable with repeated keys',async()=>{
  const s=storage();
  const first=action('logsetdata',{asset_id:input.assetId,new_data:[{key:'first',value:['string','first']}]}),
    last=action('logsetdata',{asset_id:input.assetId,new_data:[{key:'last',value:['string','last']} ]});
  await s.run(reduce,block(0),[first,...initial().slice(1),last]);
  assert.deepEqual(asset(s).mutable_data,{last:'last'});
  const reverse=storage();await reverse.run(reduce,block(0),[last,...initial().slice(1),first]);
  assert.deepEqual(asset(reverse).mutable_data,{first:'first'});
  // Types before first schema are an UPDATE of zero rows; sorting must not invent a relationship.
  const ordered=storage();await ordered.run(reduce,block(0),[row('schematypes',{schema_name:input.schema,format_type:[{name:'image',mediatype:'video'}]}),...initial()]);
  assert.deepEqual(ordered.snapshot().get('schema:'+key(input.contract,input.collection,input.schema)).types,[]);
});

test('matched transfer, wrong-owner no-op, burn retention and immutable mint facts are separate',async()=>{
  const s=await minted(),before=asset(s),mintBefore=s.snapshot().get('mint:'+assetKey);
  await s.run(reduce,block(1),[transfer('mallory','wrong')]);assert.deepEqual(asset(s),before);
  await s.run(reduce,block(2),[transfer('alice','bob')]);assert.equal(asset(s).owner,'bob');
  await s.run(reduce,block(3),[action('logburnasset',{asset_id:input.assetId,asset_owner:'bob'})]);
  assert.equal(asset(s).owner,null);assert.equal(asset(s).burned_by_account,'bob');assert.equal(asset(s).minted_at_time,before.minted_at_time);
  await s.run(reduce,block(4),[mint()]);assert.deepEqual(s.snapshot().get('mint:'+assetKey),mintBefore);
  assert.equal([...s.snapshot().keys()].some(k=>/transfer|notification/.test(k)),false);
});

test('relationship-only update uses current joins while asset times and earlier response remain detached',async()=>{
  const s=await minted(),before=asset(s),old=await read(s.reader(),input.contract,input.assetId);
  await s.run(reduce,block(3),stages()[3]);
  const current=await read(s.reader(),input.contract,input.assetId);
  assert.deepEqual(asset(s),before);assert.equal(old.collection.name,'original collection');
  assert.equal(current.collection.name,'current joined collection');assert.equal(current.schema.format.find(f=>f.name==='image').mediatype,'video');
  current.mutable_data.name='mutated';assert.equal(asset(s).mutable_data.name,'replacement mutable');
});

test('actual pinned codec keeps exact scalar/vector strings, fractions, null versus missing and replacement',async()=>{
  const s=storage(),attributes=[{key:'s',value:['int64','-9223372036854775808']},{key:'u',value:['uint64','18446744073709551615']},
    {key:'sv',value:['INT64_VEC',['-9223372036854775808','9007199254740993']]},{key:'uv',value:['UINT64_VEC',['0','18446744073709551615']]},
    {key:'f',value:['float32','0.1']},{key:'d',value:['float64','0.1']},{key:'zero',value:['DOUBLE_VEC',['-0']]},
    {key:'null',value:['string',null]}];
  const events=initial();events[0]=action('logsetdata',{asset_id:input.assetId,new_data:attributes});
  await s.run(reduce,block(0),events);const d=asset(s).mutable_data;
  assert.equal(d.s,'-9223372036854775808');assert.equal(d.u,'18446744073709551615');assert.deepEqual(d.sv,['-9223372036854775808','9007199254740993']);
  assert.deepEqual(d.uv,['0','18446744073709551615']);assert.equal(d.f,Math.fround(.1));assert.equal(d.d,.1);assert.deepEqual(d.zero,[0]);
  assert.equal(d.null,null);assert.equal(Object.hasOwn(d,'missing'),false);assert.equal(Object.hasOwn(d,'old'),false);
});

test('missing normalized source/time/ABI/schema fails without changing the caller committed state',async()=>{
  for(const modify of [b=>{delete b.blockTimeMs},b=>{delete b.blockId},b=>{b.blockNum='01'}]){
    const s=storage(),b=block(0);modify(b);await rejects(s.run(reduce,b,initial()));assert.equal(s.snapshot().size,0);
  }
  for(const modify of [e=>{delete e.evidence},e=>{delete e.evidence.occurrence},e=>{delete e.evidence.abiDeployment},e=>{e.evidence.abiSha256='bad'},e=>{delete e.evidence.schemaDigest}]){
    const s=storage(),events=initial();modify(events[1]);await rejects(s.run(reduce,block(0),events));assert.equal(s.snapshot().size,0);
  }
  const s=storage(),events=initial();events[1].evidence.schemaDigest='b'.repeat(64);await rejects(s.run(reduce,block(0),events));assert.equal(s.snapshot().size,0);
});

test('original FK and deletion refusal preserve prior state; missing relationships never format a valid asset',async()=>{
  const s=await minted(),before=s.snapshot();
  for(const events of [[row('collections',{collection_name:input.collection},input.collection,false)],
    [row('schemas',{schema_name:input.schema},input.collection,false)],
    [row('schemas',{schema_name:'missing',format:input.format},'missingcoll')],
    [action('logmint',{...mint().value,schema_name:'missing'})]]){
    s.add('schema',input.contract,'missingcoll','missing');s.add('schema',input.contract,input.collection,'missing');s.add('collection',input.contract,'missingcoll');
    await rejects(s.run(reduce,block(5),events));assert.deepEqual(s.snapshot(),before);
  }
  const reader=s.reader();await rejects(read({get:(kind,k)=>kind==='schema'?Promise.resolve({status:'covered-absent'}):reader.get(kind,k)},input.contract,input.assetId));
});

test('genuine covered absence differs from unknown asset or relationship coverage',async()=>{
  const s=storage();assert.equal(await read(s.reader(),input.contract,input.assetId),null);
  await rejects(read(s.reader(),input.contract,'9007199254740994'));
  await s.run(reduce,block(0),initial());const reader=s.reader();
  for(const missing of ['asset','collection','schema','template-link','backed-tokens','original-mint'])
    await rejects(read({get:(kind,k)=>kind===missing?Promise.resolve({status:'unavailable',reason:'incomplete'}):reader.get(kind,k)},input.contract,input.assetId));
  for(const unsupported of ['template-link','backed-tokens','original-mint'])
    await rejects(read({get:(kind,k)=>kind===unsupported?Promise.resolve({status:'present',value:{unexpected:true}}):reader.get(kind,k)},input.contract,input.assetId));
});

test('coherence failures at the supplied read fence propagate; no partial response escapes',async()=>{
  const s=await minted(),reader=s.reader();let calls=0;
  await assert.rejects(read({async get(kind,k){if(++calls===3)throw Error('SDK view revision changed');return reader.get(kind,k);}},input.contract,input.assetId),/view revision changed/);
});

test('literal escape metadata is refused; original failing controls remain intact',async()=>{
  for(const value of ['a\\u0000b']) {
    const s=storage(),events=initial();events[0].value.new_data=[{key:'name',value:['string',value]}];
    await rejects(s.run(reduce,block(0),events));assert.equal(s.snapshot().size,0);
    const decoded=storage(),events2=initial();events2[3]=collectionRow({...input.collectionData,img:value});
    await rejects(decoded.run(reduce,block(0),events2));assert.equal(decoded.snapshot().size,0);
  }
});

test('unsupported or malformed input, codec mismatch and malformed stored rows refuse explicitly',async()=>{
  for(const change of [e=>{e[1].value.template_id=42},e=>{e[1].name='logbackasset'},e=>{e[0].value.new_data={bad:true}},e=>{e[3].value.serialized_data='xx'}]){
    const s=storage(),events=initial();change(events);await rejects(s.run(reduce,block(0),events));assert.equal(s.snapshot().size,0);
  }
  const s=storage();await rejects(s.run(reduce,block(0),initial(),{...codec,sha256:'wrong'}));
  const malformed=await minted();const v=asset(malformed);delete v.minted_at_time;malformed.seed('asset',assetKey,v);
  await rejects(read(malformed.reader(),input.contract,input.assetId));
});

test('input and borrowed reads are detached before awaits; getters are not invoked',async()=>{
  const s=storage(),events=initial(),prior=structuredClone(events),snapshot=s.snapshot();
  let touched=0;const poisoned=initial();Object.defineProperty(poisoned[1].value,'owner',{enumerable:true,get(){touched++;return 'x'}});
  await rejects(s.run(reduce,block(0),poisoned));assert.equal(touched,0);assert.deepEqual(s.snapshot(),snapshot);
  await s.run(reduce,block(0),events);assert.deepEqual(events,prior);
  const reader=s.reader(),borrowed=await reader.get('asset',assetKey),shared={...reader,get:async(kind,k)=>kind==='asset'?borrowed:reader.get(kind,k)};
  await read(shared,input.contract,input.assetId);assert.deepEqual(borrowed.value,asset(s));
  const staged=new Map();const stage={async get(kind,k){events[0].value.new_data[0].value[1]='changed during await';return reader.get(kind,k)},put(kind,k,v){staged.set(kind+':'+k,v)},delete(){}};
  await reduce(block(0),events,stage,codec);assert.equal(staged.get('asset:'+assetKey).mutable_data.name,'replacement mutable');
});


test('unmodified original collection callback accepts the safe subset and original formatter confirms all seven PG views',()=>{
  assert.ok(process.env.AA_REFERENCE_ROOT,'AA_REFERENCE_ROOT identifies the installed exact reference');
  const out=fileURLToPath(new URL('../out/',import.meta.url));mkdirSync(out,{recursive:true});
  const cwd=mkdtempSync(join(out,'domain-original-'));
  const result=execFileSync(process.execPath,[fileURLToPath(new URL('./fixtures/asset-domain-original.cjs',import.meta.url)),
    process.env.AA_REFERENCE_ROOT,fileURLToPath(new URL('../',import.meta.url))],{cwd,env:{...process.env,LOG_LEVEL:'error',NODE_ENV:'production'},encoding:'utf8',timeout:30000,windowsHide:true});
  const value=JSON.parse(result.trim().split('\n').at(-1));assert.equal(value.originalCollectionCallback,true);assert.equal(value.originalFormatterStages,7);assert.equal(value.physicalSQL,false);
});

test('rounded integer inputs, unsupported metadata variants and nontext collection joins refuse instead of imitating SQL casts',async()=>{
  for(const attributes of [[{key:'id',value:['uint64',9007199254740992]}],[{key:'id',value:['int64','9223372036854775808']}],
    [{key:'id',value:['UINT64_VEC',['-1']]}],[{key:'unknown',value:['unknown','text']}]]){
    const s=storage(),events=initial();events[0].value.new_data=attributes;await rejects(s.run(reduce,block(0),events));assert.equal(s.snapshot().size,0);
  }
  const s=await minted(),k=key(input.contract,input.collection),value=s.snapshot().get('collection:'+k);value.data.img={nested:true};s.seed('collection',k,value);
  await rejects(read(s.reader(),input.contract,input.assetId));
});

test('block context is detached before any read await',async()=>{
  const s=storage(),b=block(0),r=s.reader(),writes=new Map();
  const stage={async get(kind,k){b.blockTimeMs='999';return r.get(kind,k)},put(kind,k,v){writes.set(kind+':'+k,v)},delete(){}};
  // Explicit local shadow, as the caller port must provide; no SDK implementation is implied.
  const get=stage.get;stage.get=async(kind,k)=>writes.has(kind+':'+k)?{status:'present',value:writes.get(kind+':'+k)}:get(kind,k);
  await reduce(b,initial(),stage,codec);assert.equal(writes.get('asset:'+assetKey).minted_at_time,fixture.stages[0].asset.minted_at_time);
});


test('missing or non-record occurrence payloads remain explicitly unavailable',async()=>{
  for(const modify of [e=>{delete e[0].value},e=>{e[0].value=null},e=>{e[0].value=[]}]){
    const s=storage(),events=initial();modify(events);await rejects(s.run(reduce,block(0),events));assert.equal(s.snapshot().size,0);
  }
  const s=storage();await rejects(s.run(reduce,block(0),null));await rejects(s.run(reduce,block(0),initial(),null));
});


test('cross-kind action config refuses the entire candidate instead of burning an existing asset',async()=>{
  for(const name of ['config',['logburnasset']]) {
    const s=await minted(),before=s.snapshot();let failure;
    const spoof=action(name,{asset_id:input.assetId,asset_owner:'spoofed-burner'});
    try {await s.run(reduce,block(7),[transfer('alice','bob'),spoof]);} catch(error) {failure=error;}
    assert.deepEqual(s.snapshot(),before,'malformed action '+JSON.stringify(name)+' must publish no changes');
    assert.ok(failure instanceof AssetDomainUnavailable,'an action requires its own primitive string discriminant');
  }
});

test('cross-kind row logmint refuses the entire candidate instead of updating schema media types',async()=>{
  for(const table of ['logmint',['schemas']]) {
    const s=await minted(),before=s.snapshot();let failure;
    const spoof=row(table,{schema_name:input.schema,format_type:[{name:'image',mediatype:'video',info:'spoofed'}]});
    try {await s.run(reduce,block(7),[collectionRow({...input.collectionData,name:'must not publish'}),spoof]);} catch(error) {failure=error;}
    assert.deepEqual(s.snapshot(),before,'malformed row '+JSON.stringify(table)+' must publish no changes');
    assert.ok(failure instanceof AssetDomainUnavailable,'a table requires its own primitive string discriminant');
  }
});
