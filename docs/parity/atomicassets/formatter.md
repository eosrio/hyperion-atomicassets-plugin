# Portable single-asset formatter

Development component for [issue #5](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/5).
Import `formatAsset` and `AtomicAssetInput` from
`@eosrio/hyperion-atomicassets-plugin/atomicassets/asset`.

The input supplies an explicit structured asset, its schema and any collection/template
relationships, with metadata already decoded into JSON values. It is not a stored JSON string,
database row lookup, ABI decoder, query/readiness contract or registered endpoint. The formatter
does not mutate or share mutable nested objects with its input. It preserves extra JSON fields
that the original formatter passes through. IDs are strings in the public TypeScript contract;
the formatter does not repair rounded IDs or invent missing relationships.

## Exact source behavior

The baseline is [atomicassets-api 2.7.0 `formatAsset` and `formatSchema`](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/api/namespaces/atomicassets/format.ts).
The same reference checkout's locked `@atomichub/atomicassets` 2.2.0 supplies
`mergeSchemaFormatTypes`. Its emitted helper is traced and exercised through the original HTTP
route; this package adds no dependency on that SDK. Existing upstream MIT license and notice
files remain included in the package.

- Asset metadata precedence, from lowest to highest: template mutable, asset mutable,
  asset immutable, template immutable. Nested template `data` uses its mutable then immutable
  metadata. Missing/null metadata becomes an empty object; booleans, numbers, arrays, nested
  objects, empty strings and null values remain typed and override earlier values.
- `name` is exactly the merged metadata's name. HTTP JSON omits it when missing, and preserves
  null, false and empty-string values. `original_mint` becomes null only when null/missing.
- Top-level `template_id`, `schema_name`, `collection_name` and `authorized_accounts` disappear.
  Collection values pass through. Nested template relationships pass through without calling
  the standalone template formatter.
- Nested schema omits `collection_name`, `authorized_accounts` and raw `types`. Preserve format
  order and extra field properties. The first descriptor with the exact field name wins.
  Falsy descriptor media hints fall back to heuristics: exact `name`, image prefix/suffix or
  image type, then video prefix/suffix, then audio prefix/suffix; later matches override earlier
  ones. Missing/falsy descriptor info is null. Name heuristics are case-insensitive except the
  exact `name` check. Missing/null format and descriptors behave as empty arrays.

## Bounded evidence

[Case inputs](../../../tests/fixtures/asset-formatter-cases.mjs) derive eight synthetic database
boundary scripts from the existing single-asset fixture. The [goldens](../../../tests/fixtures/asset-formatter.expected.json)
are actual original HTTP responses, captured with `harness/atomicassets/capture-formatter.mjs`.
Cases cover precedence, absent template/metadata, burned owner and null collection, maximum uint64
asset ID, nested template relationships, duplicate/empty media descriptors and invalid schema
rows. Invalid schema rows return the original HTTP 500 response; direct formatter calls throw
TypeError. Path-validation and missing-asset HTTP tests remain in the existing reference harness.

`npm test` compares the emitted formatter with fresh original HTTP execution and retained
goldens. Raw original results, including environment-dependent query clocks and HTTP headers,
are retained under `out/asset-formatter-<node>-*`; deterministic comparisons remove only
`query_time`. `npm run test:package` runs all eight goldens through the actual installed tarball
subpath and checks its installed declarations, alongside the existing Market component.
No caller-supplied HTTP status, error wrapper or clock is fabricated by the formatter.

These controls do not qualify chain ingestion, ABI decoding, relationship coverage, Hyperion
HTTP hosting, PostgreSQL execution, MongoDB/WormDB adapters, fork recovery, socket/stream behavior
or full AtomicAssets/AtomicMarket parity. The current SDK structured projection/read-context
frontier remains open. All inventory HTTP paths remain unimplemented until actual host and
adapter integration is demonstrated; this pure formatter does not change their status.
