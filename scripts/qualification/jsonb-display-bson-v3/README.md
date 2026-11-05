# Owned binary BSON capture for JSONB display qualification

This is the separately versioned controller profile
`atomic80-owned-jsonb-id-bson-mongo-http-linux-ci-v3` and execution profile
`atomic79-hapi7270-jsonb-display-id-bson-host-sdk-mongo-http-v3`.
Physical acceptance is pending. Product sources, pins and the 27 accepted/six
refused original source cases are unchanged. All 63 SQL vectors, source/import
frontiers and full parity obligations remain visible.

The [v1 run](https://github.com/eosrio/hyperion-atomicassets-plugin/actions/runs/41976928421)
failed on SDK module identity. The [v2 run](https://github.com/eosrio/hyperion-atomicassets-plugin/actions/runs/41980617121)
passes 12 accepted vectors before its in-memory 32 MiB raw BSON trace limit throws
from a driver event listener. That recorder error changes an HTTP result to 503
and also blocks database cleanup. Both historical cases remain failed. A closed
private container/volume is not evidence that v2's database-cleanup assertion passed.

V3 stores each original owned command/reply BSON buffer once in a binary file.
Small references retain sequence, event, request ID, command name, length and
SHA-256, with normalized driver failure metadata where no reply BSON is exposed.
The original database/transaction event scope and 16,384-event ceiling remain;
the separately named raw BSON ceiling is 128 MiB, based on measured v2 volume.
There is no truncation or selected-event exclusion on a successful capture.
The concrete child sink uses exclusive fsynced file/directory writes and returns
the exact reference receipt. The final reference index carries no raw hex array.

Observers never throw into the MongoDB driver. A first serialization, size, sink,
receipt or event-pairing failure stays latched. Later callbacks do not grow maps,
references or files, and are counted as unrecorded. Workload guards and the final
capture check fail qualification; later recovery cannot turn an incomplete capture
into a pass. Binary bytes and every successful reference remain available by value.

Actor/session closure and exclusively marked database cleanup are independent of
native recorder health. Recording failures remain failed while cleanup uses the
original physical guard, actual actor closure and marker proof. Real physical
guard failure, a foreign marker or unclosed actors cannot authorize a drop.
The parent still requires child exit/EOF/file closure before removing only its
owned fixture. Existing 256 MiB total evidence, 96 MiB file, 32,768-file, deadline,
CPU/memory and all domain/fork/publication checks remain binding.

All d192 inputs and the v2 namespace/test remain byte exact against `2294d97f`.
There is one explicit historical workflow exception: only its automatic PR
trigger is retired, while manual dispatch and its complete jobs body remain exact.
The v3 binding records old/new full hashes and the unchanged jobs-body hash.
PR path filters use the complete PR diff; a sibling namespace alone would still
launch the old workflow. The new workflow explicitly targets the actual `main`
base and has positive/full-diff routing controls for all four Node/profile jobs.

The workload is the v2 source with nine enumerated recorder/profile/cleanup
edits, checked against the complete prior body. The admitted HAPI SDK instance,
original source inputs, native client and plugin/HTTP path remain in use. Only
Linux GitHub Actions may execute the physical entry points. Windows controls use
actual BSON bytes and inert VM/client/cleanup ports; they start no engine, worker,
listener or physical workload.
