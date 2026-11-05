import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {attributeCases,pairAttributeCase} from './attribute-oracle.mjs';
const raw=readFileSync(new URL('../../../tests/fixtures/royalty-attribute-pg16-ci-snapshot.json',import.meta.url));
assert.equal(createHash('sha256').update(raw).digest('hex'),'5cde222a623a719c512cc90960402321c3c0bd46a52ef0ffc48c609a10d69fc8');
const captured=JSON.parse(raw).royaltyAttribute,original={responses:captured.responses,reports:[{report:{result:{handlerQueries:captured.handlerQueries}}}]};
function input(pg){const rows=captured.handlerQueries.find(row=>row.case===pg.name)?.rows;
 const native=pg.status===400?null:{records:rows.map(row=>({recordVersion:1,...row,source:String(row.source)}))},managed={status:pg.status,rawText:pg.rawText,body:pg.rawText===''?null:JSON.parse(pg.rawText)},
 zero=['attribute-zero','attribute-body-query'].includes(pg.name),field=['attribute-field','attribute-body-query'].includes(pg.name),query=pg.status===400?null:{kind:'page',where:[{field:'market_contract',op:'eq',value:'atomicmarket'},{field:'collection_name',op:'eq',value:'oracle'},...(zero?[{field:'source',op:'eq',value:'0'}]:[]),...(field?[{field:'field',op:'eq',value:'name'}]:[])],order:[{field:'rule_id',direction:'asc',nulls:'last'}],offset:'0',limit:100};
 return {original,pg,native,managed,query};}
test('all six exact captured PG requests include HEAD rows and refusal without native query',()=>{for(const pg of attributeCases(original))assert.equal(pairAttributeCase(input(pg)).case,pg.name);});
test('row tampering, source-number coercion, missing predicates/order, HEAD contamination and fake refusal query fail',()=>{
 const cases=attributeCases(original),bad=[['attribute-all',x=>x.native.records[0].weight='0'],['attribute-zero',x=>x.query.where[2].value=0],['attribute-body-query',x=>x.query.where.pop()],['attribute-all',x=>x.query.order[0].direction='desc'],['attribute-head',x=>x.managed.rawText='{}'],['attribute-head',x=>x.native.records.pop()],['attribute-invalid',x=>x.native={records:[]}],['attribute-invalid',x=>x.managed.body.message='wrong']];
 for(const [name,mutate]of bad){const x=input(cases.find(row=>row.name===name));mutate(x);assert.throws(()=>pairAttributeCase(x),name);}
});
