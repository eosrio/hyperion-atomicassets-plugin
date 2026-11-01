'use strict';
const assert = require('node:assert/strict');

// Calls the unmodified 2.7 handler and formatter against its migrated SQL schema.
module.exports = async function schemaOracle(fromReference, db) {
  fromReference('./src/api/namespaces/lists.ts').initListValidator(db);
  const {getSchemasAction, getSchemasCountAction} = fromReference('./src/api/namespaces/atomicassets/handlers/schemas.ts');
  const ctx = {db, coreArgs:{atomicassets_account:'atomicassets'}};
  const contract='atomicassets';
  for (const [name, data] of [['colone',{name:42,img:true,images:[1,'x']}],['coltwo',{name:{a:1},img:null,images:false}]]) {
    await db.query(`INSERT INTO atomicassets_collections (contract,collection_name,author,allow_notify,authorized_accounts,notify_accounts,market_fee,data,created_at_block,created_at_time) VALUES ($1,$2,'author',true,ARRAY['author']::varchar[],ARRAY[]::varchar[],0,$3,1,1)`,[contract,name,JSON.stringify(data)]);
  }
  for (const [collection,name] of [['colone','missing'],['colone','zero'],['colone','positive'],['colone','peer'],['coltwo','peer']]) {
    await db.query(`INSERT INTO atomicassets_schemas (contract,collection_name,schema_name,format,types,created_at_block,created_at_time) VALUES ($1,$2,$3,ARRAY[]::jsonb[],ARRAY[]::jsonb[],1,1)`,[contract,collection,name]);
  }
  for (const [name,n] of [['zero',0],['positive',2]]) await db.query(`INSERT INTO atomicassets_asset_counts (contract,collection_name,schema_name,template_id,assets) VALUES ($1,'colone',$2,0,$3)`,[contract,name,n]);
  const asc=await getSchemasAction({sort:'assets',order:'asc'},ctx);
  const desc=await getSchemasAction({sort:'assets',order:'desc'},ctx);
  assert.deepEqual(asc.slice(0,2).map(x=>x.schema_name),['zero','positive']);
  assert.deepEqual(desc.slice(0,2).map(x=>x.schema_name),['positive','zero']);
  assert.deepEqual(new Set(asc.slice(2).map(x=>x.schema_name)),new Set(['missing','peer']));
  assert.deepEqual(new Set(desc.slice(2).map(x=>x.schema_name)),new Set(['missing','peer']));
  assert.equal(asc.find(x=>x.schema_name==='missing').assets,0);
  assert.equal(asc.find(x=>x.schema_name==='zero').assets,0);
  assert.equal(asc.find(x=>x.schema_name==='positive').assets,2);
  assert.equal(asc.find(x=>x.schema_name==='zero').collection.name,'42');
  assert.equal(asc.find(x=>x.schema_name==='zero').collection.img,'true');
  assert.equal(asc.find(x=>x.schema_name==='zero').collection.images,'[1, "x"]');
  assert.equal(asc.find(x=>x.schema_name==='peer' && x.collection.collection_name==='coltwo').collection.img,null);
  assert.equal(asc.find(x=>x.schema_name==='peer' && x.collection.collection_name==='coltwo').collection.name,'{"a": 1}');
  assert.equal(asc.find(x=>x.schema_name==='peer' && x.collection.collection_name==='coltwo').collection.images,'false');
  const count=[];
  for (const p of [{page:'1',limit:'1',order:'asc'},{page:'99',limit:'2',sort:'assets',order:'desc'}]) count.push(await getSchemasCountAction(p,ctx));
  assert.deepEqual(count,['5','5']);
  await db.query(`INSERT INTO atomicassets_asset_counts (contract,collection_name,schema_name,template_id,assets) VALUES ($1,'colone','positive',1,2147483647)`,[contract]);
  let countOverflow; try {countOverflow={value:await getSchemasCountAction({sort:'assets',order:'asc'},ctx)};} catch(e) {countOverflow={code:e.code,message:e.message};}
  assert.deepEqual(countOverflow,{value:'5'});
  let pageOverflow; try {await getSchemasAction({sort:'assets',order:'asc'},ctx); pageOverflow={unexpectedSuccess:true};} catch(e) {pageOverflow={code:e.code,message:e.message};}
  assert.equal(pageOverflow.code,'22003');
  const metadata=(await db.query(`SELECT current_setting('server_version') AS server_version, current_setting('server_encoding') AS server_encoding, d.datcollate, d.datctype, d.datlocprovider, d.datcollversion, pg_database_collation_actual_version(d.oid) AS actual_collation_version FROM pg_database d WHERE d.datname=current_database()`)).rows[0];
  const columns=(await db.query(`SELECT a.attname,c.collname,c.collprovider,c.collversion,pg_collation_actual_version(c.oid) AS actual_version FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_collation c ON c.oid=a.attcollation WHERE t.relname='atomicassets_schemas' AND a.attname IN ('collection_name','schema_name')`)).rows;
  return {asc,desc,count,countOverflow,pageOverflow,metadata,columns,peerGroups:[{sort:'assets',schema_name:'peer',collections:asc.filter(x=>x.schema_name==='peer').map(x=>x.collection.collection_name)}],scope:'constructed PostgreSQL handler evidence; no Mongo or full parity'};
};
