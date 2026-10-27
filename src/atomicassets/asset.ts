/** Structured, already decoded domain values. Exact chain identifiers remain strings. */
export type AtomicValue = string | number | boolean | null | readonly AtomicValue[] | AtomicObject;
export interface AtomicObject {readonly [field: string]: AtomicValue | undefined}
export type AtomicMetadata = AtomicObject;

export interface AtomicCollection extends AtomicObject {
  readonly collection_name?: string;
  readonly author?: string;
  readonly data?: AtomicMetadata | null;
}
export interface AtomicSchemaField extends AtomicObject {
  readonly name: string;
  readonly type: string;
}
export interface AtomicSchemaType extends AtomicObject {
  readonly name: string;
  readonly mediatype?: string | null;
  readonly info?: string | null;
}
export interface AtomicSchema extends AtomicObject {
  readonly schema_name?: string;
  readonly collection_name?: string;
  readonly authorized_accounts?: readonly string[];
  readonly collection?: AtomicCollection | null;
  readonly format?: readonly AtomicSchemaField[] | null;
  readonly types?: readonly AtomicSchemaType[] | null;
}
export interface AtomicTemplate extends AtomicObject {
  readonly template_id: string;
  readonly mutable_data?: AtomicMetadata | null;
  readonly immutable_data?: AtomicMetadata | null;
}
export interface AtomicAssetInput extends AtomicObject {
  readonly contract: string;
  readonly asset_id: string;
  readonly owner: string | null;
  readonly collection?: AtomicCollection | null;
  readonly schema: AtomicSchema;
  readonly template?: AtomicTemplate | null;
  readonly mutable_data?: AtomicMetadata | null;
  readonly immutable_data?: AtomicMetadata | null;
  readonly original_mint?: string | null;
}
export interface AtomicFormattedSchemaField extends AtomicSchemaField {
  readonly mediatype: string | null;
  readonly info: string | null;
}
export interface AtomicFormattedSchema extends AtomicObject {
  readonly format: readonly AtomicFormattedSchemaField[];
  readonly collection?: AtomicCollection | null | undefined;
}
export interface AtomicFormattedTemplate extends AtomicTemplate {
  readonly mutable_data: AtomicMetadata;
  readonly immutable_data: AtomicMetadata;
  readonly data: AtomicMetadata;
}
export interface AtomicAsset extends AtomicObject {
  readonly contract: string;
  readonly asset_id: string;
  readonly owner: string | null;
  readonly collection?: AtomicCollection | null | undefined;
  readonly schema: AtomicFormattedSchema;
  readonly template?: AtomicFormattedTemplate | null | undefined;
  readonly mutable_data: AtomicMetadata;
  readonly immutable_data: AtomicMetadata;
  readonly data: AtomicMetadata;
  readonly name?: AtomicValue | undefined;
  readonly original_mint: string | null;
}

function formatSchema(row: AtomicSchema): AtomicFormattedSchema {
  const {collection_name: _collection, authorized_accounts: _accounts, types, ...data} = row;
  const format = (row.format || []).map(field => {
    const descriptor = (types || []).find(candidate => candidate.name === field.name);
    const name = field.name.toLowerCase();
    const matches = (part: string) => name.startsWith(part) || name.endsWith(part);
    let derived: string | null = field.name === 'name' ? 'name' : null;
    if (matches('image') || matches('img') || field.type === 'image') derived = 'image';
    if (matches('video')) derived = 'video';
    if (matches('audio')) derived = 'audio';
    return {...field, mediatype: descriptor?.mediatype || derived, info: descriptor?.info || null};
  });
  return {...data, collection: row.collection, format};
}

/**
 * AtomicAssets API 2.7.0 formatAsset semantics over explicit structured input.
 * No decoding, lookup, source coverage or serving authority is implied. The input is never mutated.
 * See the upstream MIT notice shipped with this package.
 */
export function formatAsset(row: AtomicAssetInput): AtomicAsset {
  // The reference mutates its nested template. Own all nested values here to keep this formatter pure.
  const data = structuredClone(row);
  const mutable = Object.assign({}, data.mutable_data);
  const immutable = Object.assign({}, data.immutable_data);
  let metadata: AtomicMetadata = {...mutable, ...immutable};
  let template: AtomicFormattedTemplate | null | undefined = data.template === null ? null : undefined;
  if (data.template) {
    const templateMutable = Object.assign({}, data.template.mutable_data);
    const templateImmutable = Object.assign({}, data.template.immutable_data);
    template = {...data.template, mutable_data: templateMutable, immutable_data: templateImmutable,
      data: {...templateMutable, ...templateImmutable}};
    metadata = {...templateMutable, ...mutable, ...immutable, ...templateImmutable};
  }
  const {template_id: _templateId, schema_name: _schemaName, collection_name: _collectionName,
    authorized_accounts: _accounts, ...retained} = data;
  const result = {...retained, collection: data.collection, schema: formatSchema(data.schema), template,
    mutable_data: mutable, immutable_data: immutable, data: metadata, name: metadata.name,
    original_mint: data.original_mint ?? null};
  if (!Object.hasOwn(data, 'template')) Reflect.deleteProperty(result, 'template');
  return result;
}
