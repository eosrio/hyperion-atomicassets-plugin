// Inert characterization of source-pinned original processor + ContractDBTransaction.
// No PostgreSQL, socket or listener is constructed; mock query rows only drive SQL branches.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {stripTypeScriptTypes} from 'node:module';import {createContext,Script} from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{steps}=require('./royalty-rule-plan.cjs'),{expected}=require('./royalty-rule-census.cjs');
const source=readFileSync(new URL('./royalty-rule-original-database.source.txt',import.meta.url));assert.equal(source.length,50216);assert.equal(createHash('sha256').update(source).digest('hex'),'24882decf0a6823cde7dd0d7c7c59df727fac64863c6ef3ff6380c3e232c5054');
let code=source.toString();code=code.slice(code.indexOf('export class ContractDBTransaction'),code.indexOf('\nexitHook(')).replace('export class ContractDBTransaction','class ContractDBTransaction');
const old='readonly client: PoolClient, readonly name: string, readonly stats: {operations: number}, readonly currentBlock?: number';assert(code.includes(old));code=code.replace(old,'client: PoolClient, name: string, stats: {operations: number}, currentBlock?: number').replace('this.lock = new AwaitLock();','this.client = client; this.name = name; this.stats = stats; this.currentBlock = currentBlock; this.lock = new AwaitLock();');
const text=source.toString(),slice=(start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(a>=0&&b>a);return text.slice(a,b);};
const context=createContext({Buffer,AwaitLock:class{async acquireAsync(){}release(){}},arraysEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),logger:{debug(){},error(){},warn(){}},ContractDB:{transactions:[]}});
new Script(stripTypeScriptTypes(slice('function changeQueryVarOffset','\nfunction removeIdenticalValues')+'\n'+slice('function buildPrimaryCondition','\nexport interface ColumnMeta'),{mode:'strip'})).runInContext(context);const Transaction=new Script(stripTypeScriptTypes(code,{mode:'strip'})+'\nContractDBTransaction').runInContext(context);
const procSource=readFileSync(new URL('../../../tests/fixtures/royalty-rule-original-2.7/processor.ts',import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/^export /gm,'');
const processorContext=createContext({Buffer,encodeDatabaseJson:x=>JSON.stringify(x).replace(/\\u0000/g,' '),eosioTimestampToDate:x=>new Date(x+'+0000'),AtomicMarketUpdatePriority:{TABLE_ROYALTIES:1010,ACTION_LOG_ROYALTIES:1040}});
const royaltyProcessor=new Script(stripTypeScriptTypes(procSource,{mode:'strip'})+'\nroyaltyProcessor').runInContext(processorContext);
test('source-pinned original callbacks and original transaction methods produce the complete ordered DML census',async()=>{
 const callbacks=new Map(),processor={onContractRow(_contract,table,fn){callbacks.set(table,fn);return()=>{};},onActionTrace(){return()=>{};}};royaltyProcessor({args:{atomicmarket_account:'atomicmarket'}},processor);
 const live=new Map(),actual=[];let stage;
 const client={escapeIdentifier:s=>'"'+s.replaceAll('"','""')+'"',async query(sql,values=[]){let rowCount=null,rows=[];const table=/"atomicmarket_royalties_(templates|attributes)"/.exec(sql)?.[1];
  if(sql.startsWith('SELECT * FROM')&&table){const key=table+':'+values[2];rowCount=live.has(key)?1:0;rows=rowCount?[{}]:[];}
  else if(sql.startsWith('INSERT INTO')&&table){live.set(table+':'+values[2],true);rowCount=1;}
  else if(sql.startsWith('UPDATE')&&table)rowCount=1;
  else if(sql.startsWith('DELETE')&&table){live.delete(table+':'+values[2]);rowCount=1;}
  actual.push({stage,sql,bindings:JSON.parse(JSON.stringify(values)),rowCount});return {rows,rowCount};}};
 for(let i=0;i<steps.length;i++){const step=steps[i];stage=step.name;await client.query('BEGIN');const tx=new Transaction(client,'test',{operations:0});tx.inTransaction=true;
  const block={block_num:i+1,timestamp:`2023-11-14T22:13:0${i}.000`};for(const row of step.rows)await callbacks.get(row.table)(tx,block,{scope:'oracle',present:row.present!==false,value:structuredClone(row.value)});await client.query('COMMIT');}
 assert.deepEqual(actual,expected().census);
});
