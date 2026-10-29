import {createRequire} from 'node:module';
import {input,initial,row,block,collectionRow,schema2Digest} from './asset-domain-cases.mjs';
export {input,block};
const require=createRequire(import.meta.url),original=require('../../fixtures/harness/atomicassets/lifecycle/original/codec/build/index.cjs');
export const inputProfile=require('../../harness/atomicassets/lifecycle-input.cjs').loadInputProfile('portable-safe-image').descriptor;
export const serialize=data=>Buffer.from(original.serialize(data,original.CachedObjectSchema(input.format))).toString('hex');
export const template=(overrides={},present=true)=>row('templates',{template_id:42,schema_name:input.schema,transferable:false,burnable:true,
  max_supply:100,issued_supply:1,immutable_serialized_data:serialize(input.templateData),...overrides},input.collection,present);
export const mutable=(data=input.mutableTemplateData,present=true)=>row('templates2',{template_id:42,schema_name:input.schema,
  mutable_serialized_data:serialize(data)},input.collection,present);
export function begin(){
  const events=initial();events.find(e=>e.kind==='action'&&e.name==='logmint').value.template_id=42;
  events.find(e=>e.kind==='row'&&e.table==='config').value.supported_tokens=[];
  return [template(),mutable(),...events];
}
export const caseInputs=()=>({contract:input.contract,inputProfile,cases:[
  {name:'chronological',blocks:[begin(),[mutable({name:'replacement template mutable',image:'current.png'})],
    [template({max_supply:1,immutable_serialized_data:serialize({...input.templateData,name:'ignored changed immutable'})})],
    [template({},false),mutable({},false)],
    [collectionRow({...input.collectionData,name:'current collection only'}),row('schemas',{schema_name:input.schema,
      format:[...input.format,{name:'new_field',type:'string'}]},input.collection,true,
      schema2Digest)]].map((events,n)=>({...block(n),events}))},
  {name:'stable-equal-priority',blocks:[{...block(0),events:[mutable(),template(),...begin().filter(e=>e.kind!=='row'||!['templates','templates2'].includes(e.table))]}]},
  {name:'unknown-delete',blocks:[{...block(0),events:[template({template_id:43},false)]}]},
  {name:'missing-schema',blocks:[{...block(0),events:[template()]}]},
  {name:'bad-bytes',blocks:[{...block(0),events:[template({immutable_serialized_data:'ff'}),...begin().filter(e=>e.kind==='row'&&!['templates','templates2'].includes(e.table))]}]},
]});
