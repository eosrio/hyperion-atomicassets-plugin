# Portable single-sale formatter

[Issue #14](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/14) adds a pure,
backend-neutral component at `@eosrio/hyperion-atomicassets-plugin/atomicmarket/sale`.
It follows `formatSale` from the exact AtomicAssets API 2.7.0 baseline
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
The original [formatter](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/api/namespaces/atomicmarket/format.ts#L102),
[handler](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/api/namespaces/atomicmarket/handlers/sales.ts#L12)
and [asset filler](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/api/namespaces/atomicmarket/filler.ts#L63)
remain distinct source boundaries.

The caller supplies an already assembled `AtomicSaleInput`. Its `raw_price` is an exact string,
null or absent; the formatter assigns that value to `price.amount` without computing or coercing
it. Other price metadata and sale fields pass through. Internal sale/offer states and raw token
fields are removed. The output states match the original: WAITING=0, LISTED=1, CANCELED=2,
SOLD=3 and INVALID=4. LISTED requires a pending offer; WAITING, CANCELED and SOLD retain their
original precedence. Unknown or nonnumeric states are not coerced into a successful state.

The input, including nested prices and assets, remains unchanged. Supplied asset members retain
their order, duplicates and unresolved identifier strings. The formatter does not fetch assets,
run the AtomicAssets formatter or establish relationship completeness. Empty or missing fields
are not filled from a current checkpoint or fabricated source history. The separate existing
AtomicAssets formatter and marketplace interfaces remain unchanged.

## Independent original-reference controls

Fourteen discriminating cases run the unmodified original namespace, HTTP handler, `formatSale`
and response wrapper through the existing bounded loopback harness. They include all five states,
nonpending/null/missing offers, state precedence, a string-state refusal, exact identifiers and
prices above 2^53, null/missing values, ordered duplicate unresolved assets and the original
null-price exception. Ordered exact SQL/parameter/row scripts are explicit synthetic database
boundaries. Unknown or unused queries fail. Expected JSON comes only from the original HTTP
responses; the replacement formatter never generates its own oracle.

For a successful case, the formatter receives the original sale view row with its asset members
already assembled from that independent original HTTP response. This deliberately isolates sale
formatting from enrichment; it does not qualify a new enrichment implementation. Both normal ESM
and an actual installed tarball compare against the same captured outputs. Strict installed
declaration consumers keep IDs and prices textual. JSON `query_time` and HTTP dates are excluded
as environment-dependent fields; response field and array order remain checked.

Capture fresh original outputs after the normal locked reference setup:

```sh
AA_REFERENCE_ROOT=/path/to/exact-reference node harness/atomicmarket/capture-sale-formatter.mjs out/fresh-sale-capture
```

`--write-golden` writes a previously absent golden file; it does not overwrite recorded results.
The reference HEAD/tag, package version and clean tracked source are checked before every request.
Source/lock/attribution bytes remain under the shared reference controls and shipped notices.

This is a formatter component, not a coherent portable sale read or public route. SQL view/price
computation, ordered relationship acquisition, source ingestion and recovery, host serving context,
query pagination/filtering, sockets, real database execution and full parity
[#1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1) remain separate. It introduces
no SDK/runtime contract, executable update, dependency change or release-support claim.
