# Internal fixed-price sale lifecycle

This component advances [issue #16](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/16).
It does not close #16 or the full [AA/Market parity requirement](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1).
It introduces no package export, route, capability activation, version or dependency change. The
SDK pin stays unchanged; merged SDK work is not adopted implicitly. Integration with SDK #32 and
History API #366 remains separate. Existing AtomicAssets code, fixtures and tests are unchanged.

## Durable domain rules

The reference is AtomicAssets API 2.7.0 at `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
The private reducer in `src/atomicmarket/internal/fixed-sale.ts` supports normalized, source-bound
v1.2.2 single-asset `lognewsale`, `logsalestart`, `cancelsale`, and the fixed-settlement zero-intended-
Delphi-median purchase path. Source shape checks do not authenticate a chain, ABI or contract version.

The original base is `max(AtomicAssets 0, Delphi 0) + 1000`. Creation uses priority **1020** and
updates **1040**, with stable insertion order for ties. A start queued before creation still runs
after creation; equal-priority cancellation/start order remains observable. Creation is an upsert
of the original complete sale fields, including creation chronology: it does not preserve a previous
creation timestamp across another new-sale occurrence. Generic replay admission belongs to the SDK.

Listing amounts become integer-unit strings without a Number roundtrip. The original positive
int64 overflow clamp is preserved. The constructed identifiers exceed 2^53 but stay within signed
PostgreSQL bigint range; this subset rejects identifiers above that range instead of claiming
physical full-uint64 storage parity. Listing and settlement currency must match. Unsupported
conversion and bundle input refuse the affected candidate rather than fabricate a settlement.

Empty, null or absent marketplace input becomes null; other marketplace text is preserved exactly,
including case and spaces. New waiting rows start with null buyer/final price; cancellation changes
state/time without clearing other fields. Explicit null buyer is retained on a supported purchase. Absent purchase/start/cancel has no durable effect. An already-
SOLD purchase retains the first buyer, final price and timestamps before evaluating a nonzero
conversion branch. No extra seller/owner or lifecycle authorization is invented: original v1
callbacks can record a zero-median purchase without a start, or after a cancel, when supplied such
constructed occurrences. These controls certify no transaction authorization or real-chain history.

Every invocation requires normalized exact block/time and block identity, source occurrence,
transaction/ABI evidence and explicit v1.2.2 contract-version evidence bound to the action ABI.
Unknown/v2 evidence refuses; the remaining Delphi and legacy-bundle branches are unimplemented.
Primitive string action discriminants are validated before lookup. Closed shallow data and explicit
array shapes reject getters, symbols, extra fields and coercible names. All consumed input values
are detached before awaits. No production resource defaults are introduced: the eventual SDK caller
must enforce finite input/byte/staging budgets and own coherent views, identity fences, before-images,
commit/abort, retry and recovery. Any throw requires discarding every staged effect in that invocation.

## Current light-view boundary

`FIXED_SALE_RELATIONSHIPS` declares backend-neutral exact-key dependencies. The fixed assembler reads
current offer, collection, token, offer-asset links, seller-code existence and explicit symbol-pair
absence through one coherent caller view. It never stores a permanently formatted collection/token/
asset response in a sale. Missing or unavailable source coverage throws `FixedSaleUnavailable`.

The restricted shape follows the original `atomicmarket_sales_master` SQL: final price takes
precedence over listing price; absence of a symbol pair leaves median null; offer state affects
LISTED formatting; collection fields come from the current collection, its response market fee
comes from the sale, and `current_collection_fee` comes from the current collection. Token metadata
and seller-contract existence are current. Selected collection name/img/images support text/null/
missing; other selected JSON shapes refuse rather than guess PostgreSQL `->>` conversion.

Covered absence is distinct from unknown coverage. A null offer ID or a covered-absent required
inner-join row produces null at this **internal SQL-row boundary**. This declares no HTTP status,
source initialization success or public not-found behavior. Covered-absent offer links produce the
original empty ARRAY shape; unknown link coverage refuses. Present Delphi pairs and multi-asset
links are explicitly unsupported here. Nested current collection values are copied before later
awaits; caller view-fence errors propagate without a partial result.

The assembler passes its light row to the existing pure sale formatter. Assets remain exact
identifier strings. `fillSales` / `AssetFiller`, current asset enrichment and prices, full
`getSaleAction` HTTP behavior, filtering/sorting/pagination, lists/stats/history, sockets and
production notifications remain open. This is not a complete endpoint response or advertised API.

## Original controls and limits

The [fixture provenance](../../../fixtures/harness/atomicmarket/lifecycle/provenance.json) pins
18 original Git blobs (including processor/scheduler/normalization/version helpers, view/query/
formatter/filler, package and lock) and the constructed input/expected bytes. Exact upstream blobs
are retained beside it, with the existing shared MIT license/notice. Each execution verifies the
clean pinned reference, original blobs and checkout newline relation, then hashes all actually
loaded reference source/dependency modules before and after capture. Installed module hashes are
runtime evidence, separate from the canonical original source pins.

The [expected capture](../../../fixtures/harness/atomicmarket/lifecycle/expected.json) comes from
unmodified original registered sale callbacks through the original `DataProcessor` queue. Fourteen
cases record actual callback write/query arguments, priorities, selected predicates, notifications
and state observations. Unknown SQL shapes fail the finite callback fixture. A deliberately
unsupported Delphi case records **fixture query refusal**, not a production bug. An original-only
v2 bundle case observes the real legacy helper's cancellation but does not qualify that branch in
the new reducer. Notifications are observed original calls, not implemented production delivery.

Storage is a finite local callback model. It bounds cases/blocks/events/records/calls/modules and
publishes a candidate only after the block's callbacks succeed. Its logical block/time string
conversion is an explicit fixture assumption, not measured PostgreSQL casting or transactions.
Eight current-light cases use an independently labeled source-derived model of the restricted SQL
shape and the **executed original formatter**. The SQL view itself is not executed. The new reducer
never generates its expected capture. Node 24/26 original controls agree exactly.

These local controls establish no physical PostgreSQL/MongoDB/WormDB, durability, uncertain commit,
restart/fork rollback, source authority, production throughput or full parity. The AtomicAssets
component and existing sale formatter remain separately qualified within their documented limits.

## Local reproduction

With the exact original checkout installed from its own committed lock and `AA_REFERENCE_ROOT` set:

```sh
npm ci --allow-git=all
bun check -p tsconfig.json
npm run build
node --test tests/fixed-sale-lifecycle.test.mjs
npm test
npm run test:package
npm run check:docs
```

Run native Node 24 and 26. Normal tests never regenerate expected data. Packed checks install their
own tarball and execute this internal component through its private emitted file, with installed
declaration checks and an explicit rejection of a public internal subpath. Public exports and SDK
pins remain unchanged. Full original-PG differential execution and portable backend/domain API
integration must be qualified separately before any support or release decision.
