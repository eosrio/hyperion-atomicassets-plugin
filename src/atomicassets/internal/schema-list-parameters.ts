import {StatefulContractError} from '@eosrio/hyperion-sdk/projection-stateful';
import type {IndexedRequestV1,IndexedPredicateV1} from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import type {OperatorListHost} from './schema-query.js';
import {schemaListOrder} from '../../stateful/schema-indexed.js';

export class SchemaListParameterError extends Error {
  constructor(readonly parameter: string) {super('Invalid value for parameter '+parameter);}
}
const unavailable = (): never => {throw new StatefulContractError('stateful.unavailable','Schema query inputs are unavailable');};
const nameRE=/^[.1-5a-z]{1,12}[.1-5a-j]?$/, intRE=/^-?\d+$/;
type Definition={readonly type:'int'|'name'|'string'|'bool'|'names'|'strings';readonly min?:number;readonly max?:number;
  readonly allowed?:readonly string[];readonly default?:unknown};
type Values=Record<string,string|number|boolean|readonly string[]|undefined>;

/** Original field order and one-pass list expansion; one request provider, no cross-request cache. */
export async function parseSchemaListParameters(params: Readonly<Record<string,unknown>>,contract: string,
  listHost?: () => OperatorListHost|Promise<OperatorListHost>, maximum?: number): Promise<{
    readonly request: IndexedRequestV1;
  }> {
  const maxLimit=maximum||1000;
  if(!Number.isSafeInteger(maxLimit)||maxLimit<1) return unavailable();
  let provider: Promise<OperatorListHost>|undefined;
  let identity:{readonly source:string;readonly generation:string}|undefined;
  const lists=new Map<string,readonly string[]>();
  async function expand(tokens: readonly string[]): Promise<readonly string[]> {
    // Resolve in source token order: a later list failure must not replace an earlier failure.
    for(const token of tokens) if(token.startsWith('$list:')&&!lists.has(token.slice(6))) {
      if(!listHost) return unavailable();
      provider??=Promise.resolve().then(listHost);
      const name=token.slice(6),result=await(await provider).resolve([name]);
      if(!result||typeof result.source!=='string'||!result.source||typeof result.generation!=='string'||!result.generation||!Array.isArray(result.entries)
        ||result.entries.length!==1||result.entries[0]?.name!==name||!Array.isArray(result.entries[0].items)
        ||result.entries[0].items.some((item:unknown)=>typeof item!=='string')) return unavailable();
      if(identity&&(identity.source!==result.source||identity.generation!==result.generation))return unavailable();
      identity??={source:result.source,generation:result.generation};
      lists.set(name,[...result.entries[0].items]);
    }
    return tokens.flatMap(token=>token.startsWith('$list:')?lists.get(token.slice(6))!:[token]);
  }
  async function fields(definitions: Readonly<Record<string,Definition>>): Promise<Values> {
    const result: Values={};
    for(const [key,definition] of Object.entries(definitions)) {
      const input=params[key],array=definition.type==='names'||definition.type==='strings';
      if(typeof input!=='string'||input==='') {result[key]=array?[]:definition.default as Values[string];continue;}
      // Original expands the whole field before validating any expanded member.
      const values=array?await expand(input.split(',')):[input];
      const converted=values.map(value=>{
        let selected: string|number|boolean=value;
        if(definition.type==='name'||definition.type==='names') {if(!nameRE.test(value))throw new SchemaListParameterError(key);}
        if(definition.type==='int') {
          selected=parseInt(value,10);
          if(!intRE.test(value)||Number.isNaN(selected)||definition.min!==undefined&&selected<definition.min
            ||definition.max!==undefined&&selected>definition.max) throw new SchemaListParameterError(key);
        } else if(definition.type==='bool') {
          if(value==='true'||value==='1')selected=true;
          else if(value==='false'||value==='0')selected=false;
          else throw new SchemaListParameterError(key);
        } else if(definition.type==='string'&&(definition.min!==undefined&&value.length<definition.min
          ||definition.max!==undefined&&value.length>definition.max)) throw new SchemaListParameterError(key);
        if(definition.allowed&&!definition.allowed.includes(value))throw new SchemaListParameterError(key);
        return selected;
      });
      result[key]=array?converted as readonly string[]:converted[0];
    }
    return result;
  }
  const args=await fields({
    page:{type:'int',min:1,max:Number.MAX_SAFE_INTEGER,default:1},
    limit:{type:'int',min:1,max:maxLimit,default:Math.min(maxLimit,100)},
    sort:{type:'string',allowed:['created','schema_name','assets'],default:'created'},
    order:{type:'string',allowed:['asc','desc'],default:'desc'},
    authorized_account:{type:'name'},collection_name:{type:'names'},schema_name:{type:'names'},
    match:{type:'name'},count:{type:'bool'}});
  const where: IndexedPredicateV1[]=[{field:'contract',op:'eq',value:contract}];
  const member=(field:string,values:readonly string[])=>{if(values.length)where.push({field,op:'in',values});};
  member('collection_name',args.collection_name as readonly string[]);member('schema_name',args.schema_name as readonly string[]);
  if(args.authorized_account)where.push({field:'authorized_accounts',op:'array-contains',value:args.authorized_account as string});
  if(args.match)where.push({field:'schema_name',op:'text-contains',value:(args.match as string).toLowerCase()});
  const bounds=await fields({lower_bound:{type:'string',min:1},upper_bound:{type:'string',min:1},
    before:{type:'int',min:1,max:Number.MAX_SAFE_INTEGER},after:{type:'int',min:1,max:Number.MAX_SAFE_INTEGER},
    ids:{type:'strings'},schema_name:{type:'strings'}});
  // Keep this second conjunction, including the source union; do not simplify it into the first filter.
  member('schema_name',[...bounds.ids as readonly string[],...bounds.schema_name as readonly string[]]);
  if(bounds.lower_bound)where.push({field:'schema_name',op:'gte',value:bounds.lower_bound as string});
  if(bounds.upper_bound)where.push({field:'schema_name',op:'lt',value:bounds.upper_bound as string});
  if(bounds.before)where.push({field:'created_at_time',op:'lt',value:String(bounds.before)});
  if(bounds.after)where.push({field:'created_at_time',op:'gt',value:String(bounds.after)});
  const grey=await fields({collection_blacklist:{type:'names'},collection_whitelist:{type:'names'},account_blacklist:{type:'names'}});
  const black=grey.collection_blacklist as readonly string[],white=grey.collection_whitelist as readonly string[];
  if(white.length&&black.length)where.push({field:'collection_name',op:'in',values:white.filter(name=>!black.includes(name))});
  else {member('collection_name',white);if(black.length)where.push({field:'collection_name',op:'not-in',values:black});}
  if(args.count)return {request:{kind:'count',exact:true,where}};
  // Preserve QueryBuilder's actual Number arithmetic. Identifiers and exact counts never use Number.
  const offset=String(((args.page as number)-1)*(args.limit as number));
  return {request:{kind:'page',where,order:schemaListOrder(args.sort as 'created'|'schema_name'|'assets',args.order as 'asc'|'desc'),
    offset,limit:args.limit as number,select:['contract','collection_name','schema_name','created_at_time','authorized_accounts','assets'],
    records:['schema','collection','assets']}};
}
