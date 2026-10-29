'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {scriptedTransaction}=require('../../harness/atomicassets/original-controls.cjs');
const {validateInputProfile}=require('../../harness/atomicassets/lifecycle-input.cjs');
const copy=structuredClone,json=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(x).digest('hex');

module.exports=async function(fromReference,referenceRoot,input){
  const selected=validateInputProfile(input.inputProfile);
  assert.equal(input.contract,selected.input.contract);assert.ok(input.cases.length<=12);
  const codec={package:'@atomichub/atomicassets',version:fromReference('@atomichub/atomicassets/package.json').version,
    sha256:hash(readFileSync(fromReference.resolve('@atomichub/atomicassets')))};
  assert.equal(codec.version,'2.2.0');
  assert.equal(codec.sha256,'2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573');
  const {default:Processor,ProcessingState}=fromReference('./src/filler/processor.ts');
  const {configProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/config.ts');
  const {collectionProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/collections.ts');
  const {schemaProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/schemas.ts');
  const {templateProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/templates.ts');
  const {assetProcessor}=fromReference('./src/filler/handlers/atomicassets/processors/assets.ts');
  const {formatAsset}=fromReference('./src/api/namespaces/atomicassets/format.ts');
  const paths=['src/filler/processor.ts','src/filler/handlers/atomicassets/processors/config.ts',
    'src/filler/handlers/atomicassets/processors/collections.ts','src/filler/handlers/atomicassets/processors/schemas.ts',
    'src/filler/handlers/atomicassets/processors/templates.ts','src/filler/handlers/atomicassets/processors/assets.ts',
    'src/api/namespaces/atomicassets/format.ts','definitions/views/atomicassets_assets_master.sql','definitions/tables/atomicassets_tables.sql'];
  const sources=paths.map(path=>{const raw=execFileSync('git',['show','0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e:'+path],{cwd:referenceRoot});
    assert.equal(readFileSync(join(referenceRoot,path),'utf8').replaceAll('\r\n','\n'),raw.toString());return{path,sha256:hash(raw)};});
  const cases=[];
  for(const item of input.cases){
    assert.ok(item.blocks.length<=8);const boundary=scriptedTransaction(input.contract),snapshots=[];
    const core={args:{atomicassets_account:input.contract,store_transfers:false},config:{supported_tokens:[],collection_format:[]},tokenconfigs:{version:'1.0.0'}};
    const processor=new Processor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true});
    const releases=[configProcessor(core,processor),collectionProcessor(core,processor),schemaProcessor(core,processor),
      templateProcessor(core,processor),assetProcessor(core,processor,{sendActionTrace(){}})];
    const rows=name=>boundary.tables.get('atomicassets_'+name)??[];
    // Independent finite model of the pinned assets_master SELECT shape, not a SQL engine.
    function views(){return rows('assets').flatMap(asset=>{
      const collection=rows('collections').find(c=>c.contract===asset.contract&&c.collection_name===asset.collection_name);
      const schema=rows('schemas').find(s=>s.contract===asset.contract&&s.collection_name===asset.collection_name&&s.schema_name===asset.schema_name);
      if(!collection||!schema)return[];
      const template=rows('templates').find(t=>t.contract===asset.contract&&t.template_id===asset.template_id),data=JSON.parse(collection.data);
      const decoded=value=>value==null?null:JSON.parse(value),text=value=>value==null?null:String(value);
      const view={...copy(asset),template_id:text(asset.template_id),is_transferable:template?template.transferable:true,is_burnable:template?template.burnable:true,
        collection:{collection_name:collection.collection_name,name:data.name??null,img:data.img??null,images:data.images??null,
          author:collection.author,allow_notify:collection.allow_notify,authorized_accounts:collection.authorized_accounts,notify_accounts:collection.notify_accounts,
          market_fee:collection.market_fee,created_at_block:String(collection.created_at_block),created_at_time:String(collection.created_at_time)},
        schema:{schema_name:schema.schema_name,format:schema.format.map(JSON.parse),types:(schema.types??[]).map(JSON.parse),
          created_at_block:String(schema.created_at_block),created_at_time:String(schema.created_at_time)},
        template:template?{template_id:String(template.template_id),max_supply:String(template.max_supply),issued_supply:String(template.issued_supply),
          is_transferable:template.transferable,is_burnable:template.burnable,immutable_data:decoded(template.immutable_data),mutable_data:decoded(template.mutable_data),
          created_at_block:String(template.created_at_block),created_at_time:String(template.created_at_time),
          deleted_at_block:text(template.deleted_at_block),deleted_at_time:text(template.deleted_at_time)}:null,
        mutable_data:decoded(asset.mutable_data),immutable_data:decoded(asset.immutable_data),template_mint:String(asset.template_mint??0),backed_tokens:[],original_mint:null};
      for(const name of ['burned_at_block','burned_at_time','updated_at_block','updated_at_time','transferred_at_block','transferred_at_time','minted_at_block','minted_at_time'])view[name]=text(view[name]);
      return[{view,formatted:json(formatAsset(copy(view)))}];
    });}
    try{for(const b of item.blocks){
      assert.ok(b.events.length<=16);const previous=copy(boundary.tables);let error=null;
      const block={block_num:Number(b.blockNum),block_id:b.blockId,timestamp:new Date(Number(b.blockTimeMs)).toISOString().slice(0,-1)};
      for(const event of b.events){
        if(event.kind==='row')processor.processContractRow(block,{code:input.contract,scope:event.scope,table:event.table,present:event.present,value:copy(event.value)});
        else processor.processActionTrace(block,{id:event.transactionId},{act:{account:input.contract,name:event.name,data:copy(event.value)},global_sequence:'9007199254740993'});
      }
      try{await processor.executeHeadQueue(boundary.db);}catch(e){error=e.message;boundary.tables.clear();for(const [k,v]of previous)boundary.tables.set(k,v);}
      snapshots.push({error,templates:json(rows('templates')),assets:json(rows('assets')),views:views()});if(error)break;
    }}finally{for(const release of releases)release();}
    assert.deepEqual(processor.getActiveListeners(),{trace_listeners:[],table_listeners:[]});
    cases.push({name:item.name,snapshots,calls:boundary.calls,listenersReleased:true});
  }
  const result={nodeVersion:process.version,codec,inputProfile:selected.descriptor,inputSha256:hash(JSON.stringify(input)),sources,cases,
    scope:{originalProcessors:true,originalPriorityScheduler:true,originalAssetFormatter:true,viewShape:'finite independent model of pinned SQL SELECT',
      postgres:false,mongo:false,sourceAuthority:false,templateMintMaintenance:false,nestedSalePriceParity:false,fullParity:false}};
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=1024*1024);return result;
};
