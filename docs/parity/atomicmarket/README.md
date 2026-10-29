# AtomicMarket 2.7.0 parity inventory and first read

Baseline: [atomicassets/atomicassets-api 2.7.0](https://github.com/atomicassets/atomicassets-api/tree/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e), exact commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
The upstream tag, package version and clean tracked source are checked before executing it.
This work belongs to [inventory #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1)
and [portable marketplace read #2](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/2).

AtomicAssets and AtomicMarket remain one operator package. No complete domain parity, chain indexing,
MongoDB/WormDB qualification or public host activation is claimed here.

## What is inventoried

[inventory.json](inventory.json) reconciles the original namespace's actual Express registrations
against source syntax in both `api_features.disable_v1_sales` modes:

- 60 distinct HTTP registrations from 62 source registrations; the two extra source registrations
  are the conditional `/v1/sales` and `/v1/sales/_count` alternatives.
- Four Socket.IO namespaces, with source-pinned notification channels, account filters, `subscribe`
  room declarations, action/event/payload mappings and namespace-wide `{block_num}` fork events.
  Sales expose `new_sales`/`purchased_sales`; auctions expose `new_auctions`/`new_bids`; buyoffers
  and template buyoffers each expose their corresponding `new_*` room. A truthy `data[room]` joins;
  otherwise an existing membership leaves. There is no separate unsubscribe listener. The shared
  transport is websocket-only with `allowEIO3: true`. Socket behavior is not runtime-qualified.
- Original OpenAPI paths, response components and tags, 67 validation definitions, and 54 pinned
  source-file hashes. The validation definitions include shared AtomicAssets helpers used by Market.
- Inherited asset detail/stats/logs, offer and transfer registrations are included, along with the
  Market-owned asset list and both namespace documentation redirects.

`ALL` records the original `router.all`, although the reference documentation usually describes GET.
The inventory preserves the source/runtime distinction instead of silently reducing those registrations.
The registered marketplace parameter is `:name`; its documentation calls it `{marketplace_name}`.
The original documentation contains an unresolved `#/components/schemas/Asset` reference, retained in
`responseSchemaReferences`. Source handlers and observed responses remain the behavior oracle.

The default v1 sales route uses `getSalesAction`; enabling `disable_v1_sales` selects `getSalesV2Action`.
The corresponding count handler changes too. V0 and v2 routes remain distinct. In particular,
`getSalesAction` rejects price sorting with a 400 directing callers to v2; this behavior cannot be
replaced by one generic list query. Original sort ties, NULL handling, page/limit defaults,
mint filters, blacklist/whitelist precedence and bounded-count rules remain unqualified until their
endpoint-family comparisons are implemented.

## Observed reference requests

Five input fixtures execute the unmodified upstream `HTTPServer`, Market namespace initialization,
router, `returnAsJSON`, handler and formatter through an owned loopback HTTP connection. The fixture
supplies an ordered exact SQL/parameter/row script at the database boundary. Unknown, extra or unused
queries fail the run; rows are copied because reference formatters can mutate nested data.

| Fixture | Observed status | Scripted queries, including namespace init | Purpose |
| --- | ---: | ---: | --- |
| `marketplace` | 200 | 2 | Four original fields, creation metadata represented as bigint strings. |
| `marketplace-not-found` | 416 | 2 | Exact `Marketplace not found` response. |
| `single-sale` | 200 | 4 | LISTED sale, offer state, exact IDs and amount above 2^53, asset and price-enrichment path. |
| `sale-not-found` | 416 | 2 | Exact `Sale not found` response. |
| `sale-invalid-id` | 400 | 1 | Original validation rejects the path before a business query. |

The five deterministic status/body pairs match on actual Node 24.19.0 and 26.4.0. These are synthetic
database-boundary fixtures, not captured chain rows or PostgreSQL execution. The controlled chain
health RPC performs no network request; cache behavior, host serving metadata and production
transport are not qualified. `query_time`, HTTP Date and Last-Modified are environment-dependent.
Expected files were captured from the original reference HTTP responses, not hand-written to match
the new module. The initial Market harness setup failure is retained separately and remains failed.

From the combined package checkout, reproduce requests and inventory with explicit paths:

```sh
node fixtures/harness/atomicmarket/capture-reference.mjs REFERENCE_ROOT harness/shared/reference.mjs FRESH_OUTPUT_DIRECTORY NODE_EXECUTABLE
node fixtures/harness/atomicmarket/inventory-reference.mjs REFERENCE_ROOT harness/shared/reference.mjs INVENTORY_OUTPUT_JSON NODE_EXECUTABLE
```

The reference checkout must have its pinned pnpm dependencies installed through the shared preparation
workflow. The inventory parser uses that reference's TypeScript dependency; it does not replace the
plugin's TypeScript 7 compiler. Request captures refuse to overwrite an existing evidence directory.

## Delivered marketplace read module

`src/atomicmarket/marketplace.ts` supplies `readMarketplace` over the existing SDK projection query.
The caller supplies an already opened serving view and the adapter-compatible reader. The module:

- Queries exact equality on `market_contract` and `marketplace_name`, without trimming or case folding.
- Returns only `marketplace_name`, `creator`, `created_at_block` and `created_at_time`, with the
  reference's string representation for the two bigint fields. It never substitutes the current
  projection checkpoint for the row's creation metadata.
- Returns the adapter's view without manufacturing readiness or canonical authority.
- Raises `MarketplaceNotFoundError` with status 416 and the exact reference message only for a final
  empty result. Adapter failures propagate; ambiguous results, invalid fields and an empty result
  with continuation do not become a compatible success or an absent marketplace.

Six focused tests compare the public read/query boundary to the captured reference result and
exercise contract/name scoping, creation metadata, missing rows, retryable failures and incomplete
results on Node 24/26. These fixture readers are not MongoDB adapters. The shared package's normal
ESM emission, whole-project checks and final integrated test run must pass after this branch joins
the package foundation; focused compilation alone is not package acceptance.

There is no new public route registration or HTTP error-envelope adapter in this slice. The complete
Hyperion host path, cache and finality headers remain integration work. Source ingestion is also
pending: the original marketplace processor adds block/time context and preserves first-creation
values on replacement. Seeding a projection with those fields does not qualify that indexing path.

## Remaining capability and endpoint work

The [bounded auction-ID component](auction-id.md) implements the v1.2.2 single-asset lifecycle,
complete bounded bids and a coherent request-scoped ID route. Original callback/handler controls
remain separate from physical engines, production serving and the complete parity requirement.

The [private sale-ID asset composition](sale-nested-assets.md) reuses the current coherent asset
reader for untemplated nested values. Templates/pricing and the complete sale-ID HTTP route remain
unimplemented. Its direct original handler/filler controls are scripted-row evidence, not a
PostgreSQL view, physical MongoDB or public API qualification.

[capabilities.md](capabilities.md) maps the concrete source/context, transform, relationship, query
and serving requirements to pinned upstream and SDK code. It records requirements without choosing
a database-native layout or pretending a JSON-string field implements typed attributes.

Start subsequent bounded slices from the observed behavior: complete marketplace ingest/read
integration; ordered sale/offer/asset relationships and lifecycle state; auctions and bids;
buyoffers/template buyoffers; version-aware royalties; prices/statistics; inherited asset/offer/
transfer enrichment; then socket behavior. Each slice needs representative input coverage and
reference comparisons. A passing lookup does not remove any of the full AtomicAssets/AtomicMarket
2.7.0 release obligations.

The generated schema and validation inventory derives from the MIT-licensed upstream source.
Its original notice is retained in [UPSTREAM-LICENSE](UPSTREAM-LICENSE).
