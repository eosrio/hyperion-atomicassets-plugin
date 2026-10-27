import {readFileSync} from 'node:fs';
export const input=JSON.parse(readFileSync(new URL('../../fixtures/harness/atomicmarket/lifecycle/input.json',import.meta.url)));
export const expected=JSON.parse(readFileSync(new URL('../../fixtures/harness/atomicmarket/lifecycle/expected.json',import.meta.url)));
export const key=(...parts)=>JSON.stringify(parts);
export const context=offset=>({marketContract:input.marketContract,assetsContract:input.assetsContract,blockNum:String(input.baseBlock+offset),
  blockTimeMs:String(Date.parse(input.baseTime+'Z')+offset*1000),blockId:(offset+1).toString(16).padStart(64,'0'),
  contractVersion:{version:'1.2.2',occurrence:'constructed-config:1',abiDeployment:'constructed-market-abi:1',abiSha256:'a'.repeat(64)}});
export const occurrence=(event,index=0)=>({kind:'action',contract:input.marketContract,name:event.name,transactionId:'cd'.repeat(32),
  evidence:{occurrence:'constructed-action:'+index,abiDeployment:'constructed-market-abi:1',abiSha256:'a'.repeat(64)},value:structuredClone(event.data)});
export const scenario=name=>input.cases.find(value=>value.name===name);
export const oracle=name=>expected.cases.find(value=>value.name===name);
export const rows=s=>[...s.snapshot()].filter(([k])=>k.startsWith('market-sale:')).map(([,v])=>v);

/** Finite local callback storage only; no SDK recovery, physical engine or source authority. */
export function storage(relations=input.relationships){
  let state=new Map();const complete=new Set();
  const identity=(kind,k)=>kind+':'+k;
  function add(kind,...parts){complete.add(identity(kind,key(...parts)));}
  function seed(kind,k,value){complete.add(identity(kind,k));state.set(identity(kind,k),structuredClone(value));}
  const r=structuredClone(relations);
  const bindings=[['offer',key(input.assetsContract,input.offerId),r.offer],['collection',key(input.assetsContract,'fixturecoll'),r.collection],
    ['market-token',key(input.marketContract,'WAX'),r.token],['symbol-pair',key(input.marketContract,'WAX','WAX'),r.symbolPair],
    ['offer-assets',key(input.assetsContract,input.offerId),r.offerAssets],['contract-code',key('seller'),r.sellerCode]];
  for(const [kind,k,value]of bindings){complete.add(identity(kind,k));if(value!==null)seed(kind,k,value);}
  add('market-sale',input.marketContract,input.saleId);
  const port=target=>({async get(kind,k){const id=identity(kind,k);if(!complete.has(id))return {status:'unavailable',reason:'fixture source does not cover key'};
    return target.has(id)?{status:'present',value:structuredClone(target.get(id))}:{status:'covered-absent'};},
    put(kind,k,value){target.set(identity(kind,k),structuredClone(value));},delete(kind,k){target.delete(identity(kind,k));}});
  return {add,seed,reader:()=>port(state),snapshot:()=>structuredClone(state),
    absent(kind,k){state.delete(identity(kind,k));complete.add(identity(kind,k));},unknown(kind,k){complete.delete(identity(kind,k));},
    async run(reduce,b,events){const candidate=structuredClone(state);await reduce(b,events,port(candidate));state=candidate;}};
}
export async function listed(reduce){const s=storage();const c=scenario('same-block-start-before-create');await s.run(reduce,context(0),c.blocks[0].events.map(occurrence));return s;}
