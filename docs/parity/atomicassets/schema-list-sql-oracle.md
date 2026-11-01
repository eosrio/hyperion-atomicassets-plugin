# Schema list SQL characterization, isolated CI fixture

The `schema-sql-oracle.yml` workflow runs manually or on a scoped pull request and provisions a disposable GitHub Actions
PostgreSQL service from the existing immutable 16.15 image. The runner checks its
container/image identity, fixed local port, database and credentials, and admits an
empty database before applying the original migration sequence. It does not accept
an arbitrary database URL. It uses the original 2.7.0 handler, builder, formatter,
view and migrated schema. Its directly inserted rows are constructed SQL fixtures,
not chain-derived data. The runner captures raw rows, count results, overflow outcome,
server and collation metadata, and actual equal-key peer order. Peer order is not a
stable tie-break contract. No HTTP listener is involved.

This isolated GitHub CI path is distinct from the private-LXC qualification path;
its admission does not alter or replace that existing gate. The count-only overflow
outcome is recorded rather than inferred from query text. Fixture/image setup and
teardown belong to GitHub Actions. Manual execution and independent review remain
pending. Source checks and a passing CI run cannot establish MongoDB, HTTP, full
AtomicAssets, release, or production parity.

Each matrix job owns a fresh service for Node 24 or Node 26. The CI admission is
separate from the private gate: it validates the fixed service identity and local
binding, then independently checks version, database, user, application objects,
custom schemas, extensions and other databases before schema initialization.
Socket-free controls exercise the same admission functions. The report records
reference Git blobs and working hashes, harness bytes, Node executable, observed
fixture, terminal status, original failure and connection-close result. The report
is bounded; a missing artifact fails the workflow. A deadline records failure if
the process is still running. External runner cancellation or host loss can still
prevent a terminal update; artifact upload will then fail if no report is available.
