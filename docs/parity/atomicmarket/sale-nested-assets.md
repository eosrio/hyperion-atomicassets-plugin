# Private sale-ID asset composition

`readFixedSaleWithAssets` adds the untemplated asset-enrichment part of original 2.7.0
`getSaleAction`/`fillSales`/`AssetFiller` to the private fixed-price sale reader. It reuses
`assembleFixedSaleLight` and `assembleAssetLightView` with the same caller-owned coherent
reader. It opens no views. The caller must fence the complete operation, including its result;
the helper does not authenticate a checkpoint or replace SDK readiness/fork handling.

The deliberately lighter `readFixedSaleLight` still returns asset IDs. Public package exports,
routes, capabilities and dependency pins are unchanged. This is work under [#10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10)
and [#1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1), following the closed internal
[sale reducer #16](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/16).

The original sale filler enables `fetchPrices` only. For an untemplated asset its hook adds
`sales:[]` and `auctions:[]`; `prices` and `template_buyoffers` remain absent. The helper applies
that selected rule to an assembled, supported asset row before the existing formatter. It
does not supply empty defaults for an unsupported template or unknown relationship. An asset
proven absent from the current asset view remains its exact ID string, matching `AssetFiller`.
Unknown coverage or missing required asset relationships remains unavailable. A proven missing
inner sale join still returns null at the existing light boundary; this helper assigns no HTTP
status or envelope.

Templated assets remain explicitly unsupported by the current asset assembler. Direct original
controls demonstrate their actual price and template-buyoffer fields and verify that this helper
refuses rather than manufacturing those values. Template/pricing indexing is required follow-up;
the complete sale-ID endpoint and all other AtomicAssets/AtomicMarket parity gates stay open.

The bounded shared reference child invokes the unmodified original handler, filler and formatters
over finite scripted SQL rows, with a listener trap and hashes of the actual five upstream source
files before/after. These controls test current values, exact identifiers, relationship-only
updates, covered absence, templated refusal and coherent-view failure propagation. They execute
no HTTP listener, PostgreSQL or MongoDB. Input rows come from the existing explicitly constructed
source-derived fixtures; SQL views and production source authority are not established.

Native Node 24/26 tests and the existing packed-consumer check execute the same private compiled
helper. A successful value comparison is not physical or public HTTP acceptance. The inventory
continues to report `/atomicmarket/v1/sales/:sale_id` and `/atomicassets/v1/assets/:asset_id` as
publicly unimplemented. Actual shared-instance comparisons require the separately reviewed
operators, fresh Root release/guards and independent custody. Frozen paired mint profiles are
unchanged by this component.
