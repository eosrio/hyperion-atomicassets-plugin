/** Synthetic DB rows; unmodified original HTTP execution supplies the expected responses. */
export function saleFormatterCases(base) {
  const cases = [];
  const add = (name, change, invalid = false) => {
    const fixture = structuredClone(base);
    change(fixture.queries[1].rows[0], fixture);
    cases.push({name, fixture, invalid});
  };
  add('listed-pending', () => {});
  add('waiting-ignores-offer', row => {row.sale_state = 0; row.offer_state = 3;});
  add('canceled-ignores-offer', row => {row.sale_state = 2; row.offer_state = 0;});
  add('sold-ignores-offer', row => {row.sale_state = 3; row.offer_state = 2; row.buyer = 'bob';});
  add('listed-nonpending-is-invalid', row => {row.offer_state = 1;});
  add('listed-null-offer-is-invalid', row => {row.offer_state = null;});
  add('listed-missing-offer-is-invalid', row => {delete row.offer_state;});
  add('unknown-sale-is-invalid', row => {row.sale_state = 99;});
  add('string-state-is-not-coerced', row => {row.sale_state = '1';});
  add('exact-price-and-fields', row => {
    row.raw_price = '9223372036854775807'; row.price.amount = 'obsolete';
    row.price.median = '9007199254740999'; row.listing_price = '9007199254740997';
    row.listing_symbol = 'WAX'; row.current_collection_fee = 0.07;
    row.collection = {collection_name: 'testcollect1', market_fee: 0.05, data: {kept: [null, false, '2']}};
    row.extension = {nested: [false, null, {exact: '9007199254740993'}]};
  });
  add('explicit-null-values', row => {
    row.raw_price = null; row.buyer = null; row.collection = null;
    row.price.median = null; row.taker_marketplace = null;
  });
  add('missing-values-stay-missing', row => {
    delete row.raw_price; delete row.buyer; delete row.taker_marketplace;
    delete row.price.token_contract; row.extension = {kept: false};
  });
  add('ordered-unresolved-assets', (row, fixture) => {
    const missing = '9007199254740998';
    row.assets = [missing, row.assets[0], missing];
    fixture.queries[2].parameters[1] = [...row.assets];
  });
  add('invalid-null-price', (row, fixture) => {row.price = null; fixture.queries.splice(2);}, true);
  return cases;
}

/** Enrichment is supplied by the independent original response, not performed by this formatter. */
export function saleFormatterInput(fixture, originalResponse) {
  const row = structuredClone(fixture.queries[1].rows[0]);
  if (originalResponse?.body?.data) row.assets = structuredClone(originalResponse.body.data.assets);
  return row;
}
