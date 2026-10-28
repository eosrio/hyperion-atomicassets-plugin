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

The checked-in original [platform manifest](../../../harness/atomicassets/postgres/postgres-16.15-linux-amd64.manifest.json)
and [configuration](../../../harness/atomicassets/postgres/postgres-16.15-linux-amd64.config.json)
retain their exact registry bytes. Admission hashes both, checks manifest/config media types,
sizes and digest linkage, and verifies Linux/amd64 and PostgreSQL 16.15 metadata. Classic Docker
may report the linked configuration digest as the image ID; the containerd image store reports
the platform-manifest digest. Only those exact linked IDs are accepted. The manifest-ID form
requires the matching OCI descriptor digest, media type and byte size; any reported descriptor
platform must agree. A contradictory descriptor also refuses on the config-ID path. Exact
repository digest and container-image equality remain required; a reported container manifest
descriptor is checked too. This follows the [Docker descriptor contract](https://docs.docker.com/reference/api/engine/version-history/)
and [OCI manifest/config relationship](https://github.com/opencontainers/image-spec/blob/v1.1.1/manifest.md).
It changes fixture admission, not the selected image, resources, workload or engine acceptance.

Use a new 32-character lowercase hexadecimal run identifier. The fixed names are container
`aa-pg-RUN`, database/volume `aa_pg_RUN`, and database user `oracle`. Container, local volume and
run-owned bridge network must carry `io.eosrio.qualifier=atomicassets-original-postgres` and the exact
`io.eosrio.run` label. No bind mounts, volume device options, alternate entrypoint/command or restart
policy is admitted. Only the one owned data volume and one run-owned network are accepted. The
container must use exactly two CPUs, 1 GiB memory with no extra swap, and one loopback-only
published PostgreSQL port. The original image entrypoint and `postgres` command remain intact.
Use a new 64-hex fixture password; it is obtained privately from observed container configuration,
never accepted as a database URL or copied to the report. No trust-auth or initdb override is accepted.

The network name must be `aa-pg-RUN`, its driver `bridge` and `Internal` false, with exactly
`{"com.docker.network.bridge.enable_ip_masquerade":"false"}` as its driver options. Root creates
that fixture network explicitly with `--driver bridge --opt com.docker.network.bridge.enable_ip_masquerade=false`.
The actual published mapping must still contain exactly one PostgreSQL port on `127.0.0.1`;
a requested binding with a null actual mapping refuses before SQL. Docker29 omitted publication
on the earlier internal-only fixture. The [upstream report](https://github.com/moby/moby/discussions/53256)
corroborates that failure shape; [Docker's bridge options](https://docs.docker.com/engine/network/drivers/bridge/#options)
document the per-network masquerading setting. Disabling masquerading is not a standalone egress
isolation guarantee. Root must retain the separate no-NIC private LXC/namespace guard and exact
private daemon admission. No global Docker, firewall, namespace or production setting changes.

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

The default `original-lifecycle` input remains the exact existing
`lifecycle/input.json`. Its Git-LF blob is 2,855 bytes/SHA-256
`8006d4c79506d19bbdad4cab6f794368be960f30f90b673e07e1cc42e1fc7f6a`;
the established Windows CRLF checkout is 2,908 bytes/SHA-256
`6c4a2a25d7d57afe043c18cb20b9c9125992a5d90965fa8409cc0d689f6cfbfe`.
Only those two existing exact byte variants are admitted, and the actual raw
digest and checkout variant are reported. The loader rewrites neither one.
The portable lifecycle tracer and this original driver can now explicitly select
the same full `portable-safe-image` input:

```sh
node harness/atomicassets/postgres/run.mjs --execute --admission receipt.json --reference-root ORIGINAL --evidence-parent OWNED_DIRECTORY --input-profile portable-safe-image
```

This named fixture is pinned LF, 2,850 bytes/SHA-256
`612d44a7dfab5d722aeafc07ab768f9abc05875aac4992265b1ac9fff95d1115`.
Its raw JSON differs from the Git-LF original only by the declared `collectionData.img` change from
`image\u0000hash` to `image hash`. It retains the complete original input,
including the unchanged codec probes. No arbitrary input path or input
normalization is accepted. Unknown profile names or changed raw fixture digests
refuse before fixture observation or SQL.

The shared input loader records both raw input digests, the explicit substitution
choice and the unresolved NUL/literal-backslash exceptions. The parent binds
that descriptor into the child request and terminal receipt; the child and
scenario independently validate and report the same descriptor. Missing or
changed exception evidence refuses. Original expected outputs and older physical
reports remain unchanged. This adds a selectable same-input execution path;
**a new same-input PostgreSQL/view/HTTP versus physical MongoDB comparison has
not been run or qualified by these source controls**.

The separate [paired constructed mint capture](paired-mint-capture.md) adds an explicit
`--capture-profile constructed-genesis-mint-v1` opt-in for one shared engineering chronology.
It preserves this default lifecycle and keeps its actual physical comparison pending.

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
