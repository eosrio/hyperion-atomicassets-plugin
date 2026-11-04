# Owned schema count foundation (issue #68)

The opt-in `ownedSchemaCounts` component stages an owned-asset count per contract,
collection and schema. An asset contributes exactly when its owner is non-null. The
pinned 2.7.0 migration `definitions/migrations/1.3.15/atomicassets.sql` initializes
`owned` with `COUNT(*) FILTER (WHERE owner IS NOT NULL)` and writes negative and
positive deltas for old and new rows. Its collections handler groups those counters
and uses `HAVING SUM(owned) > 0`; it specifies no order.

Mint and burn use the existing asset transition inside the same SDK candidate; transfer
between two owners leaves this count unchanged. The transition helper supports deletion,
though no new delete source is registered. The caller must discard the entire candidate
on error. Redelivery is safe only when the caller reads the current old row. A covered
absence means zero only for a new, completely initialized and caught-up generation;
it is not evidence that a pre-existing generation has no assets. Unknown coverage,
invalid identity, negative counts and signed bigint overflow refuse the transition.
This opt-in changes the projection declaration, adds a query requirement and registers
the route. It provides no source coverage, initialization, rollback, serving readiness
or host/backend capability offer. Existing generations cannot be treated as complete.

The indexed query model filters maintained `owned > 0` and collection equality.
The current SDK's indexed page requires a finite limit and declared order, whereas
the original endpoint is unpaginated and has no `ORDER BY`. A future implementation
issues an exact count and bounded page in one composed view, refusing above the
negotiated response budget. It requests schema-name order; this is not an original
ordering guarantee and needs physical comparison. The native adapter must offer and
execute the new declared model; this package supplies no adapter implementation.
Complete rebuild, coherent catch-up, operator publication fencing and recovery are
required before serving.

Local controls exercise SDK-owned reduction and candidate capture against a finite
in-memory adapter, plus the original 2.7.0 handler against a finite interpretation of
the pinned migration's owned-row semantics. The adapter's commit and rollback are test
doubles; no PostgreSQL trigger or native recovery runs. Indexed-query tests use SDK
capture/composition and injected HTTP with scripted native answers. PostgreSQL/MongoDB,
production HTTP/cache, initialization and native fork/recovery acceptance remain pending.

The isolated PostgreSQL16.15 CI oracle adds an original-handler and original-migration
trigger scenario under issue #68. It records the trigger definition, each SQL statement,
bindings, results or errors, and eight membership/count snapshots before assertions.
Its constructed transaction exercises insert, owner transfer, burns, last-owned removal,
savepoint rollback and deletion across multiple schemas, then rolls back the transaction.
The source and migration bytes must match the exact upstream Git blobs and pinned local
fixtures. Modeled controls verify reporting and failure paths; only a successful Linux CI
artifact establishes this bounded PostgreSQL observation. It does not run the plugin or
establish same-input MongoDB, indexed execution, managed HTTP or canonical fork recovery.

An offline differential connects SDK owner lifecycle mutations to the request-bound
indexed route and compares eight snapshots with the retained PostgreSQL report from
PR #71 run `41794348457`, artifact `13304981202` (report SHA-256
`dcfc8813f9c4fff797d563bb52f979e98cfca9e3071b2f9b06df4037ce7fec93`).
The SDK inputs use a different collection, schema and asset identifiers, mapped to
the original names for comparison. The original directly inserts a null-owner row;
the SDK fixture creates and burns its matching asset before the first populated
snapshot. Thus this compares corresponding resulting states, not identical source
events. Its query adapter is a test double populated from the SDK owner's retained
counts; it is not native indexed execution or a physical MongoDB comparison. Fork
rollback and complete-generation initialization remain separately unqualified.

## Explicit Mongo planner experiment

An independently selected `engineeringOwnedSchemaMongoComparison` option is available only
with `ownedSchemaCounts`. It declares `mongodb-simple-utf8-v1` for this one model; defaults
and every other indexed model retain the PostgreSQL comparison profile. The SDK declaration
digest changes, so an old selection cannot authorize the new model. This option does not
offer any backend capability, mark a generation ready, or claim comparison equivalence.

The original collections handler groups owned counts and has no `ORDER BY`; this component
requests a bounded name order only to retrieve a complete set after an exact count in the same
composed view. A qualified differential must compare membership as sets, keep contract and
collection equality and `owned > 0` filters, and fail rather than truncate over budget. A
simple binary order must not be substituted for any separately ordered or paginated endpoint.
Equality/value-domain compatibility against the original PostgreSQL collation remains open.

An optional source-bound control (`HAPI_INDEXED_REFERENCE_ROOT`) recaptures the declaration
with the native adapter SDK and exercises the actual Mongo indexed model, index generator,
sidecar encoder/decoder and count/page planner from HAPI source commit
`770faa16f8bd2b02f51bb6a6296b7092224f5301`. It pins the exact model source and emitted JS,
and verifies signed-int64 encoding and refusal of invalid values. This runs no MongoDB,
serves no native HTTP, and does not prove complete source coverage, generation rebuild,
recovery, production offers, or PostgreSQL equivalence. A physical same-input differential
requires a separately reviewed Linux fixture and controlled access to its MongoDB instance.
