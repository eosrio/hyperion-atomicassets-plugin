# Indexed schema list/count consumer

Atomic #59 adds the backend-neutral consumer for `/atomicassets/v1/schemas` and
`/atomicassets/v1/schemas/_count` against immutable API 2.7.0 `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
These two registrations bring source components to 13 of 93 inventoried JSON paths. They do not
establish complete endpoint compatibility, native serving or release parity. Keep #59 open.

## Declaration and request host

The existing compound declaration keeps its 21 record kinds, selectors, reducers, integer paths
and caller-supplied limits. One `requiredIndexedQueries` requirement describes the full schema
model: schema base, inner-one collection, left-one schema-asset-count, complete filters and six
order tuples. Model ID is `atomicassets-schemas`; revision is `atomicassets-270-schemas-v1`.
It requires `atomicassets-270-pg16-enUS-utf8-v1`. This is a name for needed original semantics,
not a claim that any backend offers them. Mongo simple comparison is not a substitute.

HAPI #419's existing optional `statefulIndexedQueryHost(request,projectionId,modelId)` supplies one
owner-bound composition. The plugin declares logical requests and formats returned records;
it creates no native query, listener, read owner, readiness setter or independent cache. No
whole-kind/get fallback is used. A missing model/profile/materialization or host returns retryable 503
with `retry-after: 1`, `cache-control: no-store` and an Atomic error envelope. Other ID/get and
complete-kind routes retain their existing ports. Unsupported model index admission must remain
local to that model; it must not disable the existing canonical owner.

The schema model's read-attempt/record/response-byte totals reuse the selected state limits.
Query bytes are min(inputBytes,responseBytes), predicates reuse value.fields, order terms are
min(2,value.fields), and set values reuse value.arrayElements. No ceiling is silently raised.
An original page larger than the selected read budget must fail, never become a truncated page.

`apiLimits.schemas` optionally supplies the original namespace API maximum; default/falsy zero
retains 1000, and default page size is min(maximum,100). This API ceiling is distinct from state
resource budgets and is not an enable flag. Unsupported operator ceilings fail this consumer
rather than changing other routes. SDK #49 is pinned exactly at `dc20a03f2b60ba05a3369d677222a9cf0d65d299`;
the committed npm lock and package checks select it explicitly. Frozen historical pins remain
historical evidence, not updated qualification profiles.

## Original behavior retained in the consumer

The [options/query ledger](schema-indexed-ledger.json) names each original stage. Query parameters
are overlaid by the request body; `_count` then forces count=true. Validation follows original
field order, then boundary fields, then greylists. Nonstring/empty values receive original defaults.
Lists expand once, preserve order/duplicates and do not recurse. A request obtains one list provider,
resolves fields/tokens in original order and retains repeated names within that request. It does
not front-load a later list failure ahead of an earlier invalid parameter. Missing/empty published
lists remove ordinary list filters; a whitelist/blacklist intersection can still mean match-none.
All results must have the same configured source/generation. The actual host retains source/configuration
and cancellation guards; normal list data revisions keep the provider's established cache policy.

The original list validator wraps its database/list failures as a parameter 400. The accepted portable
operator-list unavailable policy is retryable 503. Invalid expanded values retain original 400;
an unavailable or incomplete provider is never presented as an empty list or a successful response.
Source controls record this operational distinction explicitly.

Contract, collection/schema membership, authorization, literal match, bounds and greylists become
structured predicates. The boundary's ids/primary-name union remains a separate conjunction.
Created/schema/asset order preserves requested direction, NULLS LAST and schema-name secondary
order without inventing a collection/key tiebreaker. A redundant same-field secondary term is
represented by the equivalent single field. Offset retains the original QueryBuilder Number
arithmetic; identifiers and exact counts never pass through Number. An offset outside the closed
indexed contract refuses as unavailable; its SQL error outcome remains a qualification dependency.
Count-only bypasses pagination entirely.

The count result is an exact decimal string. It does not format or cast joined asset totals.
A page distinguishes a missing aggregate from present zero for ordering, then displays either
as numeric zero. Its selected signed-int32 total uses the original 500 envelope on overflow.
The native planner must still qualify SUM/cast/error behavior outside the returned window.

Original schema descriptors/types and media hints are preserved. Collection name/img/images
use the SQL view's JSONB `->>` behavior. A private pure helper renders the structured values
at this one view boundary; schema format/types are ordinary JSONB boundaries, not metadata
encoder replacements. Literal backslashes remain literal. The helper follows PostgreSQL 16.15
[JSONB output](https://github.com/postgres/postgres/blob/REL_16_15/src/backend/utils/adt/jsonb.c#L474)
and [key ordering](https://github.com/postgres/postgres/blob/REL_16_15/src/backend/utils/adt/jsonb_util.c#L1767).
It does not sort query results or qualify text collation. Physical numeric/JSONB rendering remains
an explicit comparison gate; canonical source values and initialization must preserve the original
encoder's representation.

All supported methods use Fastify's automatic HEAD suppression. Empty and past-end pages return
the original empty array; no row is fabricated. The actual host owns shared headers and retains
owner, source, view, list-generation and comparison admission through reads, serialization,
onSend and any cache publication/hit. The plugin does not implement a replacement cache.

## Evidence and remaining gates

Finite controls execute 15 raw original Git-pinned files, the actual bundled schema formatter,
real SDK owner/indexed composition and ordinary Fastify injection. SQL rows, list/moize storage,
native query replies and publication collaborators are scripted. They are not PostgreSQL, MongoDB,
SHiP input, a managed HAPI server or cache qualification. The selected model has no native offer
in these artifacts; a test adapter's scripted offer is not a qualified comparison profile.

The screened `test:schema-list:package` check performs normal asynchronous waits, packs current
emissions, installs a fresh consumer, verifies every member and copied input, checks declarations
and reruns the same source controls against installed code. The older stop-capable package and
reference/controller runners must not be run/imported on Windows for this work. Linux retains
the broader existing checks. Whole-project Bun 1.4.4 check and TypeScript 7.0.2 build remain required.

HAPI #415 must complete joined predicates/order, text bounds/matching and qualified access paths.
Production comparison offers remain empty; engineering simple comparison is deliberately insufficient.
Actual MongoDB 8.0.34 and original PostgreSQL 16.15 must compare every required query/error variant,
including equal-key peers, nontext JSONB, source/list failure precedence, unsafe offset forms and
off-page aggregate overflow. Native query failures currently poison the SDK composition; original
SQL 500/408 outcomes versus retryable state unavailability require explicit host/native qualification,
not a fake error record or weakened poisoning. Source controls do not waive this boundary.

New index/field coverage needs a qualified state-only initialization/rebuild and gap-free catch-up.
Live collection authorization/count updates, fork/restart replacement, managed HTTP/cache and final
publication remain separate gates. Existing Elasticsearch history stays usable without a history
reindex. No Atomic parity exception, production activation or WormDB qualification is implied.
