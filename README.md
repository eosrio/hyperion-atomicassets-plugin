# Hyperion AtomicAssets plugin

One EOS Rio operator package for AtomicAssets and AtomicMarket indexing and APIs, with modular
internal components.

Status: Development scaffold for Hyperion 4.5. No plugin implementation or compatible release
is provided by this initial repository. Maintained by EOS Rio.

Read the [architecture definition](https://github.com/eosrio/hyperion-tools/blob/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/architecture/hyperion-4.5.md),
[ADRs](https://github.com/eosrio/hyperion-tools/tree/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/adr)
and [release roadmap](https://github.com/eosrio/hyperion-tools/blob/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/roadmap/hyperion-4.5.md).

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

Start with P10: the complete pinned parity inventory and a reference harness. Implement endpoint
families with their necessary projections and query semantics; one working endpoint is not parity.

[Approved initial issue batch](https://github.com/eosrio/hyperion-tools/blob/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/roadmap/hyperion-4.5-initial-issues.md).

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
Repository checks validate scaffold documents and local links; runtime qualification is pending.
Licensed under [MIT](LICENSE).
