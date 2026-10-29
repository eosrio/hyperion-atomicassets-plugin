# Original source-control terminal evidence

[Issue #41](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/41) adds diagnostics to
the actual `tests/fixtures/asset-postgres-source.cjs` child used by the loader admission test.
It is separate from the physical PostgreSQL runner and from marketplace PR40's frozen source.

The parent retains its one `spawnSync`, existing 60000 ms deadline, 2 MiB buffer bound, original
assertions and temporary SQL-CWD cleanup. Before asserting the result or removing that CWD, it
writes a fresh receipt under `out/postgres-source-probe/`. Returned stdout, stderr and FD3 buffers
are retained byte for byte with length/hash pins. Missing streams and terminal fields are marked
unavailable; they are not fabricated as empty output or a successful exit. Actual PID, status,
signal and bounded spawn-error fields remain visible. Cleanup has a separate exclusive record.

`spawnSyncReturned` describes the returned API call. `normalProcessExit` describes only the
observed process result, not a valid source proof or qualification. The original assertions still
decide that control. Even a complete FD3 packet or final phase marker cannot waive a timeout,
nonzero exit, missing proof or failed original assertion.

The child writes at most sixteen small monotonic markers to stderr around source capture,
definition copying, module loading, schema orchestration, codec controls, logger close request
and final FD3 publication. They do not change its SQL, codec, source pins or proof fields. Raw stderr
is always retained; malformed or nonmonotonic markers are reported as observational data. Marker
absence does not identify a cause, and a last observed marker does not prove a stage completed.
Sockets/listeners remain prohibited and no database/server is started.

Deterministic terminal fixtures cover partial timeout output, unknown/empty fields, marker bounds,
immutable receipts and cleanup survival. Quick real native pipe-four children cover zero/nonzero
returns. These controls are not an actual original-loader timeout reproduction.
An additional native control runs this exact parent test through a narrowly preloaded controlled
spawn result, then verifies its persisted raw buffers, failure assertion and cleanup. Its reference
tag starts `CONTROLLED-PARENT-41`; those records are separate from the actual original-loader run.

The two uninstrumented local Node24 full failures at PR40 head7232 remain failed. Passing isolated
baseline/candidate controls and CI do not explain them or prove a baseline flake. A later single
instrumented diagnostic must state its exact source and evidence question; it is not an unchanged
retry-until-green policy or retroactive acceptance of PR40's failed local full24 runs.

The first combined attempt at `bf2fdf46` failed in parent instrumentation because its new source
pin calculation omitted the `createHash` import. Its child terminal outcome and pipes were not
retained; the roughly sixty-second duration does not establish a timeout verdict. That attempt
remains failed. The import correction is covered at the actual parent callsite before another
distinct corrected-source combined run; neither the original deadline nor test concurrency changes.

[Issue #43](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/43) replaces the 206
individual pinned-blob subprocesses with one ordered `git cat-file --batch` call per capture.
The same 206 blobs total 969192 raw bytes; their complete framed output is 979796 bytes, inside
the unchanged 2 MiB output bound. A capture uses six Git subcommands instead of 211. Every call
still validates HEAD, tag, tracked status, tree identity, package/codec pins, all working files,
symlinks, lock bytes and 176 definitions. No working state is cached across calls.

The private byte parser requires exact ordered OID/type/size headers, body SHA, separators and
final EOF. Binary, empty and malformed frames plus process errors are controlled explicitly.
The actual `originalSource` caller is compared with the preserved raw `494c6bba` implementation;
controlled Git/FS faults and real read-only capture are labeled separately. Its existing 10-second
Git and 60-second parent limits, full concurrency, original assertions and all phase markers stay
unchanged. The frozen `494c6bba` full26 timeout remains failed; a new source's controls and timings
cannot retroactively establish a cause or acceptance for that run or earlier failures.
