# Packaged stateful plugin factory

This is the component in [issue #26](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/26),
using SDK owner/source interface version 2. It is not production readiness or full 2.7.0 parity.

The root default export is the constructor used by the existing Hyperion plugin loader.
`createAtomicStatefulPlugin` is also exported at `./plugin`. Both return one compound
AtomicAssets/AtomicMarket projection, so a sale and its nested assets use one completed view.
Configuration accepts `projectionId`, `assetsContract`, `marketContract`, and required explicit
`limits: StatefulLimits`. The host validates/negotiates these limits; none are a qualified default
budget. Operator enablement remains the existing per-chain plugin configuration and `.state.json`.

The existing loader still imports `plugins/<key>/build/index.js`. Install the package in that
plugin directory, and copy the distributed `legacy/package.json` and `legacy/build/index.js` to
the same relative locations there. The wrapper contains only:

```js
export {default} from '@eosrio/hyperion-atomicassets-plugin';
```

No additional executable loader is introduced. The constructor exposes empty legacy action,
delta and stream handler lists: state reduction uses the host's optional
`getStatefulProjectionsV2({binding})` path. A host lacking that v2 path cannot index this component.
Its existing `addRoutes(server, context)` path requires `context.statefulQueryHost(request)`;
missing context refuses registration. Both ID endpoints use the same projection ID. The wrapper
never opens an adapter or constructs a serving grant.

Templates omit all binding and ABI deployment/hash fields. The host resolves actual ABI epochs,
captures the original source and owns backend selection, candidate custody, owner/fork/cancellation
fences, recovery, coherent query authority and final response admission/headers. Domain dispatch
uses the captured kind/contract/name, not a synthetic selector ID. Host `codecRevision` is a compound
artifact identity and is not required to equal the metadata codec's individual hash.

The factory accepts actual decoded data directly, not the qualification bridge's JSON envelope or
`engineering.relations` inputs. It invokes the existing lifecycle and fixed-sale reducers unchanged.
Schema digests derive from actual selected formats or the staged schema record; source ABI evidence
is retained. Mint and setdata use the final schema priority-20 view before priorities 50/60. The SDK
must discard all staged effects on any throw. Market config version evidence remains source-bound.

`createAtomicMetadataCodec` verifies and delegates to the exact retained AtomicAssets SDK 2.2.0
CJS artifact, SHA-256 `2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573`.
Its MIT license and vendored IEEE-754 Apache notice/license are distributed unchanged. No metadata
decoder or asset/sale lifecycle is reimplemented.

`ATOMIC_HOOK_INVENTORY` records all 99 contract/action and four lifecycle registrations in the
34 AtomicAssets/AtomicMarket processor files at the exact approved original API 2.7.0 commit
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. Source hashes use raw Git blobs. Repeated registrations
are retained in the inventory but produce one logical selector per contract/kind/name. Every
implemented handler remains **partial**, including original history/notification side effects.
The original mint-priority flush is reused; original commit/fork hooks remain unimplemented here.

All original contract/action hooks are selected. An unsupported occurrence fails the affected
candidate explicitly rather than silently dropping that event. As a result, this component is
not ready to serve arbitrary production contracts. Templates, backing, mint reconciliation,
offer/token/symbol-pair/code relationships, conversion/pricing, scope-less table domain mapping,
remaining APIs and NUL/literal-backslash conversion remain explicit gaps. The v2 source retains
actual scope-less identities; this restricted domain adapter refuses them instead of inventing
a scope. Missing offer/token reducers cannot be replaced by synthetic relation rows. Native
engine success and source controls do not establish same-input PostgreSQL/view/HTTP parity.
