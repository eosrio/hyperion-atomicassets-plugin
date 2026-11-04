# AtomicMarket royalty table rules and attribute list component

Issue [#65](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/65) targets immutable
Atomic API2.7.0 `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. This first source child adds independent
`royaltytemp` and `royaltyattr` projections and `/atomicmarket/v1/royalties/:collection_name/attributes`.
The optional engineering template list source component uses SDK int64 membership from issue #51,
pinned to merged SDK commit `cbfb26694b90b52266d1e0b9b5dbf6f8389e736b`. Neither original
rule list has a count route or interprets a count argument. Payouts/account earnings, rule matching,
pricing and settlement reconstruction remain outside this component.

This is a source component, not physical/native/managed parity. Its [coverage ledger](royalty-rules-coverage.json)
keeps qualification and the template query gap explicit. The existing 21-kind compound projection
and royalty-config projection retain their declarations/reducers. The single enabled package bundles
two additional internally independent table declarations, without another enable flag or widening
the compound market's1.2.2 restriction.

## Source, storage and initialization

Each table owns one selector/record kind and a separate projection ID:
`<root>:royalty-template-rules` / `market-royalty-template`, and
`<root>:royalty-attribute-rules` / `market-royalty-attribute`. The attribute declaration requires its
indexed model. The template declaration requires its model only with explicit
`engineeringRoyaltyTemplateQuery: true`; the default retains the previous declaration and does
not register the template route. Both inherit the existing selected
limits and owner/source-v2 lifecycle; neither can grant coverage/readiness or depend on a config row.
Runtime initialization and actual ABI/source coverage must establish their complete view before
queries can return an empty result. An absent table/failed decode is not automatically covered empty.

The [original callbacks](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/filler/handlers/atomicmarket/processors/royalties.ts#L208)
use the configured market and actual `delta.scope`, not a decoded collection field. Source-v2
contract-row identity retains this scope; KV identities refuse rather than invent a scope.
Equal-key occurrences keep source order at the original TABLE_ROYALTIES priority. Inserts and
replacements preserve first-created block/time; deletion/recreation starts new creation metadata.
Canonical mutation/candidate discard, replay and fork undo remain runtime/adapter responsibilities.

The original [SQL table types](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/definitions/tables/atomicmarket_tables.sql#L249)
govern row shapes: signed BIGINT IDs/weights/blocks/times, SMALLINT source, text field, JSONB value
and recipients, and bytea lookup_hash. Internal records retain exact canonical decimal strings,
including source for the typed index. Only the validated signed16 source becomes the original JSON
number in the response. No ID/weight is converted to Number. Extra recordVersion is private and
never exposed. Present row/version/key/selected-field types are rechecked before shaping the body.

The original stringify/regex JSON encoder applies only at recipients/value JSONB boundaries;
scalar field text retains literal backslashes and rejects invalid PostgreSQL text. Buffer.from(hex)
is the exact callback conversion, and the attribute response returns its lowercase hex bytes.
This is not a new SHA validation/authority rule: odd/invalid hex handling remains the original
Buffer behavior. Pure storage casts are modeled; PostgreSQL JSONB/numeric/error characterization
remains a physical gate.

## Attribute query and HTTP

The [original handler](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/api/namespaces/atomicmarket/handlers/royalties.ts#L97)
validates source, field, page, limit in that order. Source0 is an actual equality predicate. Literal
field text is not an operator list. Page defaults1; namespace maximum is `limits.royalties || 100`,
and default limit is min(maximum,100). `apiLimits.royalties` carries that existing namespace ceiling,
separate from the unchanged selected state/query budgets. Nonstring/empty values receive original
defaults. Query data is overlaid by the body. Literal path collection wins over unrelated query/body
fields and is not newly name-validated. Count, sort, order, boundaries, template_id and other unknown
arguments remain ignored. No count route is registered by this child.

The backend-neutral model has one base alias, no joins, market/collection/field text equality,
source int64 equality and numeric rule_id ASC order. The caller requests one complete OFFSET/LIMIT
window, not a full-kind scan, ID fanout or application sorting. It requires the explicit profile
`atomicmarket-270-royalty-attribute-pg16-v1`; that name expresses requirements only. Current native
production offers remain empty. The engineering Mongo simple profile does not qualify this model.
Native query/index/access-path construction and qualification stay in the adapter.

The route uses the existing request-bound indexed host composition once. Ordinary parameter
failures return original Atomic400 before host/data access. Missing host/profile/source/owner or
failed/incomplete reads return Atomic-compatible503 with retry-after1 and cache-control:no-store.
Covered empty pages return200/[]; config's416 is not reused. Original ALL methods and automatic
HEAD suppression remain. Static payout/account handlers keep their precedence; the distinct
`/royalties/payouts/attributes` path still represents literal collection `payouts`.
The actual host retains source/model/generation/view/request authority through serialization,
onSend and cache publication/hits. The plugin opens no adapter/listener/cache and grants no view.

SDK49 failure poisoning and closed result union stay intact. Original database500/408 execution
outcomes require [SDK50](https://github.com/eosrio/hyperion-sdk/issues/50) and qualified native/HTTP
mapping. Out-of-SMALLINT source/large-offset SQL behavior is still a physical comparison case;
the component does not fabricate500 rows or treat an invalidated request as a completed outcome.

## Controls and remaining gates

The engineering template route expands operator lists in source order, validates all `template_id` members
before page/limit, and converts weak signed decimal spellings to exact canonical int64 strings.
Raw UTF-8 input, token count, expanded item count and list-supplied UTF-8 bytes are bounded before
the corresponding expansion or conversion. The ceiling comes from the selected query byte and
set-value limits; one item remains permitted for scalar equality when the set allowance is zero.
Budget refusal is unavailable, not a partial list or a successful filtered response.
One ID becomes `eq`; two or more become bounded `in`, including duplicates. No application sort,
kind scan or fanout is used. The adapter must independently qualify set membership and numeric
ordering under `atomicmarket-270-royalty-template-pg16-v1`. The original null and overflow SQL
errors cannot yet be represented by SDK #50; after original validation they refuse with retryable
503 rather than inventing an execution result. No version or backend offer is granted here.

`tests/fixtures/royalty-rule-original-2.7/manifest.json` pins15 raw original blobs by Git ID,
SHA256 and byte length. The finite VM executes the real callbacks, attribute handler, validator,
builder, request merge, wrapper and registration. Storage casts, query results and view recovery are
modeled; the oracle never imports the original application or opens a database. Actual SDK source,
candidate and indexed composition controls cover both tables and ordinary Fastify responses,
early errors, ignored arguments, scope/types/order/delete/creation, rollback/replay, budgets and
publication invalidation. Test hooks model the host fence; they do not prove managed HAPI integration.

`npm run test:royalty-rules` runs the focused source controls. The separate
`npm run test:royalty-rules:package` checker uses normal asynchronous pack/install/build/test waits,
retains streams and compares every installed member and copied input before rerunning controls.
Node24/26, whole Bun1.4.4 checking and TS7.0.2 artifact emission remain required. Older timeout/stop
controllers and broad reference/package runners must not be imported/run on Windows for this work.

Keep #65 open for native profile/index/initialization coverage; same-input PostgreSQL16.15/Mongo8.0.34
query/error/explain/resource comparisons; actual source recovery/fork/restart; managed HAPI
HTTP/onSend/cache guards; and SDK #51 integration and separately qualified integer membership.
There is no implicit parity exception or production profile activation.

### Retained PostgreSQL comparison with a simulated reader

`tests/royalty-template-pg-snapshot.test.mjs` compares the actual Fastify route and SDK composition against the retained `royaltyTemplate` section of the original PostgreSQL 16.15 CI reports from [run 41783292706](https://github.com/eosrio/hyperion-atomicassets-plugin/actions/runs/41783292706), at source `a537b5eb533d507077c52b4cd06b8267f374e618`. The checked-in snapshot records the upstream baseline, both GitHub artifact IDs, official ZIP hashes, full raw report hashes and original SQL, bindings, rows, responses and database error codes; the two retained Node 24/26 original sections were identical. The artifact references and snapshot provide traceability, not a new database execution.

The candidate's reducer is seeded with the same six rows and its SDK query is evaluated by a finite test-only reader, independently of the captured expected rows. Ten successful original cases compare full response fields and order, including membership boundaries, weak numbers, duplicates and offsets. Six original PostgreSQL errors are separately checked against the candidate's intentional retryable 503, while invalid input remains 400 before a query. This control opens no MongoDB or PostgreSQL connection and does not establish native indexed behavior, query plans, managed HTTP publication, or parity for the differing error outcomes.
