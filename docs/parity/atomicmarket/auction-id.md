# Bounded auction ID component

This source component implements [issue #32](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/32)
under the complete parity gate in [#1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1).
Its reference is atomicassets-api 2.7.0 at `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
It uses the existing compound factory and request-scoped query host in the same operator package
as AtomicAssets. There is no SDK, host, adapter or installed dependency change.

## Input and retained state

The private reducer accepts v1.2.2 single-asset `lognewauct`, `logauctstart`, `cancelauct`,
`auctionbid`, `auctclaimbuy`, `auctclaimsel`, and scoped `auctions` rows. Creation runs at priority
1020, table rows at 1030, and updates at 1040, preserving insertion order at equal priority.
An erased table row still updates end time, as the original callback does. Claims set flags;
cancel/start/bid do not invent owner, authorization or lifecycle guards. The public SOLD state is
derived at read time rather than written by a claim or wall clock during reduction.

One new `market-auction` kind stores the auction fields, one asset ID and the complete ordered bid
sequence. Repeated creation resets auction fields and creation time but retains bids and asset
links. A changed link on repeated creation would retain both original links, so this single-asset
component refuses it. A bid without a parent refuses the original deferred foreign-key failure.
Positive prices clamp to signed int64 as in the original processor. Supported identifiers and
amounts remain decimal strings, including values above 2^53. Bid numbers remain original int32
numbers, and transaction IDs retain exact bytes as hexadecimal text.

The caller owns staging, atomic publication, source coverage and rollback. Any reduction error
requires discarding its entire candidate, including earlier changes in that block. Existing
host-negotiated structured-value, record, mutation and candidate bounds apply to the complete bid
array; exceeding one leaves the affected projection unavailable. No bid history is truncated.
The compound descriptor now has 17 record kinds. Operators must negotiate sufficient explicit
bounds; this component does not automatically enlarge configured limits.

## Coherent reads and HTTP

The private read assembles the source-derived `atomicmarket_auctions_master` shape from the auction,
current collection and token, seller-code existence, and existing untemplated asset reader, all
in one caller-issued view. Covered missing inner joins produce no auction; unknown coverage
propagates an error. Covered missing nested assets retain their IDs, following the original filler.
Collection updates change current display data and `current_collection_fee` while the auction's
captured collection fee remains unchanged.

`/atomicmarket/v1/auctions/:auction_id` uses the same request-scoped host as the existing ID routes.
Formatting samples the read clock after assembling the light row and before asset enrichment,
following original handler order. WAITING, LISTED, CANCELED, ended-with-bid SOLD and
ended-without-bid INVALID follow the original predicates, including the exact end-time boundary.
End time is returned as milliseconds in a decimal string. The host owns final response admission
and shared headers. The route creates no listener and grants no serving readiness.

The supported HTTP ID intersection is canonicalizable nonnegative signed-bigint text. Leading
zeroes retain original auction lookup behavior. Bad syntax returns the original 400 message;
covered absence returns 416 `Auction not found`. Accepted original forms `null`, negative values,
and out-of-range values remain unavailable pending actual database qualification.

## Evidence and frontier

`tests/auctions.test.mjs` executes the emitted factory and coherent reader against chronological
constructed inputs. `tests/fixtures/original-auctions.cjs` executes the exact original callbacks,
priority scheduler, auction-ID handler, filler, formatter, validation and returnAsJSON middleware.
It verifies original Git blobs before use, records source hashes and actual callback effects,
and uses Fastify injection with listening sockets prohibited. It models finite storage, the
deferred parent constraint and SQL view field selection explicitly. It does not execute SQL or
establish physical PostgreSQL/MongoDB parity. Existing closed asset oracle rows supply the
independent safe-profile asset boundary, with explicitly constructed rebased block/time values.
The same controls run against the actual installed tarball on native Node 24 and 26.

See [auction-id-coverage.json](auction-id-coverage.json) for exact cells. The generated inventory
remains a historical registration inventory. Seven auction-processor hooks are now marked partial
in the current factory inventory; their history, notification and other effects remain open.
Bundles, v2/version continuity, templated asset pricing, negative-price forms, auction lists,
counts, logs, socket APIs, royalties and all remaining families stay unimplemented or unsupported.
Physical engines, recovery, source authority, actual HAPI serving and full 2.7.0 parity are not
established by this component.
