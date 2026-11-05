// Original values arrive only from the separately pinned, fully gated PG reports.
import assert from 'node:assert/strict';
import {decodeRoyaltyRecords,pairRoyaltyRows} from './pair.mjs';
export const CASES=Object.freeze(['attribute-all','attribute-zero','attribute-field','attribute-invalid','attribute-body-query','attribute-head']);
export function attributeCases(original){
 assert(Array.isArray(original?.responses));const selected=original.responses.filter(row=>row.route==='attributes');
 assert.deepEqual(selected.map(row=>row.name),CASES);assert.deepEqual(selected.map(row=>row.status),[200,200,200,400,200,200]);
 assert.equal(selected.at(-1).method,'HEAD');assert.equal(selected.at(-1).rawText,'');return selected;
}
export function pairAttributeCase({original,pg,native,managed,query}){
 assert(CASES.includes(pg.name));assert.equal(managed.status,pg.status);
 if(pg.status===400){assert.equal(native,null);assert.equal(query,null);assert.deepEqual(managed.body,JSON.parse(pg.rawText));return {case:pg.name,status:400,nativeQuery:false};}
 assert(native&&Array.isArray(native.records));assert.equal(query.kind,'page');assert.deepEqual(query.order,[{field:'rule_id',direction:'asc',nulls:'last'}]);
 assert.deepEqual(query.where.slice(0,2),[{field:'market_contract',op:'eq',value:'atomicmarket'},{field:'collection_name',op:'eq',value:'oracle'}]);
 const filters=query.where.slice(2),zero=pg.name==='attribute-zero'||pg.name==='attribute-body-query',field=pg.name==='attribute-field'||pg.name==='attribute-body-query';
 assert.deepEqual(filters,[...(zero?[{field:'source',op:'eq',value:'0'}]:[]),...(field?[{field:'field',op:'eq',value:'name'}]:[])]);
 assert.equal(query.offset,'0');assert.equal(query.limit,100);
 if(pg.method==='HEAD'){
  assert.equal(managed.rawText,'');assert.equal(managed.body,null);
  const rows=original.reports[0].report.result.handlerQueries.filter(row=>row.case===pg.name);assert.equal(rows.length,1);
  const decoded=decodeRoyaltyRecords('attributes',native.records);assert.deepEqual(decoded,rows[0].rows);
  return {case:pg.name,status:200,head:true,rows:decoded,source:'independently-decoded-driver-event-bson-v1'};
 }
 const pair=pairRoyaltyRows({route:'attributes',decodedRecords:native.records,originalHttp:pg,managedHttp:managed});return {case:pg.name,status:200,...pair};
}
