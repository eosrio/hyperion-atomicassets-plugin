# AtomicAssets and AtomicMarket MongoDB engine fixture

This source-only fixture prepares one bounded combined domain experiment for
[AtomicAssets integration #10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10),
[full parity #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1), and
[History API stateful qualification #366](https://github.com/eosrio/hyperion-history-api/issues/366).
It does not qualify those issues. The original 2.7.0 parity baseline remains
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.

The runner uses bridge source `294abcd51a16a5d6ea4f0e00fe1531300402bf99`, the
actual emitted AtomicAssets and AtomicMarket reducers, opt-in SDK
`b64bac478fc8015d409d44aa6f100668e0e091d2`, adapter
`e4a46cfa69f0a0cf7f6ca51847a0efa51da80795`, and native driver 7.2.0.
It preserves the original stateful fixture guard byte for byte and the six
manifest entry names. The runner, domain helper and source pins occupy
`component/qualification/`; the original plugin sources, fixtures and emitted
files occupy `component/atomic-plugin/`. The original complete inventory admits
every file, rejects extras and hashes it before any plugin or database import.

## Source and build admission

Use the existing root-operated HAPI fixture manifest and provisioner. There is
no new provisioner, default configuration, service or dependency update here.
The manifest's input is this `plan.json`; actual case identity, executable,
owned PID birth, replica-set ID, socket inode and complete component file pins
must be populated by the operator before execution. The original phase,
operation, transaction, output and record bounds apply. The intended existing
case limits are 120 seconds per phase, 10 seconds per operation, 30 seconds per
transaction, 32 physical records, 256 KiB candidate and 64 KiB phase output.
These are experimental case bounds, not aggregate per-chain defaults.

`source-pins.json` binds 20 original Git source/reference blobs and enumerates
27 expected emitted files. A Linux build must produce the actual emitted bytes;
record them in `atomic-plugin/engine-build.json`, using the shape in
`engine-build.pending.json`. Keep its actual source/build receipts separately.
The declaration's hook artifact hashes the complete qualification and plugin
inventory, including this engine wrapper and the actual build profile. Its
backend and generation bind the exact owned case before SDK capture.

The pending profile has null file pins and is deliberately unusable. Neither it
nor the previous Windows controlled build proves a Linux build. Never copy
Windows emission hashes into the real engine manifest or normalize runtime
bytes to make admission pass. `npmCiExecuted` records the real build method;
`false` means reviewed existing dependencies, rather than an `npm ci` claim.
This metadata is an operator receipt, not source or chain authority.

## Five separate application phases

After root review, source-pinned Linux assembly and guarded case provisioning,
invoke the same original interface in separate native Node processes:

```sh
node component/qualification/runner.mjs a /owned/case/manifest.json MANIFEST_SHA256
node component/qualification/runner.mjs fail-b /owned/case/manifest.json MANIFEST_SHA256
node component/qualification/runner.mjs recover-b /owned/case/manifest.json MANIFEST_SHA256
node component/qualification/runner.mjs fork-c /owned/case/manifest.json MANIFEST_SHA256
node component/qualification/runner.mjs retention /owned/case/manifest.json MANIFEST_SHA256
```

Each phase requires the preceding passed, manifest-bound receipt. The root
operator must additionally require original successful host pre/post guards and
terminal wait closure between invocations. A later guard does not repair an
earlier failure. Do not retry or continue an uncertain invocation automatically.

| Phase | Required observation |
| --- | --- |
| A | Real mint/setdata, sale/create/start and explicit relationship rows yield 10 domain rows plus one engineering marker; repeated asset writes retain one original pre-block image. |
| Failed B | Real transfer and purchase precede the marker DELETE. AppName-scoped native `failCommand` error 2 must target that exact marker in the same transaction after successful asset and sale replacements and an outside-transaction intent. Require actual abort, unchanged A data/undo/progress, retained B candidate and unavailable composed reads. An unfired, earlier, differently targeted, transient-labelled or different-transaction failure refuses. |
| Recovery B | A fresh native application process recovers the original fsynced B candidate; its hook callback throws if invoked. Compare exact rows, pending clearance, receipt, one original image per key, complete composed response and stale-view/conflicting-replay fences. |
| Fork C | Roll back B to A, retain a raw intermediate A snapshot, reject old views, then apply only original schema/current-collection changes on replacement C. Asset mint and sale creation times remain A's, and both current joins see the same collection. |
| Retention | Empty D/E blocks evict original undo within two blocks/two receipts and explicit byte budgets. Retain raw intermediate D and E snapshots; older rollback refuses and gates reads. |

The engineering marker is seeded by the qualification wrapper in A and deleted
last in B. It is a backend-neutral declared record with no domain/API meaning.
It exists solely to select a genuine late native DELETE; it is not evidence of
AtomicAssets burn semantics. The original SDK keeps ordered mutations and the
native adapter executes each delete. Controls check the candidate and adapter
call; only root engine execution can establish that the failpoint really fired.

## Oracles and evidence

The separate primary observer uses linearizable metadata checks around a
transactional snapshot. Exact rows come from pinned original callback fixtures
plus explicit engineering block/evidence transforms, never the observed
post-write data. The independent undo oracle derives original before-values,
image IDs, ordered descriptors, receipt source/candidate identities, BSON byte
totals, retained floors and public recovery coverage. Expected retained image
counts are A11, B14, rollback A11, C13, D2 and E0.

The runner retains raw `physical-A`, `physical-failed-B-A`, `physical-B`,
`physical-rollback-A`, `physical-C`, `physical-D`, `physical-E` and final
unavailable-E captures, alongside bounded command observations and phase
receipts. It observes real request targets and transaction numbers to reject
an unrelated DELETE failure. Root custody still requires closed native/outer
streams, actual wait results, original deadlines and guarded physical cleanup.
There is no database crash, HA/failover or unknown-commit claim.

## Offline controls

```sh
ATOMIC_ENGINE_PLUGIN_ROOT=/reviewed/plugin \
ATOMIC_STATEFUL_COMPONENT_ROOT=/reviewed/backend-mongodb \
node --test harness/stateful/engine/offline.test.mjs
```

Without both opt-ins, controlled adapter cases are explicitly skipped. With
them, the tests validate original source and opt-in component pins and execute
the real emitted reducers/SDK/native adapter against its existing socket-free
controlled driver. They check exact rows/responses, ordered marker deletion,
before-image reuse, failed-candidate recovery, fork and retention. Constructed
command observations test refusal paths. None is a MongoDB execution or a
fresh application process.

Actual Node 24 and 26 MongoDB execution, original PostgreSQL/HTTP comparison,
production source/ABI and canonical-fork authority, complete query coverage,
public routes/headers, asset enrichment, templates/backing/bridge and the full
AtomicAssets/AtomicMarket API remain pending. Source JSON engineering envelopes,
rebased blocks, explicit relation rows and covered absence do not establish
those capabilities. Original NUL/metadata/safe-image differences remain open;
this fixture changes no response or storage policy to bypass them.
