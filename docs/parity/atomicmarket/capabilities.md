# AtomicMarket capability requirements

Reference pin: atomicassets-api `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e` (2.7.0).
Historical SDK inventory pin: Hyperion SDK `339b5c93d1338968c18ed14254961439dcab16a0`.
This original gap inventory is retained. The package now pins merged SDK `8d37e932` and adds
the [contextual marketplace slice](marketplace-indexing.md); actual engine qualification remains pending.

## Smallest marketplace integration gap

The [reference processor](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/filler/handlers/atomicmarket/processors/marketplaces.ts#L14)
reads the `marketplaces` contract row, adds the configured market contract, original block number
and timestamp, and preserves `created_at_block`/`created_at_time` when replacing an existing row.
The update blacklist is implemented by
[`ContractDBTransaction.replace`](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/filler/database.ts#L906).
The [table](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/definitions/tables/atomicmarket_tables.sql#L92)
uses bigint for both creation fields; default pg reads return strings. The
[single marketplace handler](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/api/namespaces/atomicmarket/handlers/marketplaces.ts#L16)
returns those original fields, not the current read checkpoint.

At the historical SDK pin, `ProjectionField` paths select scalar members from one decoded source row.
`projectTableValue` receives that row without a declared block-envelope/constant-field source.
`ProjectionMutation.put` replaces the complete scalar record; arbitrary hooks remain later contracts.
The smallest complete marketplace indexing slice therefore needs:

1. Declared access to the configured contract and original source block/time for mapped metadata.
2. Preservation of first-creation values through a later replacement, exact replay and fork rollback.
3. Initialization coverage that actually contains those values. A snapshot height cannot be used as
   the creation height of every retained marketplace.

A focused acceptance sequence should register at block A, update at B, replay B, and roll B back,
retaining A's creation metadata; rolling back the registration removes the marketplace. Missing
required original creation evidence remains an explicit incomplete initialization. This document
does not prescribe a hook ABI, record format or new SDK version.

## Larger endpoint families

| Requirement | Pinned reference behavior | Current portable boundary / work needed |
| --- | --- | --- |
| Exact scalar lookup | `handlers/marketplaces.ts`: market contract plus name, 416 when absent. | Existing scalar equality query is sufficient for the delivered read module; ingest/host wiring remains open. |
| Ordered asset membership and enrichment | `handlers/sales.ts:getSaleAction`, `filler.ts:fillSales`, shared `AssetFiller`: sale asset IDs retain their source order and become complete asset objects. Missing asset rows remain IDs in the reference. | Need a declared transform/fan-out/relationship representation and matching input coverage. Normalized scalar records are a possible representation; nested database documents are not imposed. |
| Typed attribute and template behavior | Shared AtomicAssets `formatAsset`: template mutable, asset mutable, asset immutable, then template immutable precedence; arrays/typed values and schema descriptors remain meaningful. | Flat scalar storage alone does not implement this behavior. A portable transform/representation is required; serializing the whole asset into a string is not conformance. |
| Listing lifecycle | `formatSale` combines sale and offer states; auctions additionally derive state from time, claims and market version; buyoffers validate current asset ownership. | Plugin-owned lifecycle logic with original source/version/history inputs. It must not become contract-specific Hyperion core behavior. |
| Rich filtering and ordering | Sales v1/v2 handlers and `utils.ts` implement mint/data/name/price and list filters, ties, NULL handling, numeric/time boundaries, grouped template selection and count behavior. | Existing SDK query is AND of scalar equality with key ordering and bounded count. Declare the required logical capabilities or derived portable projections; do not embed SQL/Mongo queries in the plugin. |
| History-derived prices and statistics | Prices, royalties, logs and statistics combine historical sales/auctions/bids/offers and token/oracle/collection data. | Declare historical coverage and initialization/rebuild inputs, with bounded recovery and affected-query unavailability. Current state alone cannot reconstruct old events or prove empty historical results. |
| Compatible serving contexts | SDK v2 query returns a fenced revision/view. Sale enrichment can read several related projections. | The read module preserves its returned view. Full host activation must validate the selected context, revalidate after awaits, bind cache/headers and define the endpoint's relationship consistency. No global same-block history/state barrier is selected. |
| Socket semantics | Namespace `socket()` installs sales, auctions, buyoffers and template-buyoffers namespaces, with subscribe rooms and source notifications. | Source inventory only. Actual events, reconnect, cleanup, backpressure, fork/finality and exact identity need separate transport qualification. |

Current SDK source is pinned in `capabilities.json`. `ProjectionRecord`, `ProjectionQuery`,
`ProjectionReadView`, `ProjectionRollbackReadView`, `ProjectionAdapter` and `projectTableValue` are
existing contracts; this slice does not widen them. Native storage/query execution belongs to
adapters, and the same domain definitions/queries must remain portable across offered backends.

The original reference's behavior on unindexed/burned assets is a lifecycle requirement to inventory,
not permission to label a failed Hyperion projection complete. Shared readiness and initialization
requirements still govern whether the plugin may serve that scope. Contract failures stay isolated.
