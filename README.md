# Hyperion AtomicAssets plugin

One EOS Rio operator package for AtomicAssets and AtomicMarket indexing and APIs, with modular
internal components.

Status: Development reference harness for Hyperion 4.5. No compatible plugin release is provided.
The pinned reference HTTP controls and explicit implementation frontier are documented below.
Maintained by EOS Rio.

Read the [architecture definition](https://github.com/eosrio/hyperion-tools/blob/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/architecture/hyperion-4.5.md),
[ADRs](https://github.com/eosrio/hyperion-tools/tree/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/adr)
and [release roadmap](https://github.com/eosrio/hyperion-tools/blob/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/roadmap/hyperion-4.5.md).

[SDK, runtime and adapter source homes](https://github.com/eosrio/hyperion-tools/blob/458e1127b99c025251055e160129010edcecc78a/docs/architecture/hyperion-4.5-component-homes.md)
define package ownership; assigned homes are not implementation or release-support claims.

## Scope

- Full API parity is required against atomicassets/atomicassets-api 2.7.0, commit
  0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e.
- The same definitions and logical queries work with each qualified backend; native database
  execution belongs in backend adapters.
- Asset and market lifecycle semantics belong in this plugin. Domain routes use the existing
  Hyperion API host.
- Releases are independent and tested versions are pinned by Hyperion. Standard 4.5 distributions
  bundle the qualified plugin disabled by default, enabled per chain.

## First work

Start from [parity inventory issue #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1).
Coordinate delivery through [release issue #24](https://github.com/eosrio/hyperion-tools/issues/24).

Start with P10: the complete pinned parity inventory and a reference harness. Implement endpoint
families with their necessary projections and query semantics; one working endpoint is not parity.

[Approved initial issue batch](https://github.com/eosrio/hyperion-tools/blob/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/roadmap/hyperion-4.5-initial-issues.md).

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
## Reference execution

The [AtomicAssets inventory](docs/parity/atomicassets/README.md) covers the pinned reference routes
and records the current capability/input frontier. The shared harness executes the original
upstream HTTP server and routes against explicit synthetic database-boundary fixtures.

Prepare a sibling reference checkout and install its own committed dependency lock:

```sh
npm run reference:prepare -- --destination ../atomicassets-reference-2.7.0
cd ../atomicassets-reference-2.7.0
pnpm install --frozen-lockfile
```

Use pnpm 11.13.1 for that exact upstream reference. Set `AA_REFERENCE_ROOT` to its absolute path,
return to this repository, then run:

```sh
npm ci --allow-git=all
npm run typecheck
npm test
```

The new TypeScript package uses TypeScript 7.0.2 and Bun 1.4.4, emits native Node artifacts and
checks on Node 24/26. The reference keeps its own pinned compiler/dependencies. The SDK dependency
is pinned to merged contextual contract `8d37e932`; the package permits preparation for that
exact Git revision only. No automatic executable plugin installation or release publication occurs.

Reference controls require the explicit checkout and fail when it is unavailable. They are not
silently skipped or reported as MongoDB, WormDB, chain or full domain qualification.
Repository documentation checks remain available through `npm run check:docs`.

## Combined query component

The [contextual Marketplace slice](docs/parity/atomicmarket/marketplace-indexing.md) adds an inert
backend-neutral definition factory and separate source/runtime/read engineering controls. Its
complete owned MongoDB program, including two actual Node host processes, passed on native
Node 24.19.0 and 26.4.0 at source `13c1094d` on 2026-10-27. Each run passed nineteen physical stages and
seven fault cases with cleanup and protected/Docker restoration. The
[derived acceptance summary](docs/parity/atomicmarket/marketplace-mongodb-acceptance.json) retains
exact source, runtime and raw-report hashes.

The [AtomicMarket inventory and scope](docs/parity/atomicmarket/README.md) joins the same package.
The first Market read component is available at the development subpath
`@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace`. It reads four scalar marketplace
fields through the existing SDK query contract and returns the adapter's serving view unchanged.
It is not a registered Hyperion HTTP route or a source-ingestion implementation.

`npm test` runs both domains' reference HTTP cases and the Market query component tests against
normal emitted ESM. `npm run test:package` packs the compiled files, installs the tarball in an
isolated consumer, imports the public subpath, and typechecks its installed declarations. Both
checks run on Node 24 and 26. The package includes the upstream license/notice files; source and
fixtures are not required for the compiled consumer.

Actual Hyperion HTTP routes remain zero. Full source coverage, PostgreSQL execution, WormDB,
production backend activation and complete AtomicAssets/AtomicMarket parity remain unqualified. The package
is private development work and this validation does not publish or activate an extension.

## Portable asset formatting

The development subpath `@eosrio/hyperion-atomicassets-plugin/atomicassets/asset` exports
`formatAsset` and its structured input/output types. It formats already decoded metadata and
explicit collection/schema/template relationships without database queries or input mutation.
Exact identifiers remain strings. The [formatter contract](docs/parity/atomicassets/formatter.md)
records the pinned source rules, actual original HTTP controls and remaining integration work.
Normal emitted ESM and the installed packed consumer run the same eight discriminating cases.
This formatter grants no source coverage, serving readiness or Hyperion HTTP integration.

## Original asset lifecycle controls

The [source-pinned lifecycle and metadata controls](docs/parity/atomicassets/lifecycle.md) execute
the actual 2.7.0 processors, priority scheduler and locked AtomicAssets 2.2.0 codec. They retain
original source/lock/helper blobs and captured outputs. The transaction boundary is an explicitly
bounded script; its recorded effects do not qualify PostgreSQL, MongoDB, source ingestion,
rollback or coherent relationship serving. These controls run with the normal reference tests.

Licensed under [MIT](LICENSE).

The private process-restart qualifier records successful MongoDB transaction controls separately from data writes.
After startup, the recovered child still refuses all data-write commands, output aggregates, unknown commands,
and command failures, and retains the original physical metadata/receipt/checkpoint/record equality gates.
Both successful and failed transaction-control evidence is retained in child and parent reports. The measured
`f1d6f222` Node 24 run stopped at a commitTransaction-only monitor assertion; it did not establish recovered physical
equality, and Node 26 was skipped in that historical attempt. The corrected full program passed both
native versions at source `13c1094d`: recovered B admission and replay were duplicate, data writes and
command failures were empty, two successful commit controls were retained, and all independent
physical equality gates passed. This covers constructed source and reconstructed in-memory ES
transport with graceful process restart; deployed contracts, persistent ES, crash/lost-ack recovery
and production activation remain outside this result.

The [original PostgreSQL asset oracle harness](docs/parity/atomicassets/postgres-oracle-harness.md)
is a source-only implementation against the pinned 2.7.0 schema/processors/view/HTTP path. Its
strict owned-empty admission and socket-free controls do not establish an engine pass. Actual
PostgreSQL runs, independent physical cleanup and review remain pending; it adopts no pending
stateful SDK/core interface and makes no MongoDB or full-parity claim.
