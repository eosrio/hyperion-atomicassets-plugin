# Collection/asset display through MongoDB and the managed HAPI host

New qualification namespace for Atomic #39, contributing to full parity #1 and
HAPI #366/#191. **Physical execution is pending.** This does not change a product,
the SDK, an existing qualifier, consumer pins, a default capability or deployment.

The named profile is `atomic79-hapi7270-jsonb-display-id-mongo-http-v1`. It binds
Atomic `a410e16497bd2a6529b72691bad03507f90dcc7f`, HAPI
`7270b1eba0e4e118e61fd282dbf44a66f361df47`, and SDK CBFB. Its new descriptor
freezes the entire Atomic emission tree, explicitly names all seven changed joins,
and records HAPI tracked sources/build, native emissions, both receiving SDKs,
MongoDB/BSON and Fastify inventories. Package locks retain the other dependency
pins. The two self-cycle exclusions belong only to this new descriptor/reader;
the caller must bind their reviewed harness commit and tree explicitly.

## Original evidence and source frontier

All **63** original PostgreSQL 16.15 cases remain in the ledger: 51 stored values
and 12 SQL `22P02` refusals, captured by original 2.7.0
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e` in run
[41958628616](https://github.com/eosrio/hyperion-atomicassets-plugin/actions/runs/41958628616).
The four complete original report files must be staged by the admitting controller;
their exact bytes/hashes are verified and retained by value before database effects.
The fixture extraction is independently pinned; no renderer output is an oracle.
The three raw SQL numeric probes remain separate and never enter the JS/chain path.

The measured capture updates `collection.data` directly with SQL. That operation
is broader than the original `collections.serialized_data` source path. The new
pure ledger runs the exact original codec and collections callback before claiming
that an input is reproducible through a supported collection format:

- **27 accepted cases** round-trip exactly, including their encoded bytes. The
  real plugin handles config/collection source inputs; the native owner stages and
  commits its actual mutations. Collection-ID and asset-ID HTTP display fields are
  compared to the measured original SQL/view/HTTP values. Stored metadata and all
  other response fields remain exact against their corresponding baselines.
- **6 refusals** round-trip through the source codec but the original metadata
  encoder produces JSON refused by SQL. The plugin must refuse the whole reduction,
  retain no candidate, preserve prior rows/checkpoint and record a source failure.
  The real HAPI route must return retryable 503 with no stale state headers.
- **30 cases** (24 accepted SQL values and six SQL refusals) remain explicit
  formatter/storage evidence with `pending-source-or-import-path` projection
  coverage. Nested objects, booleans, nulls, changed Unicode decoding and format
  names requiring a separate original config/JSONB-array proof are not relabeled
  as chain-source coverage. An original producing path or retained/imported-state
  path still needs qualification. No trust grant or acceptance waiver is added.

`ledger.json` records every input, original SQL outcome, codec attempt and frontier.
The default full lifecycle input remains `original-lifecycle`; `portable-safe-image`
is an explicit separate run, never an implicit substitution.

## Physical invocation

Only an independently admitted Linux controller may import `run.mjs`. There is no
automatic executable entry point, fixture creation or borrowed database URL here.
Root supplies its current physical guard, a fresh owned MongoDB 8.0.34 replica-set
client, durable evidence writer, exact input paths and the reviewed harness identity:

```js
await runJsonbDisplayQualification({
  profile: 'atomic79-hapi7270-jsonb-display-id-mongo-http-v1',
  hapiRoot, client, databaseName: 'h45_indexed_' + runId12,
  reviewedHarness: {commit: reviewedCommit, tree: reviewedTree},
  originalReportRoot, inputProfile: 'original-lifecycle', guard, persist
});
```

The client must use the pinned HAPI driver with `retryReads:false`,
`retryWrites:false`, `maxAdaptiveRetries:0`, `promoteLongs:false` and
`monitorCommands:true`. Root owns pool/socket closure and child process custody;
the workload tracks actual sessions/read handles and only removes its exclusively
owned database after resource closure and durable pre-cleanup evidence. Missing
closure or custody retains the database for guarded Root cleanup.

The real `StatefulProjectionRegistryV2`, plugin factory, SDK source/candidate owner,
native adapter and `installStatefulApiHostV2` perform the work. No final answer rows
are seeded and no engineering indexed comparison offer is installed. Original
codec bytes, input-v2 receipts, native command/reply BSON, bodies, headers,
failures, raw retirement and recovery state are retained. Native failure cases
use distinct owned generations; the healthy generation is queried after each.

Final publication controls exercise early/late controlled source and mapping
withdrawal, request abort, socket replacement, actual native owner takeover and
native rollback, followed by replacement-branch application. Repeated requests
retain exact bodies and serving headers. Redis/response-cache integration is not
mounted by this host seam and remains explicitly pending, as do full worker fork
coordination, the other five joins, current-chain authority and full AA/AM parity.

Windows checks are pure original-codec/callback, SDK capture and source controls,
whole-project Bun typechecking and native artifact emission. They never import the
physical entry point or create an HTTP server, timer, MongoDB client or worker.
