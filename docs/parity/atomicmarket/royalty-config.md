# AtomicMarket royalty configuration component

Issue #62 adds `/atomicmarket/v1/royalties/:collection_name` against immutable Atomic API 2.7.0
commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. This is one source component; actual paired
PostgreSQL/MongoDB, initialization/recovery, managed HTTP/cache and full 93-path parity remain
independent release gates.

## Independent projection in the same package

The existing constructor and `getStatefulProjectionsV2` host seam now return two projections by
default. The first compound projection retains its 21 kinds, selectors, limits and domain reducer,
including the existing AtomicMarket 1.2.2 restriction. The second has ID
`<compound-projection-id>:royalty-config`, one `market-royalty-config` record kind and one configured
market-contract `royaltyconf` table selector. It negotiates the existing source-v2/owner and counted
keyed-read interfaces. No new SDK/query authority, native query, whole-kind enumeration, operator
flag, backend choice or default budget is introduced. Operators still install one Atomic package.

The host supplies actual ABI deployments, source/canonical ownership, binding/generation and
initialization coverage independently for the new projection. The plugin does not supply them.
No constructor default, empty table response or row field initializes this projection. Unknown
coverage, gaps, failed initialization and fork recovery remain retryably unavailable. Only the
existing owner/read contract may grant a canonically complete empty view; an absent royalty table
in an older ABI is not automatically that proof. Optional-table initialization and actual host
activation require qualification. The new declaration must not be adopted into an old namespace.

## Source and response behavior

The original `royaltyconf` callback runs at priority 1010. Present rows replace founders, mode and
split fields while preserving the first creation block/time; updates use the current source
block/time. Absent rows delete the keyed record, including harmless absent deletes. A later
recreation receives new creation metadata. Equal-priority inputs retain source order. Staged
effects and before images belong to the existing runtime; failures discard the whole candidate.

The decoded collection value is required for deletes, just as the original callback reads
`delta.value.collection`. Source-v2 permits an unavailable decoded value on a deletion; such an
input refuses this projection rather than guessing a collection from an opaque physical key or
inventing an alias/index. The adapter/runtime must recover the required original input or keep
the affected projection incomplete. Contract issues do not authorize stopping unrelated indexing.

Scalar names follow the original varchar/text boundary. Smallint mode is a JSON number; splits
and creation/update block/time are exact signed-bigint decimal strings. The private stored row
has version 1, excluded from the response. The reader validates exact row identity, shape and
storage types. Founders use the actual original `encodeDatabaseJson` replacement only at that
JSONB boundary, including scalar/null JSON values accepted by the original raw processor. Invalid
encoded JSON and JSONB-incompatible zero/surrogate values do not become successful state.
SQL engine ordering, numeric/JSONB rendering and actual physical error behavior remain paired
qualification work; the finite JSON parse/storage collaborator is explicitly a model.

The original handler is a single `(market_contract,collection_name)` lookup and returns the raw
SQL row. Query/body values are ignored; the path is literal and does not expand operator lists.
Covered absence preserves 416 `Royalty config not found`. Success retains the original
`{success:true,data,query_time}` envelope. All Fastify-supported methods are registered, using its
automatic GET/HEAD path to suppress HEAD response bodies. The existing host owns body parsing,
namespace/error policy, shared state headers and final publication.

Original static payout routes precede the collection wildcard. A registered payout route still
wins; until that family exists, `payouts` refuses as unavailable without reading a royalty config.
This is not a payout implementation or parity claim. Account/template/attribute/payout/list/stat
and socket families remain outside this component.

## Request ownership and cache boundary

One existing request-bound counted composition captures the record and the complete response.
Native attempts, record and UTF8 byte limits remain the caller's selected limits. The host must
retain its ownership, source, generation, cancellation/deadline and view guards through awaited
reads, serialization, onSend and any cache publication/hit. The plugin creates no listener,
independent cache, TTL or readiness authority.

The original route calls ordinary `caching()`: its actual middleware includes query/body data in
the key, omits the HTTP method, caches successful 200 responses under the configured TTL and
skips over-size responses. The finite VM controls execute that middleware with a scripted Redis
collaborator. This characterizes original behavior; it does not establish actual HAPI cache
wiring, cache retirement or managed serving. SDK/in-process publication guards remain separate
from those operational gates.

## Validation

`tests/fixtures/royalty-original-2.7/manifest.json` pins 12 raw original files by bytes, SHA256 and
Git blob identity. Tests strip TypeScript and execute the actual processor, selected handler,
route, wrapper, encoder and cache middleware with finite collaborators. They never import the
reference application, database clients, controller or legacy process helpers. SQL integer/JSONB
storage, rollback and coverage are modeled. No physical engine, source replay or crash recovery
is claimed.

Run `npm run test:royalty` for focused original/SDK/HTTP controls and the prior config component.
`npm run test:royalty:package` uses a separate screened asynchronous checker with normal command
close/EOF, no timeout/signal/termination path, and retained command streams. It packs current
emissions, installs a fresh consumer, compares every installed member, checks declarations and
runs the same focused controls against the installed package on Node 24/26. Native TS 7.0.2 build
and whole-project Bun 1.4.4 checking remain required. The older timeout-capable package checker
and broader reference/controller suites must not be run or imported on Windows for this slice.
