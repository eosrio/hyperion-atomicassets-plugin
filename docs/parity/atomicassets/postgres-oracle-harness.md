# Original PostgreSQL oracle: source-only harness

This implements the [audited plan](postgres-oracle-plan.md) for issue #10. It loads the exact
AtomicAssets API 2.7.0 sources, original handler/bootstrap, processors, schema/migrations, view,
HTTP server/router/handler and formatter. No PostgreSQL or HTTP listener was started during source
validation. Socket-free controls are not PostgreSQL results. MongoDB, SDK stateful interfaces,
Hyperion projections and complete parity are outside this harness.

## Root-owned fixture prerequisite

The harness creates, initializes, stops and removes no Docker resources. After independent review,
root must provide a fresh exclusively owned fixture, serialize it with other server qualification,
and arrange its readiness and final cleanup. The immutable Linux/amd64
[fixture pin](../../../harness/atomicassets/postgres/fixture-pin.json) came from the official
Docker registry on 2026-10-27. Its configuration reports PostgreSQL 16.15; a running server version
has not been observed. The selected image is:

`docker.io/library/postgres@sha256:cbf42f0edc946c0bc1b8eeed62403734e1f25dc67a3491455d07a92fdb558b28`

Use a new 32-character lowercase hexadecimal run identifier. The fixed names are container
`aa-pg-RUN`, database/volume `aa_pg_RUN`, and database user `oracle`. Container, local volume and
internal network must carry `io.eosrio.qualifier=atomicassets-original-postgres` and the exact
`io.eosrio.run` label. No bind mounts, volume device options, alternate entrypoint/command or restart
policy is admitted. Only the one owned data volume and one internal network are accepted. The
container must use exactly two CPUs, 1 GiB memory with no extra swap, and one loopback-only
published PostgreSQL port. The original image entrypoint and `postgres` command remain intact.
Use a new 64-hex fixture password; it is obtained privately from observed container configuration,
never accepted as a database URL or copied to the report. No trust-auth or initdb override is accepted.

Execution must be inside the root-owned private Docker/LXC namespace. The pinned socket path is
namespace-local `/var/run/docker.sock`; there is no global-Docker default or environment override.
The exact private daemon ID and socket device/inode must match the receipt. The known H1 global
daemon ID is refused. Do not pull the image into H1 global Docker: its image inventory and original
production-process baseline belong to the frozen Wire guard. Root must arrange a separately
authorized bounded pull window into the private daemon after source review. A different host-side
private socket path requires a reviewed pin change; it is not an arbitrary caller endpoint.

The root receipt has exactly these fields: `schemaVersion: 1`, `run`, `daemonId`, `socketDev`,
`socketIno`, `containerId`, `networkId`, `volumeName`. IDs and socket identity must come from actual
root observations, not copied examples. The runner inspects only the fixed local Docker socket,
checks the actual image/config identity, labels, mounts, resources, network and loopback mapping,
and derives connection parameters. It performs no pull, create, start, stop, remove or prune call.

With the exact reference and its frozen pnpm 11.13.1 development dependencies installed read-only:

```sh
node harness/atomicassets/postgres/run.mjs --execute --admission receipt.json --reference-root ORIGINAL --evidence-parent OWNED_DIRECTORY
```

Each actual native-version run needs its own fresh run/receipt/container/database. Reusing a
populated fixture is refused, not reset. The evidence parent must already exist. The runner exclusively creates its own `aa-pg-RUN`
subdirectory and copies the 176 pinned original definition files by value. Original code runs
there so its relative SQL paths and logger cannot write into the reference checkout.
`SWC_NODE_PROJECT` selects the pinned reference configuration; the transpiler cache is also owned.
An operator connection-config fallback in the reference is refused, and inherited test-connection
variables are removed. The original test helper is used only with an explicitly connected client;
its fallback config/factory never supplies a connection.

## Genuine baseline path

Before any DDL, the original connection must report the derived database/user and expected server
version, with no application relations, custom schemas, extra extensions or other application
databases. Only then does the original base setup run, followed by all six original test handlers,
version-sorted SQL/upgrades and original deferred SQL handling. The destructive `init-test-db` CLI
is never imported. SQL source/execution hashes and actual query outcomes are retained, together with exact harness,
fixture-input, audit-manifest and native executable digests.

Original `AtomicAssetsHandler.init` supplies the otherwise missing config row from declared
constructed tokenconfigs/config RPC inputs; the processor itself only updates that row. The
unknown-reader maintenance skip is recorded. No asset, view or HTTP row is seeded. Selected
original processors execute the exact decimal asset ID `9007199254740993`, template -1/null,
dependencies, mint with an earlier queued same-block update, wrong/right-owner transfers,
relationship/schema/media changes and burn. Transfer sequence IDs also remain exact signed-bigint
strings above 2^53. Actual committed tables, the migrated current view and separate original HTTP
queries are compared at each stage. Original creation metadata, missing-key replacement, transfer
history/notifications and joined relationship changes are asserted.

The current view and deferred constraints are inspected. Missing relationships and original
processor refusals retain errors and rollback evidence. Original NUL conversion and the known
invalid literal-escape JSON case are isolated probes, never repaired. A separate native JSONB
probe records integers, fractions, null, missing and nested shapes without claiming they came from
mint input or resolving SDK policy. Raw HTTP clocks/headers remain; comparison uses the original
formatter's data, excluding the wrapper clock alone.

## Bounds and remaining acceptance

The fixed native child has a 180-second outer limit, an 8 MiB report limit, a 256 KiB accepted-log
limit and explicit PID/exit/reap/group-absence checks. Original connection/SQL defaults and the
original transfer's local timeout extension remain; HTTP reads have a 10-second deadline and
2 MiB response cap. Failed and uncertain terminal evidence stays in the owned directory. There is
no retry or fixture recovery path. Query observation preserves both callback and promise driver
protocols; it never supplies database responses.

The report always leaves fixture cleanup/qualification pending root. Root must independently
close all writers, remove only its owned fixture resources and prove baseline restoration before
final custody or calling the oracle qualified. A child query result is not that evidence.
Node 24/26 source loading, admission/refusal, original SQL orchestration through an explicitly
scripted *unit-test* client, real installed pg-pool transport, codec boundaries, check and build are
source evidence only. The actual runner uses real PostgreSQL; no scripted client or HTTP response
is reachable from its execution path. Actual native PostgreSQL runs, independent review and
cleanup remain pending. PostgreSQL-only success would not establish MongoDB/WormDB parity,
production fork/restart recovery, deployed-chain capture or full AtomicAssets parity.
