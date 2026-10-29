/** Original 2.7 handlers and returnAsJSON, reached through Fastify.inject; no listener. */
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {join} = require('node:path');
module.exports = async function originalIdHttp(fromReference, root, input) {
  const Fastify = require('fastify');
  assert.ok(Array.isArray(input?.cases)&&input.cases.length<=32);
  for(const c of input.cases)assert.ok(['asset','sale'].includes(c.kind)&&typeof c.id==='string'&&c.id.length<=4096
    &&Array.isArray(c.assetRows)&&c.assetRows.length<=1&&Array.isArray(c.saleRows)&&c.saleRows.length<=1);
  let selected;const calls=[];
  const database={async query(sql,params){
    calls.push({sql,params:structuredClone(params)});let rows;
    if(sql==='SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = ANY ($2)')rows=selected.assetRows;
    else if(sql==='SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2')rows=selected.saleRows;
    else if(sql.startsWith('SELECT DISTINCT ON (price.market_contract'))rows=[];
    else throw Error('Unexpected original SQL: '+sql);
    return {rows:structuredClone(rows),rowCount:rows.length};}};
  assert.ok(root, 'AA_REFERENCE_ROOT must identify the installed pinned reference');
  const commit = '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e';
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),commit);
  assert.equal(execFileSync('git',['rev-parse','refs/tags/2.7.0'],{cwd:root,encoding:'utf8'}).trim(),commit);
  const paths = ['src/api/server.ts','src/api/utils.ts','src/api/namespaces/validation.ts','src/utils/index.ts',
    'src/api/namespaces/atomicassets/routes/assets.ts','src/api/namespaces/atomicassets/filler.ts',
    'src/api/namespaces/atomicassets/format.ts','src/api/namespaces/atomicmarket/handlers/sales.ts',
    'src/api/namespaces/atomicmarket/filler.ts','src/api/namespaces/atomicmarket/format.ts'];
  const bindings = paths.map(path => {
    const raw = execFileSync('git',['show',commit+':'+path],{cwd:root});
    assert.equal(readFileSync(join(root,path),'utf8').replaceAll('\r\n','\n'),raw.toString());
    return {path,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};
  });
  const req=fromReference;
  const {HTTPServer} = req('./src/api/server.ts');
  const {AssetApi} = req('./src/api/namespaces/atomicassets/routes/assets.ts');
  const {formatAsset} = req('./src/api/namespaces/atomicassets/format.ts');
  const {getSaleAction} = req('./src/api/namespaces/atomicmarket/handlers/sales.ts');
  const connection = {database:{createPool:()=>database},redis:{ioRedis:new Proxy({},{get(){throw Error('Redis outside this control');}})},
    chain:{name:'id-http-control',rpc:{async get_info(){return {};}}}};
  const net=require('node:net'),listen=net.Server.prototype.listen;let listenerAttempts=0;
  net.Server.prototype.listen=function(){listenerAttempts++;throw Error('Listener outside inject control');};
  const server = new HTTPServer({server_name:'reference.invalid',cache_life:0},connection);
  const core = {args:{atomicassets_account:'atomicassets',atomicmarket_account:'atomicmarket'}};
  const asset = new AssetApi(core,server,'Asset','atomicassets_assets_master',formatAsset);
  const middleware = kind => server.web.returnAsJSON(kind==='asset'?asset.getAssetAction:getSaleAction,core);
  const fastify=Fastify(),cases=[];try {
    for(const kind of ['asset','sale'])fastify.all('/'+(kind==='asset'?'atomicassets/v1/assets/:asset_id':'atomicmarket/v1/sales/:sale_id'),async(request,reply)=>{
      const response={status(code){reply.code(code);return response;},json(value){reply.send(value);return response;}};
      await middleware(kind)({params:request.params,query:request.query,body:request.body},response);
      return reply;
    });
    for(const item of input.cases){
      selected=item;calls.length=0;
      const url='/'+(item.kind==='asset'?'atomicassets/v1/assets/':'atomicmarket/v1/sales/')+encodeURIComponent(item.id);
      const response=await fastify.inject({url,method:item.method??'GET'});
      cases.push({name:item.name,kind:item.kind,input:item.id,status:response.statusCode,body:response.json(),calls:structuredClone(calls)});
    }
    return {nodeVersion:process.version,cases,bindings,listenerAttempts,scope:{originalHandlers:true,originalReturnAsJSON:true,fastifyInject:true,physicalPostgres:false,productionHost:false,fullParity:false}};
  }finally{await fastify.close();server.httpServer.closeAllConnections();await new Promise(resolve=>server.socket.io.close(resolve));net.Server.prototype.listen=listen;}
};
