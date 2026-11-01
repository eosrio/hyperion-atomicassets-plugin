# AtomicAssets configuration component

Issue #52 implements `GET /atomicassets/v1/config` and automatic HEAD through the existing API
host. The baseline remains atomicassets-api 2.7.0 commit
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. This component adds no compatible release claim.

The route returns exactly `contract`, `version`, `collection_format` and `supported_tokens` inside
the original `{success:true,data,query_time}` wrapper. Token precision is a JSON number from the
original int4 storage boundary. Complete empty token/format arrays stay empty. Covered missing
config preserves the original 500 `{success:false,message:'Config not found'}`. Query parameters
and valid request-body keys are ignored. POST is not registered, matching the original GET-only
route. Namespace-wide 404/body-parser/error policies remain the API host's responsibility.

## Canonical lifecycle

The existing `config` record now contains a private versioned `api_config` object alongside the
collection decoder dependency. It materializes the finite supported-token inventory from actual
`config` and `tokenconfigs` source inputs. The route uses one counted `.get` through the existing
complete-kind query host; it never calls `.all`, scans kinds, performs native queries or fetches RPC
state. The projection keeps its 21 declared kinds and existing explicitly selected limits.

Both source rows are required for config API initialization. Their priority is 10, preserving
source order among equal-priority callbacks. Existing decoder-only rows still support their
earlier restricted consumers, but the new endpoint refuses them as unqualified. A complete API
row cannot lose supported-token input silently. Legacy namespaces require qualified state-only
initialization/rebuild/activation; an added field does not establish source coverage. The runtime
still owns snapshots, source/canonical ownership, checkpoints, readiness and generation changes.

Original initialization seeds version, format and token rows. Subsequent callbacks use length
changes to trigger token additions and persisted API-format replacement. Token identity is
`(contract,token_symbol)` and insert conflicts retain the original row. The decoder's current
format is retained separately from the persisted API format because a same-length source format
change updates the original in-memory decoder cache without rewriting that database column.
The original data has no explicit token ORDER BY; controls retain actual arrays without adding a
new sorting promise. Physical engine/order/text/JSONB boundaries remain paired-qualification work.

Comparison state, persisted API data and decoder data are staged in the same canonical logical
record. The SDK captures original source-v2 inputs and the fixed candidate before controlled
commit. Native durable application and rollback must recover that complete row together. No
process-global token cache or independent owner state is introduced. Component tests model
before-image restoration and replacement/catch-up; they do not qualify actual database rollback.

## Narrow upstream fork correction

[Upstream PR #255](https://github.com/atomicassets/atomicassets-api/pull/255), head
`febcd2fb6c849d8f075696f158b0d73de4c72c01`, corrects a proven original fork-cache defect and was
unmerged at review. A valid append-only orphaned addition of BBB, database rollback and canonical
addition of BBB or CCC leaves the original cache at the wrong length and suppresses the canonical
insert. The corrected callback reloads config/version/tokens from the rolled-back transaction.
The component restores its canonical stored state with the row, and the finite regression matches
the corrected callback while demonstrating the immutable baseline's failure. This narrow
correction is explicit; no arbitrary token-removal scenario or general parity waiver is assumed.

The raw baseline and correction sources, SHA256 and Git blob identities are retained in
`tests/fixtures/config-original-2.7/manifest.json`. Tests strip only TypeScript syntax and isolate
the actual config callbacks, initialization/reopen prefix, handler, GET registration and response
wrapper with finite collaborators. They never import the reference application, database clients,
controller or server. No child process, socket, timer, timeout or stop operation occurs in those
component fixtures. The initializer's later reconciliation/startup work is outside these controls.
The separately retained Root upstream PostgreSQL 14-18 CI evidence is not a local physical run.

## Bounds, serving and remaining gates

The route requires the existing request-scoped counted keyed-read host. It captures the full
response inside one composition, so native retries, the config record/response envelope and final
body share selected attempt/record/UTF-8 byte limits. It does not enlarge budgets. Unknown,
partial, stale, pending, gap, recovery, cancellation and expired contexts remain unavailable.
The owning host must retain its original owner/mapping/coverage/deadline guard through response
serialization, caching and onSend. The finite Fastify injection controls exercise these host
fences after the actual SDK completed capability closes. The plugin creates no request authority.

The original route requests shared caching with `ignoreQueryString:true`. This component supplies
no independent cache or TTL policy. Managed cache hit/expiry/retirement and actual publication
wiring require separate host qualification; component success does not establish cache parity.
Scalar NUL/JSONB physical conversion, arbitrary contract versions and cross-domain fork/cache
interactions remain within the existing full-family qualification gates.

Run `npm run test:config` for focused SDK/original/route controls and an existing marketplace SDK
regression. Run `npm run test:config:package` for a clean installed-tarball runtime/declaration
consumer using normal commands without process termination. Node 24 and 26, native TypeScript
7.0.2 emission and whole-project Bun 1.4.4 checking are required. These controls establish a
reviewable source component only. Same-input PostgreSQL/MongoDB, actual managed HTTP/cache,
source initialization/coverage and full AtomicAssets/AtomicMarket parity remain independent gates.
