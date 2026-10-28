'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const net = require('node:net');
const COMMIT = '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e';
const sha = b => createHash('sha256').update(b).digest('hex');
const sources = ['src/api/namespaces/atomicmarket/handlers/sales.ts','src/api/namespaces/atomicmarket/filler.ts',
  'src/api/namespaces/atomicmarket/format.ts','src/api/namespaces/atomicassets/filler.ts','src/api/namespaces/atomicassets/format.ts'];
const PRICE = 'SELECT DISTINCT ON (price.market_contract, price.collection_name, price.template_id, price.symbol) ' +
  'price.market_contract, asset.collection_name, asset.template_id, ' +
  'token.token_symbol, token.token_precision, token.token_contract, ' +
  'price.median, price.average, price.suggested_median, price.suggested_average, price.min, price.max, price.sales ' +
  'FROM atomicassets_assets asset, atomicmarket_template_prices price, atomicmarket_tokens token ' +
  'WHERE asset.contract = price.assets_contract AND asset.collection_name = price.collection_name AND ' +
  'asset.template_id = price.template_id AND asset.template_id IS NOT NULL AND ' +
  'price.market_contract = token.market_contract AND price.symbol = token.token_symbol AND ' +
  'asset.contract = $1 AND asset.asset_id = ANY($2)';

/** Direct original handlers over a finite DB script. No HTTP listener or physical database. */
module.exports = async function originalSaleAssets(fromReference, referenceRoot, input) {
  assert.ok(Array.isArray(input?.cases) && input.cases.length > 0 && input.cases.length <= 16);
  const bindings = sources.map(path => {
    const canonical = execFileSync('git',['show',COMMIT+':'+path],{cwd:referenceRoot,timeout:10000,maxBuffer:2*1024**2});
    const actual = readFileSync(join(referenceRoot,path));
    assert.equal(actual.toString().replaceAll('\r\n','\n'),canonical.toString(),'Pinned original source differs');
    return {path,gitBytes:canonical.length,gitSha256:sha(canonical),loadedBytes:actual.length,loadedSha256:sha(actual)};
  });
  const listen = net.Server.prototype.listen; let listenerAttempts = 0;
  net.Server.prototype.listen = function () {listenerAttempts++;throw Error('HTTP/listener execution is outside direct sale controls');};
  try {
    const {getSaleAction} = fromReference('./src/api/namespaces/atomicmarket/handlers/sales.ts');
    const cases = [];
    for (const c of input.cases) {
      assert.equal(typeof c.name,'string');assert.ok(Array.isArray(c.assetRows)&&c.assetRows.length<=1);
      assert.ok(Array.isArray(c.priceRows)&&c.priceRows.length<=4);
      assert.ok(c.saleRow===null||Array.isArray(c.saleRow.assets)&&c.saleRow.assets.length<=1);
      const calls=[];
      const db={async query(sql,params){
        assert.ok(calls.length<3,'Original query count exceeds this single-sale subset');
        calls.push({sql,params:structuredClone(params)});
        let rows;
        if(sql==='SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2'){
          assert.equal(calls.length,1);assert.deepEqual(params,[input.market,c.saleId]);rows=c.saleRow===null?[]:[c.saleRow];
        }else if(sql==='SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = ANY ($2)'){
          assert.equal(calls.length,2);assert.deepEqual(params,[input.assets,c.saleRow.assets]);rows=c.assetRows;
        }else{
          assert.equal(sql,PRICE,'Unexpected original SQL');assert.equal(calls.length,3);
          assert.deepEqual(params,[input.assets,c.assetRows.map(r=>r.asset_id)]);rows=c.priceRows;
        }
        return {rows:structuredClone(rows),rowCount:rows.length};
      }};
      let value=null,error=null;
      try {value=await getSaleAction({}, {pathParams:{sale_id:c.saleId},coreArgs:{atomicmarket_account:input.market,atomicassets_account:input.assets},db});}
      catch(e){error={name:e.constructor.name,message:e.message,code:e.code??null};}
      cases.push({name:c.name,value:JSON.parse(JSON.stringify(value)),error,calls});
    }
    for(const b of bindings)assert.equal(sha(readFileSync(join(referenceRoot,b.path))),b.loadedSha256);
    return {nodeVersion:process.version,cases,sourceBindings:bindings,listenerAttempts,
      scope:{originalGetSaleAction:true,originalFillSales:true,originalAssetFiller:true,originalFormatters:true,
        database:'finite scripted rows; SQL not executed',httpServer:false,postgres:false,mongo:false,sourceAuthority:false,fullParity:false}};
  } finally {net.Server.prototype.listen=listen;}
};
