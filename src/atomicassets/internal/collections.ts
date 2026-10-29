import type {AtomicObject} from '../asset.js';
import {decimal,domainKey,read,record,strings,text,unavailable,
  type DomainReader,type DomainStage,type LifecycleBlock,type LifecycleEvent} from './lifecycle-port.js';

/** Original authorswaps UPDATE. No row is created; source/candidate ownership remains caller-owned. */
export async function reduceAuthorSwap(b: LifecycleBlock,event: Extract<LifecycleEvent,{kind:'row'}>,stage: DomainStage): Promise<void> {
  const name=text(event.value.collection_name);
  let author: string | null=null,date: string | null=null;
  if(event.present){
    if(typeof event.value.new_author!=='string')return unavailable('Invalid pending collection author');
    const seconds=event.value.acceptance_date;
    if(typeof seconds!=='number'||!Number.isInteger(seconds)||seconds<0||seconds>4294967295)
      return unavailable('Invalid uint32 author-swap time');
    author=event.value.new_author;date=String(seconds*1000);
  }
  const key=domainKey(b.contract,name),old=await read(stage,'collection',key);
  if(old===null)return;
  if(old.contract!==b.contract||old.collection_name!==name)return unavailable('Mismatched author-swap collection');
  stage.put('collection',key,{...old,new_author_name:author,new_author_date:date});
}

const selected=(v: unknown): string | null => v==null?null:typeof v==='string'?v:
  unavailable('Nontext selected collection metadata is outside this component');

/** Full pinned collections_master shape from one caller-owned coherent view; no formatter normalization. */
export async function readCollectionId(reader: DomainReader,contract: string,name: string): Promise<AtomicObject | null> {
  text(contract);text(name);
  const row=await read(reader,'collection',domainKey(contract,name));
  if(row===null)return null;
  const required=['contract','collection_name','author','allow_notify','authorized_accounts','notify_accounts','market_fee',
    'data','created_at_block','created_at_time','new_author_name','new_author_date'];
  if(required.some(field=>!Object.hasOwn(row,field))||row.contract!==contract||row.collection_name!==name)
    return unavailable('Incomplete or mismatched collection row');
  if(typeof row.allow_notify!=='boolean'||typeof row.market_fee!=='number'||!Number.isFinite(row.market_fee))
    return unavailable('Invalid collection flag or fee');
  if(row.new_author_name!==null&&typeof row.new_author_name!=='string')return unavailable('Invalid pending collection author');
  const data=record(row.data);
  return record({contract,collection_name:name,name:selected(data.name),img:selected(data.img),author:text(row.author),
    allow_notify:row.allow_notify,authorized_accounts:strings(row.authorized_accounts),notify_accounts:strings(row.notify_accounts),
    market_fee:row.market_fee,data,created_at_block:decimal(row.created_at_block),created_at_time:decimal(row.created_at_time),
    new_author_name:row.new_author_name,new_author_date:row.new_author_date===null?null:decimal(row.new_author_date)});
}
