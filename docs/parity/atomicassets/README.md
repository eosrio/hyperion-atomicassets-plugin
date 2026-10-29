# AtomicAssets reference coverage

The source baseline is AtomicAssets API **2.7.0**, exact commit
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. The upstream tag and package version
are checked before execution. The [inventory](inventory.json) records all **35 JSON API paths**
and two documentation redirects registered by the original AtomicAssets namespace.

The inventory includes actual Express methods, original OpenAPI parameters/defaults/responses,
source anchors for handler validation and errors, and shared response semantics. Nine registered JSON API
paths have no matching OpenAPI entry; their presence is established from the runtime router.
Source-linked semantics are an inventory, not a passing conformance result for those routes.
Upstream generated descriptions and source-derived rules retain the
[upstream license](../../../harness/shared/LICENSE.atomicassets-api.txt) and
[notice](../../../harness/shared/NOTICE.atomicassets-api.txt).

| Family | JSON paths | Required behavior |
| --- | ---: | --- |
| Assets | 5 | List/count, exact-ID lookup, stats and logs; typed metadata precedence, original mint and enrichment. |
| Collections | 6 | List/count, lookup, schemas, stats and logs; permissions, collection metadata and relationships. |
| Schemas | 5 | List/count, compound-key lookup, stats and logs; authored descriptors versus derived media hints. |
| Templates | 6 | List/count, compound-key lookup, two stats aliases and logs; supply, flags and mutable/immutable data. |
| Offers | 4 | List/count, lookup and logs; both parties and both ordered asset lists, state and lifecycle. |
| Transfers | 2 | List/count; sender/recipient, ordered asset lists and memo. |
| Accounts | 4 | List/count, account and account/collection views with holdings. |
| Burns | 2 | Global/account burn views preserving burned-asset lifecycle data. |
| Configuration | 1 | Contract settings, token definitions and public response shape. |

The source socket inventory preserves **three registrations and two distinct namespaces**.
Assets use `/atomicassets/v1/assets`; both the transfer and offer handlers register the literal
`/atomicassets/v1/offers` namespace. Their notification channels remain `transfers` and `offers`.
No subscription or room API is declared for these handlers. The inventory retains every action/event
and payload declaration, configured-account filter, namespace-wide `fork` event, source anchor and
Git blob/hash. Asset `back` and `update` events require `socket_features.asset_update`; the upstream
sets it to true only when replacing the whole missing/falsy `socket_features` value, without merging
an existing object. The shared Socket.IO options are websocket-only with `allowEIO3: true`.
These are source declarations; reference socket sessions and Hyperion stream integration remain unqualified.

## First executed cases

The [single-asset input](../../../fixtures/harness/atomicassets/single-asset.input.json) supplies
a representative deterministic SQL-view row containing a large exact ID, nested collection,
schema and template data, and conflicting mutable/immutable values. The unmodified upstream
HTTPServer, namespace, router, request validator, formatter and JSON/error wrapper execute over
loopback HTTP. An exact ordered SQL/parameter script supplies rows at the database boundary.
Unexpected or unused queries fail the harness.

Native Node 24 and 26 cover the successful lookup, missing asset (416) and invalid ID (400 before
database access). The input is **synthetic**, not a chain capture or PostgreSQL execution.
Redis caching is disabled and the original background chain-health call uses an explicit stub.
No Hyperion plugin/projection, live chain, database engine or full domain qualification follows.

`query_time`, HTTP `Date` and `Last-Modified` are environment-dependent. Deterministic comparisons
cover status, compatible JSON data/error bodies and exact identifiers. Captured original values
remain in the raw validation output; comparisons do not freeze or rewrite the upstream clock.

## Input and capability frontier

The current SDK projection contract supports scalar records, fixed-ABI fields, equality filters,
key ordering, bounded counts, durable progress and rollback. A complete asset response needs
nested collection/schema/template views and typed metadata decoding/merging. This cannot be
represented faithfully by pretending an opaque JSON string is the final generic projection API.
Runtime-supported transformation hooks, structured values and relationship/read-context semantics
need a concrete cross-repository slice before this endpoint becomes a Hyperion implementation.
The [portable formatter](formatter.md) now implements the pure structured formatting boundary
against eight original HTTP controls; it does not implement those projection/host dependencies.

Further families require declared sort/range/membership filters, grouping/relationships and exact
count/pagination semantics. The inventory retains the original source rules, including dynamic
data filters and the distinction between optional aggregate counts and raw count fallback.
Those requirements must be demonstrated through adapters; native SQL/Mongo queries do not belong
in this plugin. No WormDB capability is presumed from this reference harness.

Initialization needs complete state and relationship coverage from an approved snapshot plus
catch-up or retained historical inputs. Logs, transfers, offers, burns and original mint require
the applicable historical lifecycle coverage. ABI-deployment and mapping revisions must remain
explicit. Existing Elasticsearch history is retained; new state initializes separately.

## Next bounded slices

The [collection-ID source component](collection-id.md) implements a coherent collection response
and actual `authorswaps` effects against original callback/handler controls. Its physical database,
source/recovery and Hyperion serving gates remain open; this does not close the inventory below.

1. Complete the structured asset/relationship projection and its compatible read through the
   existing Hyperion host, with the selected backend and immutable source/ABI context.
2. Add collection/schema/template families with their required initialization and query semantics.
3. Add list/count/filter/sort/pagination behavior, including large IDs and boundary cases.
4. Add lifecycle/history families and socket behavior; preserve burn semantics in the plugin.

AtomicMarket is part of the same operator package and is developed in its own domain directory.
All paths remain marked unimplemented in this AtomicAssets inventory until corresponding
Hyperion execution and reference comparisons exist. [Issue #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1)
stays open for the complete parity inventory/reference frontier; a passing initial request is
not full AtomicAssets/AtomicMarket parity.
