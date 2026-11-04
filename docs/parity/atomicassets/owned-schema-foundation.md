# Owned schema count foundation (issue #68)

This private, unregistered transition helper stages an owned-asset count per contract,
collection and schema. An asset contributes exactly when its owner is non-null. The
pinned 2.7.0 migration `definitions/migrations/1.3.15/atomicassets.sql` initializes
`owned` with `COUNT(*) FILTER (WHERE owner IS NOT NULL)` and writes negative and
positive deltas for old and new rows. Its collections handler groups those counters
and uses `HAVING SUM(owned) > 0`; it specifies no order.

The caller must supply the actual old and new asset rows, invoke this helper in the
same atomic candidate as the asset write, and discard the entire candidate on any
error. Redelivery is safe only when the caller reads the current old row. A covered
absence means zero only for a new, completely initialized and caught-up generation;
it is not evidence that a pre-existing generation has no assets. Unknown coverage,
invalid identity, negative counts and signed bigint overflow refuse the transition.
The helper is not wired into the plugin or exposed as an API, and provides no source
coverage, initialization, rollback, serving readiness or compatibility offer.

An indexed query model can filter maintained `owned > 0` and collection equality.
The current SDK's indexed page requires a finite limit and declared order, whereas
the original endpoint is unpaginated and has no `ORDER BY`. A future implementation
must establish completeness in the same fenced view (for example, exact count plus
bounded page), refuse above the negotiated budget, and qualify the chosen order and
adapter behavior against the original. A filtered, complete bounded query capability
would avoid an unbounded asset-kind scan. Adapter materialization, projection lifecycle
integration, complete rebuild and recovery are still required.

The local tests exercise logical transitions with a constructed candidate stage; they
do not execute the original PostgreSQL trigger or SDK owner mutation/rollback machinery.
Original handler differential, SDK-owned candidate controls, PostgreSQL/MongoDB,
production HTTP/cache, initialization and fork/recovery acceptance remain pending.
