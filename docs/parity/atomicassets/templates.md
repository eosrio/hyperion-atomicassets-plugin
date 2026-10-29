# Template lifecycle and current asset enrichment

This component advances [issue #33](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/33).
The baseline remains API 2.7.0 commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
It does not close full [parity #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1)
or the physical lifecycle comparison in [#10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10).

Actual scoped `templates` and `templates2` occurrences join the existing reducer at priority 40,
after collection/schema rows and before mint priority 50. Equal-priority input order is preserved.
Immutable metadata is decoded once on creation through the unchanged pinned codec. Later template
rows update flags, supply and deletion markers while preserving immutable metadata and creation
identity. Mutable rows replace metadata, and deletion clears it to null. Unknown template deletion
does not invent a row. A missing schema, decoder failure or unknown coverage refuses the candidate;
the caller must discard all staged mutations. Contract indexing failures remain projection-local.

Templated mint stores its actual template ID. Asset reads fetch current template data through the
same caller-owned coherent reader as the asset, collection and schema. Flags, supply, mutable data
and deletion times therefore change without rewriting a formatted mint-time asset. The existing
asset formatter is unchanged, including template/asset metadata precedence, exact integer strings,
nulls and deletion fields. Template mint numbers retain the original pre-maintenance zero value;
the original asynchronous mint reconciliation job remains unimplemented.

The definition adds one `template` record kind. The independently reviewed template child required
17 kinds; the integrated template and auction definition requires **18**. A deployment needs a
new captured declaration/generation and qualified initialization/replay of the affected state
projection. Existing Elasticsearch history remains usable. Do not reuse the old incomplete
projection or silently upgrade its record-kind allowance: explicit limits of 16 or 17 are preserved
and refused by the actual SDK declaration validator. Operators must deliberately configure a
sufficient limit and pass normal host negotiation with its own validated declaration and limits.
These counts describe definition requirements, not qualified operator budget defaults.

Template support here permits the scoped AtomicAssets asset-ID path. Nested AtomicMarket sale
serving still refuses templated assets: original `buildAssetFillerHook({fetchPrices:true})` reads
`atomicmarket_template_prices` and adds `prices`/`template_buyoffers` fields. This projection has
not implemented that aggregate state. It does not manufacture empty relationships, omit those
original fields or claim nested-sale parity. Auctions, price/buyoffer state, backing, all template
routes and mint reconciliation remain separate work. Actual Wire scope-less table-domain mapping
also remains unsupported by this restricted domain adapter.

The new controls run actual original processors and their scheduler on identical chronological
template/asset occurrences using the existing finite SQL collaborator. An independent finite
model of the pinned assets-master SELECT feeds the actual original formatter; PostgreSQL itself
is not executed. The explicit `portable-safe-image` fixture profile retains its declared single
image-field difference and the unresolved NUL/literal-backslash evidence. Default original
fixtures are unchanged. Controls cover priority ordering, mutable replacement/clear, tombstones,
unknown deletion, corrupt bytes/schema/coverage, caller fencing, whole-candidate discard, real
factory dispatch and Fastify asset-ID bodies. The same controls run against actual installed
tarballs on Node 24/26. Physical PostgreSQL/view/HTTP versus MongoDB acceptance, actual source/ABI
coverage, production owner/query authority and complete 2.7.0 parity remain open.
