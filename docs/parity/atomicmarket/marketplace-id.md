# Marketplace ID in the compound projection

[Issue #38](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/38) adds the real
`marketplaces` table effect and `/atomicmarket/v1/marketplaces/:name` to the existing compound
factory. The reference is API 2.7.0, commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
The older contextual marketplace mapper and scalar query component remain separate and unchanged.

## Source and state

The private reducer consumes decoded table values, the actual scoped table identity and the
source block/time supplied by the existing host. It writes one `marketplace` record keyed by the
configured market contract and exact marketplace name. A present row replaces the creator while
preserving the first creation block/time, including repeated rows in the same block. Original
marketplace and config callbacks share market priority +10; their source order remains stable.
An absent marketplace retains the original refusal. The caller discards the whole candidate on
any error, including earlier staged writes. No snapshot invents creation chronology.

The declaration now has **19 record kinds**, adding `marketplace` to the prior 18. Operators must
explicitly supply and negotiate sufficient limits. An explicit old 18-kind budget stays 18 and
fails actual SDK declaration admission; explicit 19 admits. The controls also retain 16/17 refusals.
The package does not raise a limit or migrate state automatically. Changed declaration and executable
inventories need normal compatible generation admission and qualified initialization/replay through
the existing host lifecycle. Existing Elasticsearch history is retained.

## HTTP and coherent reads

The route uses the existing request-scoped query host and one completed coherent composition.
It looks up the configured contract and untouched path name. It returns exactly the original
`marketplace_name`, `creator`, `created_at_block` and `created_at_time` fields, with the two bigint
columns represented as decimal text. Creator/name strings are not case-folded or trimmed.
Covered absence returns 416 and `Marketplace not found`; unknown coverage, invalid records and
final host failures refuse serving. No native query, adapter view or serving grant is created here.

The original `router.all` behavior remains additive; GET, POST and HEAD controls execute the
original namespace routes, handler and `returnAsJSON` over a loopback HTTP fixture. HEAD retains
its actual empty body. The reference harness now handles Fetch's null HEAD body explicitly, while
non-HEAD JSON decoding stays unchanged. Dynamic `query_time` is checked and excluded only from
stable-value equality. Original headers and host-owned serving metadata are separate concerns.
The new route's HEAD comparison also uses actual owned loopback HTTP: Fastify injection retains
the generated payload, while Node's real HEAD transport sends no body. No response is normalized
to hide that transport distinction.

The inherited source-string NUL/literal-backslash compatibility gap remains open. NUL lookup
names are explicitly unavailable rather than converted or treated as covered absence. Other
record/value/key/read/mutation/output bounds remain caller-negotiated; no list is truncated to fit.
The compound projection still has its existing restrictions on other domain inputs.

## Evidence boundary

The callback controls execute the actual original marketplace callback, priority scheduler and
replace SQL generator. A finite transaction collaborator retains creation fields; an explicit
bigint storage/type-parser boundary supplies the original HTTP fixture rows. This does not execute
PostgreSQL. HTTP controls execute the original server/namespace/router with exact scripted SQL.
Case and special-name API lookups do not claim that a particular on-chain ABI admits those names.

The emitted factory and actual installed tarball run the chronological, deletion, coherent HTTP,
caller failure, malformed-state and unchanged-budget controls. Separate actual SDK v1 staging
controls exercise the same private domain reducer's shadow reads, failed-port closure and finite
key/value/mutation refusals. Those v1 controls grant no original-input-v2 owner/source authority.
Current collection/authorswaps, asset, sale and auction controls remain in the integrated package.

Marketplace lists, config symbol-pair/oracle joins, aggregates, logs/history/socket routes and all
remaining inventory stay open. Physical PostgreSQL/MongoDB/WormDB comparison, actual worker/source,
fork/recovery authority, host serving and complete 2.7.0 parity remain separate qualification gates.
See [the coverage ledger](marketplace-id-coverage.json).
