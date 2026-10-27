import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {executeOriginalSaleControls} from '../harness/shared/reference.mjs';
import {input,expected,key,context,occurrence,scenario,oracle,rows,storage,listed} from './fixtures/fixed-sale-cases.mjs';
const root=process.env.AM_DOMAIN_MODULE_ROOT?pathToFileURL(process.env.AM_DOMAIN_MODULE_ROOT.replaceAll('\\','/')+'/'):new URL('../dist/',import.meta.url);
const {reduceFixedSales:reduce,assembleFixedSaleLight:assemble,readFixedSaleLight:read,FIXED_SALE_RELATIONSHIPS:dependencies}=await import(new URL('atomicmarket/internal/fixed-sale.js',root));
const {FixedSaleUnavailable}=await import(new URL('atomicmarket/internal/fixed-sale-port.js',root));
const rejects=p=>assert.rejects(p,FixedSaleUnavailable),json=v=>JSON.parse(JSON.stringify(v));
const saleKey=key(input.marketContract,input.saleId);
let reference;
const original=()=>reference??=executeOriginalSaleControls({referenceRoot:process.env.AA_REFERENCE_ROOT});

test('unmodified original sale callbacks and scheduler reproduce all14 captured cases and8 source-derived light models',async()=>{
  assert.ok(process.env.AA_REFERENCE_ROOT,'Exact installed original reference is required');const result=await original();
  assert.deepEqual(result.controls,expected);assert.equal(result.controls.cases.length,14);assert.equal(result.controls.lightCases.length,8);
  assert.equal(result.scope.originalSaleProcessor,true);assert.equal(result.scope.originalScheduler,true);assert.equal(result.scope.originalFormatter,true);
  for(const flag of ['postgres','mongo','sourceAuthority','sdkRecovery','fullParity'])assert.equal(result.scope[flag],false);
  assert.match(result.scope.viewShape,/SQL not executed/);assert.ok(result.loadedModules.length>0);assert.ok(result.loadedModuleBytes>0);
  assert.ok(result.loadedModules.some(row=>row.path==='src/filler/handlers/atomicmarket/processors/sales.ts'));
  for(const value of result.controls.cases)assert.equal(value.listenersReleased,true);
  const p=JSON.parse(await readFile(new URL('../fixtures/harness/atomicmarket/lifecycle/provenance.json',import.meta.url)));
  const bytes=await readFile(new URL('../fixtures/harness/atomicmarket/lifecycle/expected.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),p.expected.sha256);assert.equal(p.expected.native24And26ControlsEqual,true);
});

test('portable durable rows match original callback arguments after explicitly labeled timestamp-string normalization',async()=>{
  for(const c of input.cases.filter(c=>!c.originalOnly)){
    const s=storage(),record=oracle(c.name);
    for(let i=0;i<c.blocks.length;i++){
      const b=c.blocks[i];await s.run(reduce,context(b.offset),b.events.map(occurrence));
      assert.deepEqual(rows(s),record.snapshots[i].logicalRows,c.name+':'+b.offset);
    }
    for(const view of record.views){assert.deepEqual(json(await assemble(s.reader(),input.marketContract,view.saleId)),view.view,c.name);
      assert.deepEqual(json(await read(s.reader(),input.marketContract,view.saleId)),view.formatted,c.name);}
  }
});

test('actual base priorities1020/1040 sort creation first and retain update insertion order',async()=>{
  const record=oracle('same-block-start-before-create');assert.deepEqual(record.queued[0].map(j=>j.name),['logsalestart','lognewsale']);
  assert.deepEqual(record.executed.map(j=>[j.name,j.priority]),[['lognewsale',1020],['logsalestart',1040]]);
  for(const c of expected.cases)assert.deepEqual(c.registrations,[{action:'lognewsale',priority:1020},{action:'logsalestart',priority:1040},{action:'cancelsale',priority:1040},{action:'purchasesale',priority:1040}]);
  assert.equal(oracle('equal-priority-cancel-then-start').snapshots[0].logicalRows[0].state,1);
  assert.equal(oracle('equal-priority-start-then-cancel').snapshots[0].logicalRows[0].state,2);
});

test('IDs and prices remain exact strings beyond2^53; original positive int64 price clamp and decimal units match',async()=>{
  const s=await listed(reduce),row=rows(s)[0];assert.equal(row.sale_id,'9007199254740993');assert.equal(row.offer_id,'9007199254741993');
  assert.equal(row.listing_price,'9007199254740993');assert.equal((await read(s.reader(),input.marketContract,input.saleId)).price.amount,row.listing_price);
  assert.equal(oracle('listing-price-clamp').snapshots.at(-1).logicalRows[0].final_price,'9223372036854775807');
  assert.equal(oracle('new-sale-upsert-replaces-created-time').snapshots.at(-1).logicalRows[0].listing_price,'1');
  assert.equal(oracle('same-block-start-before-create').snapshots[0].logicalRows[0].maker_marketplace,' Market.Name ');
  assert.equal(oracle('waiting').snapshots[0].logicalRows[0].maker_marketplace,null);
});

test('already-SOLD replay preserves first buyer/final price/time before nonzero-median evaluation',async()=>{
  const s=storage(),c=scenario('sold-and-duplicate-replay');
  await s.run(reduce,context(0),c.blocks[0].events.map(occurrence));await s.run(reduce,context(1),c.blocks[1].events.map(occurrence));const before=s.snapshot();
  await s.run(reduce,context(2),c.blocks[2].events.map(occurrence));assert.deepEqual(s.snapshot(),before);
  const original=oracle(c.name);assert.equal(original.notifications.length,3);assert.equal(rows(s)[0].buyer,'buyer');
});

test('absent purchase/start/cancel have no durable effect and no seller/owner/state authorization is invented',async()=>{
  const s=storage(),c=scenario('absent-purchase-and-updates'),before=s.snapshot();await s.run(reduce,context(0),c.blocks[0].events.map(occurrence));assert.deepEqual(s.snapshot(),before);
  assert.equal(oracle('v1-purchase-without-start').snapshots.at(-1).logicalRows[0].state,3);
  assert.equal(oracle('purchase-canceled-without-invented-state-guard').snapshots.at(-1).logicalRows[0].state,3);
  const absent=oracle(c.name);assert.equal(absent.notifications.length,2);assert.equal(absent.calls.filter(call=>call.operation==='update').every(call=>call.scriptedAffectedRows===0),true);
});

test('nullable buyer/final and marketplace normalization follow original source without fabricated zero values',async()=>{
  assert.equal(oracle('waiting').snapshots[0].logicalRows[0].buyer,null);assert.equal(oracle('waiting').snapshots[0].logicalRows[0].final_price,null);
  const row=oracle('nullable-buyer-and-marketplaces').snapshots.at(-1).logicalRows[0];assert.equal(row.buyer,null);assert.equal(row.maker_marketplace,null);assert.equal(row.taker_marketplace,null);assert.equal(row.final_price,'9007199254740993');
  const s=storage(),c=scenario('nullable-buyer-and-marketplaces');for(const b of c.blocks)await s.run(reduce,context(b.offset),b.events.map(occurrence));
  assert.equal((await read(s.reader(),input.marketContract,input.saleId)).buyer,null);
});

test('current light relationships and original formatter match8 explicitly source-derived non-SQL models',async()=>{
  for(const c of expected.lightCases){const s=storage(c.relations);s.seed('market-sale',saleKey,c.sale);
    assert.deepEqual(json(await assemble(s.reader(),input.marketContract,input.saleId)),c.view,c.name);
    assert.deepEqual(json(await read(s.reader(),input.marketContract,input.saleId)),c.formatted,c.name);}
});

test('relationship-only updates change current response while stored sale/timestamps and previous responses stay detached',async()=>{
  const s=await listed(reduce),before=rows(s),prior=await read(s.reader(),input.marketContract,input.saleId),c=expected.lightCases.find(x=>x.name==='changed-current-relations');
  s.seed('collection',key(input.assetsContract,'fixturecoll'),c.relations.collection);s.seed('market-token',key(input.marketContract,'WAX'),c.relations.token);s.seed('contract-code',key('seller'),c.relations.sellerCode);
  const current=await read(s.reader(),input.marketContract,input.saleId);assert.deepEqual(rows(s),before);assert.equal(prior.collection.name,'current collection');assert.equal(current.collection.name,'later collection');
  assert.equal(current.collection.market_fee,.05);assert.equal(current.current_collection_fee,.2);assert.equal(current.price.token_precision,8);assert.equal(current.is_seller_contract,true);assert.equal(current.price.amount,'9007199254740993');
  current.assets.push('mutated');current.collection.authorized_accounts.push('mutated');assert.deepEqual(await read(s.reader(),input.marketContract,input.saleId),c.formatted);
});

test('covered SQL-row absence and NULL offer differ from unknown required coverage',async()=>{
  const empty=storage();assert.equal(await read(empty.reader(),input.marketContract,input.saleId),null);await rejects(read(empty.reader(),input.marketContract,'9007199254740994'));
  const waiting=storage();await waiting.run(reduce,context(0),scenario('waiting').blocks[0].events.map(occurrence));assert.equal(await read(waiting.reader(),input.marketContract,input.saleId),null);
  const bindings=[['market-sale',saleKey],['offer',key(input.assetsContract,input.offerId)],['collection',key(input.assetsContract,'fixturecoll')],['market-token',key(input.marketContract,'WAX')],['symbol-pair',key(input.marketContract,'WAX','WAX')],['offer-assets',key(input.assetsContract,input.offerId)],['contract-code',key('seller')]];
  for(const [kind,k]of bindings){const s=await listed(reduce);s.unknown(kind,k);await rejects(read(s.reader(),input.marketContract,input.saleId));}
  for(const [kind,k]of bindings.slice(1,4)){const s=await listed(reduce);s.absent(kind,k);assert.equal(await read(s.reader(),input.marketContract,input.saleId),null);}
});

test('unsupported current Delphi/bundle joins and mismatched or malformed relationships refuse explicitly',async()=>{
  for(const [kind,k,value]of [['symbol-pair',key(input.marketContract,'WAX','WAX'),{invert_delphi_pair:true}],
    ['offer-assets',key(input.assetsContract,input.offerId),{contract:input.assetsContract,offer_id:input.offerId,asset_ids:[input.assetId,'9007199254740994']}],
    ['market-token',key(input.marketContract,'WAX'),{...input.relationships.token,market_contract:'other'}],
    ['contract-code',key('seller'),{account:'other'}]]){const s=await listed(reduce);s.seed(kind,k,value);await rejects(read(s.reader(),input.marketContract,input.saleId));}
  const s=await listed(reduce),row=rows(s)[0];delete row.maker_marketplace;s.seed('market-sale',saleKey,row);await rejects(read(s.reader(),input.marketContract,input.saleId));
});

test('missing normalized source/time/ABI/version and mismatched contract evidence abort without publishing state',async()=>{
  for(const mutate of [b=>{delete b.blockTimeMs},b=>{delete b.blockId},b=>{delete b.contractVersion},b=>{b.contractVersion.version='2.0.0'},b=>{b.contractVersion.version='unknown'},b=>{delete b.contractVersion.occurrence}]){
    const s=storage(),before=s.snapshot(),b=context(0);mutate(b);await rejects(s.run(reduce,b,scenario('waiting').blocks[0].events.map(occurrence)));assert.deepEqual(s.snapshot(),before);}
  for(const mutate of [e=>{delete e.evidence},e=>{delete e.evidence.occurrence},e=>{delete e.evidence.abiDeployment},e=>{e.evidence.abiSha256='b'.repeat(64)},e=>{e.contract='other'},e=>{delete e.transactionId}]){
    const s=storage(),before=s.snapshot(),e=occurrence(scenario('waiting').blocks[0].events[0]);mutate(e);await rejects(s.run(reduce,context(0),[e]));assert.deepEqual(s.snapshot(),before);}
});

test('nonzero eligible conversion, v2 and bundles are unavailable; local failures discard already-staged changes',async()=>{
  const s=await listed(reduce),before=s.snapshot(),cancel=occurrence({name:'cancelsale',data:{sale_id:input.saleId}}),conversion=occurrence({name:'purchasesale',data:{sale_id:input.saleId,buyer:'buyer',intended_delphi_median:'1',taker_marketplace:''}});
  await rejects(s.run(reduce,context(1),[cancel,conversion]));assert.deepEqual(s.snapshot(),before);
  const e=occurrence(scenario('waiting').blocks[0].events[0]);e.value.asset_ids.push('9007199254740994');await rejects(s.run(reduce,context(1),[e]));assert.deepEqual(s.snapshot(),before);
  const v2=oracle('v2-bundle-original-only');assert.equal(v2.snapshots.at(-1).logicalRows[0].state,2);assert.equal(v2.snapshots.at(-1).logicalRows[0].buyer,null);
  assert.equal(oracle('nonzero-delphi-original-query-refused').snapshots.at(-1).error.message,'Unscripted original SQL query');
});

test('primitive action discriminants, closed data, exact integer strings and malformed input are validated before lookup',async()=>{
  for(const mutate of [e=>{e.kind='row'},e=>{e.name='config'},e=>{e.name=['purchasesale']},e=>{e.name={toString(){return 'purchasesale'}}},e=>{e.value.sale_id=9007199254740992},e=>{e.value.listing_price='1e3 WAX'},e=>{e.value.settlement_symbol='4,USD'},e=>{e.value.unexpected=true}]){
    const s=await listed(reduce),before=s.snapshot(),e=occurrence(scenario('waiting').blocks[0].events[0]);mutate(e);await rejects(s.run(reduce,context(1),[e]));assert.deepEqual(s.snapshot(),before);}
  const s=await listed(reduce),before=s.snapshot();let touched=0;const e=occurrence(scenario('waiting').blocks[0].events[0]);Object.defineProperty(e,'name',{enumerable:true,get(){touched++;return 'purchasesale'}});
  await rejects(s.run(reduce,context(1),[e]));assert.equal(touched,0);assert.deepEqual(s.snapshot(),before);
});

test('inputs are detached before awaits and read coherence failures propagate without a partial result',async()=>{
  const s=await listed(reduce),b=context(1),events=[occurrence({name:'purchasesale',data:{sale_id:input.saleId,buyer:'buyer',intended_delphi_median:'0',taker_marketplace:'exact'}})],before=structuredClone(events),base=s.reader(),writes=new Map();
  const stage={async get(kind,k){b.blockTimeMs='0';events[0].value.buyer='mutated';return base.get(kind,k)},put(kind,k,v){writes.set(kind+':'+k,v)},delete(){}};
  await reduce(b,events,stage);const value=writes.get('market-sale:'+saleKey);assert.equal(value.buyer,'buyer');assert.equal(value.updated_at_time,context(1).blockTimeMs);assert.notDeepEqual(events,before);
  let reads=0;await assert.rejects(read({async get(kind,k){if(++reads===3)throw Error('caller view revision changed');return base.get(kind,k)}},input.marketContract,input.saleId),/view revision changed/);
});

test('borrowed nested collection values are copied before later awaits and no result mutates its source',async()=>{
  const s=await listed(reduce),base=s.reader(),borrowed=structuredClone(input.relationships.collection),prior=structuredClone(borrowed);
  const reader={async get(kind,k){if(kind==='collection')return {status:'present',value:borrowed};if(kind==='market-token'){borrowed.data.name='mutated after collection read';borrowed.authorized_accounts.push('mutated');}return base.get(kind,k)}};
  const value=await read(reader,input.marketContract,input.saleId);assert.equal(value.collection.name,prior.data.name);assert.deepEqual(value.collection.authorized_accounts,prior.authorized_accounts);
  const target=await read(base,input.marketContract,input.saleId);target.price.amount='changed';assert.equal((await read(base,input.marketContract,input.saleId)).price.amount,'9007199254740993');
});

test('malformed absence/present tags never manufacture source coverage, and relationship declarations remain native-neutral',async()=>{
  for(const bad of [{status:'covered-absent',value:{}},{status:'present',value:{},reason:'contradictory'},{status:'unknown'}])
    await rejects(read({async get(){return bad}},input.marketContract,input.saleId));
  assert.deepEqual(dependencies.map(x=>x.kind),['market-sale','offer','collection','market-token','symbol-pair','offer-assets','contract-code']);
  assert.equal(dependencies.some(x=>/mongo|sql|worm/i.test(JSON.stringify(x))),false);
});
