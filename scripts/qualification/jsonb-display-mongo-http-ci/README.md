# Owned Linux controller for the JSONB ID comparison

This is controller profile `atomic80-owned-jsonb-id-mongo-http-linux-ci-v2`,
using execution profile `atomic79-hapi7270-jsonb-display-id-host-sdk-mongo-http-v2`.
Physical acceptance of this revision is pending. The original
[d192 workload](../jsonb-display-mongo-http/README.md), namespace, profile and test
remain byte exact; this controller does not update consumer pins, product behavior
or deployment.

The first [v1 Linux run](https://github.com/eosrio/hyperion-atomicassets-plugin/actions/runs/41976928421)
failed all four jobs after real MongoDB setup: its workload passed a HAPI-captured
owner declaration to the plugin's separately loaded SDK instance. The SDK correctly
rejected that transferable capture. The failed v1 verdict remains failed. Root's
artifact audit verifies child exit/EOF closure, physical guards and owned cleanup;
none changes the workload failure into a pass.

`run-host-sdk-v2.mjs` preserves the original workload body with eight enumerated
source edits for its profile, sibling imports, SDK selection and SDK receipt.
A pure control compares the complete revised body against those exact deltas.
The new port selector resolves the SDK package from the actual HAPI registry's
location, checks the expected HAPI installation and ESM exports, and checks the
selected owner/source bytes against the frozen admitted `hapiSDK` inventory.
It imports those standard files without a loader hook or dependency alias. A
receipt records the package path/hash and selected port paths/hashes before any
database use. The registry and executor therefore retain the same local SDK
capture; no brand, receive/negotiation rule or source grant is bypassed.

The GitHub Actions workflow checks out the actual PR head, not its generated merge
reference, and HAPI `7270b1eba0e4e118e61fd282dbf44a66f361df47` under ignored `out`.
Both clean Git trees, emitted artifacts and exact controller binding are admitted
again in the physical child. The only descriptor cycles are this controller's
`admission.mjs` and `binding.json`; their authority is the reviewed caller Git tree.
Existing d192 and HAPI source/emission requirements remain unchanged.

Each of the four explicit Node 24/26 and original/safe-input jobs owns a fresh
MongoDB 8.0.34 replica set through the pinned HAPI `OwnedMongoFixture`. A generated
network, labelled container and anonymous volume belong exclusively to that run.
The controller refuses Docker endpoint overrides and verifies the default local
Unix socket, image digest, Linux/amd64 image, 2 CPU/1 GiB container limits and live
MongoDB process identity. It accepts no database URL or executable override.
Both readiness and workload clients use the pinned HAPI driver with
`retryReads:false`, `retryWrites:false`, `maxAdaptiveRetries:0`,
`promoteLongs:false` and `monitorCommands:true`.

Before Docker effects, the controller downloads all four exact original artifacts
from the official GitHub API for run 41958628616. Artifact IDs, ZIP sizes/digests
and original report sizes/digests are pinned independently. Redirects are bounded,
HTTPS-only and host-allowlisted; the API token is never forwarded to archive hosts
or the workload child. ZIP parsing accepts exactly one bounded regular file and
performs no archive extraction. All four reports must validate before staging.
Original report bytes are also retained through exclusive, fsynced evidence writes.
The child verifies the complete report set again before creating a MongoDB client.

Fresh physical observations check boot/PID/birth, cgroup OOM counter, available
memory and disk, CPU/total-memory envelope and a finite monotonic deadline before,
during and after execution. Missing readings and evidence-write failures fail the
run. The parent deadline is 600 seconds, workload deadline 360 seconds, supervised
child deadline 420 seconds with a 10-second kill grace, and each child stream is
limited to 1 MiB. Individual evidence files, total evidence and file count are
bounded. This is a resource envelope, not a performance qualification result.

The parent persists intent before spawn and records executable/argv, real PID,
birth/boot identity, exit, both EOFs and fsynced stream-file closure. The child
retains the actual plugin/native MongoDB/managed HTTP observations, its own source
admission, guard receipts and client closure. Native database cleanup is owned by
the frozen workload. The controller only removes its exclusively owned fixture
after child/stream closure and durable pre-cleanup diagnostics. A closed failed
child may clean up; its original failure remains failed. Missing closure retains
the fixture and explicitly fails. Final guard or cleanup failures never pass.

Root reviews and publishes this source before selecting a GitHub Actions run.
The workflow is the concrete Linux entry point; no Windows physical execution,
remote host action, CI dispatch or deployment is part of source validation.
Windows tests use inert VM actor/resource ports, actual SDK module identity and original codec controls;
they do not start MongoDB, Docker, workers, HTTP listeners or physical timers.

A successful Linux result would establish only the frozen workload's 27
source-representable accepted collection/asset ID displays and six refusals.
All 63 original vectors remain accounted for, including the 30 explicit
source/import frontier cases. Other joins, Redis caches, full worker/current-chain
authority and full AtomicAssets/AtomicMarket parity remain pending.
