/** Qualification-only host seam. No database client, public export or source authority. */
import assert from 'node:assert/strict';
import {reduceAssetLifecycle,assembleAssetLightView} from '../../dist/atomicassets/internal/lifecycle.js';
import {reduceFixedSales,assembleFixedSaleLight} from '../../dist/atomicmarket/internal/fixed-sale.js';
import {formatAsset} from '../../dist/atomicassets/asset.js';
import {formatSale} from '../../dist/atomicmarket/sale.js';

export const RECORD_KINDS=Object.freeze(['config','collection','schema','asset','mint','template-link','backed-tokens',
  'original-mint','market-sale','market-config','offer','market-token','symbol-pair','offer-assets','contract-code']);
const assetTables=['config','collections','schemas','schematypes'];
const assetActions=['logmint','logsetdata','logtransfer','logburnasset'];
const saleActions=['lognewsale','logsalestart','cancelsale','purchasesale'];
export const RELATIONS_CONTRACT='engineering.relations';
const relationKinds=['offer','market-token','symbol-pair','offer-assets','contract-code'];
const key=(...parts)=>JSON.stringify(parts);

export function selectors(assets,market) {
  const rows=(kind,contract,names,epoch)=>names.map(name=>({id:contract+':'+name,kind,contract,name,
    abiDeployment:epoch,abiSha256:'a'.repeat(64)}));
  return [...rows('table',assets,assetTables,'constructed:abi:1'),...rows('action',assets,assetActions,'constructed:abi:1'),
    ...rows('table',market,['config'],'constructed-market-abi:1'),...rows('action',market,saleActions,'constructed-market-abi:1'),
    ...rows('table',RELATIONS_CONTRACT,relationKinds,'engineering-relations:1')];
}

/** Decode only this fixture's explicit JSON engineering envelope, never chain ABI bytes. */
function envelope(input) {
  assert.ok(input.data&&typeof input.data==='object');
  assert.deepEqual(Object.keys(input.data).sort(),['schemaDigest','value']);
  const bytes=Buffer.from(input.rawHex,'hex'),text=bytes.toString('utf8');
  assert.equal(Buffer.from(text).toString('hex'),input.rawHex,'Invalid engineering UTF8 payload');
  assert.deepEqual(JSON.parse(text),JSON.parse(JSON.stringify(input.data)),'Engineering raw/normalized data differs');
  assert.ok(input.data.value&&typeof input.data.value==='object'&&!Array.isArray(input.data.value));
  assert.ok(input.data.schemaDigest===null||/^[a-f0-9]{64}$/.test(input.data.schemaDigest));
  return input.data;
}

export async function reduceAtomicSource(port,{assets,market,codec}) {
  const b=port.source.block,assetEvents=[],saleEvents=[],relations=[],configs=[];
  for(const input of port.source.inputs) {
    const {value,schemaDigest}=envelope(input),evidence={occurrence:input.sourceEvidence,
      abiDeployment:input.abiDeployment,abiSha256:input.abiSha256,...(schemaDigest===null?{}:{schemaDigest})};
    if(input.contract===assets) {
      assert.ok(input.kind==='table'?assetTables.includes(input.name):input.kind==='action'&&assetActions.includes(input.name));
      assetEvents.push(input.kind==='table'?{kind:'row',table:input.name,scope:input.scope,present:input.present,value,evidence}:
        {kind:'action',name:input.name,transactionId:input.transactionId,value,evidence});
    } else if(input.contract===market) {
      if(input.kind==='table'&&input.name==='config') {
        assert.equal(input.present,true);assert.deepEqual(Object.keys(value),['version']);assert.equal(value.version,'1.2.2');
        configs.push({version:value.version,...evidence});
      } else {
        assert.ok(input.kind==='action'&&saleActions.includes(input.name));
        saleEvents.push({kind:'action',contract:market,name:input.name,transactionId:input.transactionId,value,evidence});
      }
    } else {
      assert.equal(input.contract,RELATIONS_CONTRACT);assert.equal(input.kind,'table');assert.ok(relationKinds.includes(input.name));
      relations.push({kind:input.name,key:input.primaryKey,present:input.present,value});
    }
  }
  // Original AA priorities10/20/50/60 and its mint flush precede market1020/1040.
  // Relation rows are explicit engineering input effects, not missing production reducers.
  const context={contract:assets,blockNum:String(b.blockNum),blockTimeMs:b.timeMs,blockId:b.blockId};
  await reduceAssetLifecycle(context,assetEvents,port,codec);
  for(const config of configs)port.put('market-config',key(market),config);
  for(const relation of relations) {
    if(relation.present)port.put(relation.kind,relation.key,relation.value);
    else port.delete(relation.kind,relation.key);
  }
  if(saleEvents.length) {
    const version=await port.get('market-config',key(market));assert.equal(version.status,'present','Missing source-bound contract version');
    const {version:tag,occurrence,abiDeployment,abiSha256}=version.value;
    await reduceFixedSales({marketContract:market,assetsContract:assets,blockNum:String(b.blockNum),blockTimeMs:b.timeMs,
      blockId:b.blockId,contractVersion:{version:tag,occurrence,abiDeployment,abiSha256}},saleEvents,port);
  }
}

/** SDK owns staging, custody, bounded reads, commit/replay and readiness. Caller owns guard. */
export function createAtomicStatefulHost({sdk,declaration,adapter,custody,guard,codec,assets='atomicassets',market='atomicmarket'}) {
  assert.equal(typeof guard,'function');assert.notEqual(assets,market);assert.notEqual(assets,RELATIONS_CONTRACT);assert.notEqual(market,RELATIONS_CONTRACT);
  return Object.freeze({
    execute:input=>sdk.executeStatefulBlock(declaration,input,adapter,custody,
      port=>reduceAtomicSource(port,{assets,market,codec}),guard),
    async read(expected,{assetId,saleId}) {
      const composed=await sdk.composeStatefulRead(declaration,adapter,expected,async port=>{
        const asset=await assembleAssetLightView(port,assets,assetId),sale=await assembleFixedSaleLight(port,market,saleId);
        if(sale!==null)assert.deepEqual(sale.assets,[assetId],'Paired fixture query requires the selected single asset');
        return {asset,sale};
      },guard);
      // Known original formatters have optional undefined properties that HTTP
      // JSON omits. Keep those outside the strict SDK structured-data contract.
      guard();const value={asset:composed.value.asset===null?null:formatAsset(composed.value.asset),
        sale:composed.value.sale===null?null:formatSale(composed.value.sale)};
      const body=JSON.stringify(value);assert.ok(Buffer.byteLength(body)<=declaration.limits.responseBytes,'Formatted HTTP response byte bound');
      guard();return Object.freeze({view:composed.view,value:JSON.parse(body)});
    },
  });
}
