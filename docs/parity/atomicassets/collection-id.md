# Collection ID and pending-author state

This component implements [issue #36](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/36)
against AtomicAssets API 2.7.0, commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
The original `getCollectionAction`, `atomicassets_collections_master` view, identity
`formatCollection` and collection processor define the behavior. Full [parity #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1)
and the physical comparison in [#10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10) remain open.

## State and source behavior

Scoped `authorswaps` inputs join the existing collection reducer at original priority 20.
Equal-priority collection/swap input order remains stable. A present swap updates the existing
collection's `new_author_name` and exact millisecond `new_author_date`; an erased swap clears both.
An unknown collection update has no effects. Neither operation creates a collection or changes
its creation fields. A later collection row preserves its creation and pending-author fields.
Collection deletion keeps the original refusal. The caller discards the whole staged candidate
on failure, including earlier effects; unrelated indexing remains a host concern.

The reducer consumes the actual source identity and scoped table data. It does not invent scope,
source evidence or pending-author state. The supported acceptance date is the actual decoded
uint32 seconds value; milliseconds are retained as exact decimal text. Erase does not read the
unused author/date fields, matching the original callback's conditional branches.

This collection component adds no record kind. The current compound declaration needs 19 kinds
after the separate marketplace addition; explicit old 18-kind limits stay unchanged and are refused.
No budget is silently raised. A changed hook inventory requires normal compatible
declaration/generation admission and qualified initialization/replay; unchanged kind count does not
grant source coverage. Existing Elasticsearch history remains usable.

## Coherent collection response

`/atomicassets/v1/collections/:collection_name` uses the existing request-scoped query host.
It looks up exactly the configured contract and untouched path name, following the original
parameterized query. It returns current retained contract/name, selected metadata `name`/`img`,
full decoded `data`, author/notification/account/fee fields, exact creation block/time, and both
nullable pending-author fields. No additional internal fields leak into the public body.

Covered absence returns 416 with `Collection not found`. Unknown coverage and incomplete/mismatched
rows refuse serving. A missing pending-author field is unavailable, never inferred to be null.
All reads belong to one caller-issued coherent view. The host retains cancellation, fork/source
checks, final response admission and shared headers; importing the reader or opening an adapter
does not establish readiness.

The supported collection display metadata `name`/`img` values are text, missing or null, matching
the existing asset component's input intersection. Nontext selections are explicitly unavailable
until their PostgreSQL JSONB text semantics are qualified; no stringification policy is invented.
The [field-specific metadata encoder](json-compatibility.md) now follows the original JS path;
physical original-profile and nontext JSONB display results remain pending. Malformed or oversized
values obey existing domain/SDK bounds.

## Evidence and remaining frontier

The controls run the emitted factory, real SDK declaration/record validation and Fastify injection.
The original reference child executes unmodified config/collection callbacks, priority scheduler,
collection-ID handler, formatter and `returnAsJSON`. It pins raw original source and the real
2.2.0 metadata codec before use. A finite transaction collaborator models the exact update predicates,
DDL nullable defaults and PostgreSQL bigint text decoding; a separate field model follows the
pinned SQL view. It does not execute PostgreSQL. Dynamic `query_time` values are checked as numbers
and omitted from differential equality. Listening sockets are prohibited.

Chronological controls cover replacement preservation, update/erase/max uint32 time, same-priority
order, unknown rows, deleted collections, literal names and original 416 bodies. Caller controls
cover unknown coverage, final host refusal, detached responses, malformed state and staged discard.
The same controls run against the actual installed tarball; the legacy wrapper also exercises
all four current ID routes through caller-issued views and the separately pinned strict inventory.

Collection lists, stats, counts, logs/socket/history, schema asset-count aggregates and template-ID
serving remain separate. Only the collection processor's `authorswaps` registration becomes partial;
its history/log registration remains unimplemented. Actual source/recovery/fork authority, physical
PostgreSQL/MongoDB/WormDB behavior, production serving and full 2.7.0 parity are unqualified.
