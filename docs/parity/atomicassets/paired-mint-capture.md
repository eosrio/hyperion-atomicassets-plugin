# Paired constructed mint capture

This is an opt-in engineering slice of [issue #10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10),
keyed to the pinned [2.7.0 inventory](inventory.json). It prepares one original PostgreSQL/view/asset-ID
HTTP capture and one portable MongoDB/coherent-read capture from the same complete named input.
No physical comparison, public Hyperion endpoint or full parity is established by source controls.
The existing default original lifecycle and frozen A/B/rollback/C engine cases are unchanged.

## One explicit input and chronology

Both sides require the existing `portable-safe-image` profile, preserving its exact original/selected
raw byte descriptors and unresolved NUL/literal-backslash evidence. They also require the separate
`constructed-genesis-mint-v1` capture profile from `harness/atomicassets/mint-capture-profile.cjs`.
It records the raw input's original block123456 and applied engineering block1 explicitly, retaining
the original timestamp, original sequence start, transaction ID and complete config row. Neither
raw fixture is rewritten. The stateful adapter's empty genesis starts at checkpoint0; this explicitly
constructed block1 is not historical catch-up, a snapshot seed or chain authority.

The selected stage creates config/collection/schema, mints untemplated asset9007199254740993 and
executes same-block metadata replacement through the original priorities/mint flush. It stops after
the `mint-and-replacement` snapshot. Other lifecycle stages and API families are not exercised here.

## Original capture

Use the existing [owned PostgreSQL harness](postgres-oracle-harness.md), with a fresh Root-admitted
fixture and installed exact original2.7.0 reference. Select both names explicitly:

```sh
node harness/atomicassets/postgres/run.mjs --execute --admission RECEIPT --reference-root ORIGINAL --evidence-parent OWNED_DIRECTORY --input-profile portable-safe-image --capture-profile constructed-genesis-mint-v1
```

The parent, child and scenario independently validate the entire input/capture descriptor, before
reference inspection or SQL. The original processes actual SQL and the actual light view, and its
actual asset-ID HTTP response retains status, headers, raw text and decoded body. The default command
without this new flag keeps the previous block123456 lifecycle. The new capture does not qualify it.

## Portable capture

Root must prepare a fresh independently owned case with the existing
`harness/stateful/engine/guard.mjs` manifest/preflight: exact loopback replica-set process/socket,
runtime, bounded operation/transaction/phase limits, empty database and complete source/module
inventory. Reuse SDKb64 and adaptere4 development assemblies explicitly; plugin source-lock SDK8d
remains unchanged and is not declared equivalent to that installed runtime assembly.

The new executable is `harness/stateful/engine/mint-capture.mjs`. In its fresh qualified assembly it
occupies the manifest's existing `qualification/runner.mjs` entry beside the unchanged guard. It does
not replace any frozen engine case or automatically modify its manifest. Its pinned plan is:

```json
{
  "schemaVersion": 1,
  "kind": "atomicassets-constructed-mint-capture",
  "pluginRoot": "atomic-plugin",
  "captureProfile": "the complete object from mintCaptureProfile for this exact assembled input"
}
```

`captureProfile` must be the actual object, not that explanatory string. Generate it against the
exact input bytes inside the assembled source tree. An original LF/CRLF variant mismatch between
the two captures refuses; the runner does not normalize input. The closed inventory includes all
transitive imports: the two lifecycle JSONs, both profile loaders, paired helper, bridge/scenario,
domain fixtures/codecs, actual plugin emissions and both separately captured SDK namespaces.

Only Root's bounded existing launcher may invoke the native Linux entry with
`HYPERION_AA_MINT_CAPTURE=1` and `--execute MANIFEST MANIFEST_SHA256`. Without the explicit opt-in,
it refuses before preflight or client access. It creates no service, changes no failpoint, drops no
database and performs no fixture cleanup. It refuses an existing database, retains the original
candidate before application, and uses the actual bridge/SDK/adapter for reduction and coherent
reads. A separate primary client captures a native snapshot with linearizable metadata checks around
it; the stage checks five physical record kinds, original-absence undo and the exact source/candidate
receipt. Sources, candidate, physical BSON snapshot and capture are separate retained artifacts.
Clients close before a successful capture is published. Root still owns actual process waits,
host guards, final no-writers/cleanup and sealed custody. Capture success is not their substitute.

## Compare retained results

After Root retrieves and verifies both runs, keep `mint.capture.json`, `mint.source.json` and
`mint.physical.json` adjacent, then run the data-only comparator:

```sh
node harness/atomicassets/paired-compare.mjs --original-run ORIGINAL_RUN_DIRECTORY --output FRESH_REPORT.json --portable-capture MINT_CAPTURE.json
```

Omit `--portable-capture` to record the missing side as `not-run`/blocked. The comparator binds the
original parent terminal to its raw report bytes, checks matching native/input/stage/chronology
descriptors and verifies portable source/physical member hashes. It compares original HTTP `data`
to the actual portable coherent-read value; no field allowlist or normalization exists. Original
status/headers/raw text remain visible. The public portable HTTP response is explicitly absent,
so that API cell remains `unimplemented` even when coherent values match.

All35 AtomicAssets JSON paths stay visible, with unselected cases `not-run` and unresolved NUL and
literal-backslash cells `blocked`. A safe-image input is a distinct engineering input, never a response
exception. The report exposes selected-value counts, not a full2.7.0 parity percentage. Independent
physical/provenance/cleanup qualification remains pending outside this comparator. AtomicMarket,
other lifecycle stages, filters/counts/pagination/errors/aliases/logs/socket behavior and all other
inventory remain open under [issue #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1).

Local `tests/asset-paired-mint.test.mjs` exercises profile/child/CLI/differ rejection. Its opt-in
`ATOMIC_STATEFUL_COMPONENT_ROOT` control uses the pinned actual SDK/adapter with a controlled Mongo
transport; it does not start MongoDB or qualify physical SQL/HTTP/Mongo behavior.
