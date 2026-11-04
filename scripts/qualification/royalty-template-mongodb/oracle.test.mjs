import test from 'node:test';
import assert from 'node:assert/strict';
import {originalSnapshot,verifySuccess,verifyRefusal,SUCCESS,REFUSALS} from './oracle.mjs';
test('original PostgreSQL snapshot is pinned and physical outcomes stay distinct',()=>{
 const pg=originalSnapshot();assert.equal(SUCCESS.length,10);assert.equal(REFUSALS.length,6);
 const row=pg.results.find(x=>x.name==='two'),good={statusCode:200,body:{...row.http.body,query_time:1},nativeComplete:true,nativeRows:structuredClone(row.http.body.data)};
 assert.deepEqual(verifySuccess(row,good),{name:'two',rows:2});
 assert.throws(()=>verifySuccess(row,{...good,nativeComplete:false}));assert.throws(()=>verifySuccess(row,{...good,nativeRows:[]}));assert.throws(()=>verifySuccess(row,{...good,body:{success:true,data:[]}}));
 const bad=pg.results.find(x=>x.name==='null-one');assert.deepEqual(verifyRefusal(bad,{statusCode:503,body:{success:false},nativeAttempts:0}),{name:'null-one',originalPgCode:'22P02',candidateStatus:503});
 assert.throws(()=>verifyRefusal(bad,{statusCode:500,body:{success:false},nativeAttempts:0}));assert.throws(()=>verifyRefusal(bad,{statusCode:503,body:{success:false},nativeAttempts:1}));
});
