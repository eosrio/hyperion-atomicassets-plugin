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
is pinned to the current host contract at `339b5c93`; the package permits preparation for that
exact Git revision only. No automatic executable plugin installation or release publication occurs.

Reference controls require the explicit checkout and fail when it is unavailable. They are not
silently skipped or reported as MongoDB, WormDB, chain or full domain qualification.
Repository documentation checks remain available through `npm run check:docs`.
Licensed under [MIT](LICENSE).
