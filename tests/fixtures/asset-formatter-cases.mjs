/** Discriminating synthetic rows; the original HTTP route, never a mirrored formatter, supplies goldens. */
export function assetFormatterCases(base) {
  const cases = [];
  const add = (name, change, invalid = false) => {
    const fixture = structuredClone(base);
    change(fixture.queries[0].rows[0]);
    const id = fixture.queries[0].rows[0].asset_id;
    fixture.request.path = `/atomicassets/v1/assets/${id}`;
    fixture.queries[0].parameters[1] = [id];
    cases.push({name, fixture, invalid});
  };
  add('layered', () => {});
  add('untemplated-null', row => {
    row.template = null; row.owner = null; row.collection = null; row.original_mint = null;
    row.mutable_data = null; row.immutable_data = {name: null, burned: true};
    row.schema.format = null; row.schema.types = null; delete row.schema.collection;
  });
  add('missing-metadata', row => {
    delete row.template; delete row.mutable_data; delete row.immutable_data;
    delete row.original_mint; delete row.schema.types; delete row.schema.format;
    row.extension = {kept: [false, null, '18446744073709551615']};
  });
  add('typed-metadata', row => {
    row.asset_id = '18446744073709551615'; row.original_mint = '9007199254740999';
    row.template.template_id = '2147483647'; row.template.max_supply = '18446744073709551615';
    row.template.mutable_data = {shared: 'template mutable', fallback: false, array: [1, '2', null]};
    row.mutable_data = {shared: 'asset mutable', mutable: 0, name: 'mutable', nested: {a: 1}};
    row.immutable_data = {shared: 'asset immutable', immutable: true, name: 'immutable', nested: {b: 2}};
    row.template.immutable_data = {shared: null, name: '', array: ['template', false]};
    // Nested template relationships pass through; formatAsset does not call formatTemplate here.
    row.template.collection_name = 'template-retained'; row.template.schema_name = 'template-retained';
    row.template.authorized_accounts = ['template-author']; row.template.schema = {types: [{name: 'raw'}]};
  });
  add('media-descriptors', row => {
    row.schema.format = ['name', 'Name', 'IMAGEcover', 'previewVideo', 'audioIMG', 'unknown', 'typed']
      .map(name => ({name, type: name === 'typed' ? 'image' : 'string', authored: true}));
    row.schema.types = [{name: 'name', mediatype: '', info: ''},
      {name: 'previewVideo', mediatype: 'application/custom', info: 'first'},
      {name: 'previewVideo', mediatype: 'ignored', info: 'second'},
      {name: 'unknown', mediatype: null, info: null}, {name: 'unused', mediatype: 'unused'}];
    row.schema.extension = {kept: true};
  });
  add('null-template-metadata', row => {
    row.template.mutable_data = null; delete row.template.immutable_data;
    row.mutable_data = {name: false}; row.immutable_data = {};
    row.original_mint = ''; row.backed_tokens = [{token_contract: 'eosio.token', amount: '9999999999999999'}];
  });
  add('invalid-null-schema', row => {row.schema = null;}, true);
  add('invalid-schema-field', row => {row.schema.format = [{name: 3, type: 'string'}];}, true);
  return cases;
}
