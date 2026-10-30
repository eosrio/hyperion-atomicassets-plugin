# Packaged stateful plugin factory

This is the component in [issue #26](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/26),
using SDK owner/source interface version 2. It is not production readiness or full 2.7.0 parity.

The root default export is the constructor used by the existing Hyperion plugin loader.
`createAtomicStatefulPlugin` is also exported at `./plugin`. Both return one compound
AtomicAssets/AtomicMarket projection, so a sale and its nested assets use one completed view.
Configuration accepts `projectionId`, `assetsContract`, `marketContract`, `systemContract`, and required explicit
`limits: StatefulLimits`. The host validates/negotiates these limits; none are a qualified default
budget. Operator enablement remains the existing per-chain plugin configuration and `.state.json`.

The [bounded auction-ID slice](parity/atomicmarket/auction-id.md) adds one `market-auction` kind,
and the [template slice](parity/atomicassets/templates.md) adds one `template` kind, bringing the
earlier combined descriptor to 18 kinds. The auction slice adds the auction-ID route and seven partial processor
hooks; bundles, v2 continuity, templated pricing and full parity remain open. Explicit negotiated
record and array limits bound the complete bid sequence without truncation.
Its changed declaration and executable inventory require compatible generation admission and
initialization/replay through the existing host lifecycle. Old explicit 16- and 17-kind budgets
are preserved and refused. The independent AA template and auction children each required 17;
their integrated declaration requires 18. This is an explicit operator budget and reviewed
generation change, never an automatic raise.

The [compound marketplace-ID component](parity/atomicmarket/marketplace-id.md) adds the genuine
`marketplace` record kind, bringing that declaration to **19**. Explicit old 18-kind budgets
remain unchanged and are refused alongside 16/17; explicit 19 admits. Operators need a compatible
new declaration/generation and qualified state initialization/replay, with no automatic budget raise.
The earlier integrated template/auction declaration above required 18; its old generation does not
acquire marketplace coverage by installing new code.

The [buyoffer-ID component](parity/atomicmarket/buyoffer-id.md) adds the genuine
`market-buyoffer` kind, bringing the current declaration to **20**. Explicit old 19-kind
(and smaller) budgets remain unchanged and are refused; explicit 20 admits. A new reviewed
host declaration/generation and qualified replay are required. No default is raised.
The getter requires the actual host's `original-action-authorization-v1` source capability
and declares it in `requiredSourceCapabilities`; an old host context refuses immediately.
SDK source-v2 metadata version 1 and both host/native SDK consumers must be installed and
qualified before activation. Contract data never supplies action authorization.
The bounded ordered-bundle extension keeps 20 kinds and all caller limits unchanged. Its private
link-index row shape requires a new reviewed artifact/declaration/generation and qualified replay;
earlier 20-kind rows are refused. Empty, duplicate or equal-index links remain unavailable.

The [collection-ID component](parity/atomicassets/collection-id.md) uses the existing `collection`
kind and actual scoped `authorswaps` table updates; it adds no record kind or limit default.
Pending-author changes, erase and unknown-row behavior follow the original collection processor.
Its changed executable inventory still needs normal host declaration/generation admission and
qualified state initialization/replay. Source, recovery and final query authority remain host-owned.

The existing loader still imports `plugins/<key>/build/index.js`. The same reviewed plugin
tarball contains the `legacy/package.json` and `legacy/build/index.js` used at that location.
The wrapper has its own private package identity, the same version as the contained plugin,
and an exact dependency on `@eosrio/hyperion-atomicassets-plugin`. It is not a second release.
Do not replace its manifest with a type-only or name-only package: the host inventories the
wrapper and its declared installed dependency graph before registering the projection.

From the Hyperion directory, with an absolute path to the reviewed tarball, a new empty
staging directory and a new disabled plugin directory, install the single operator package
as follows (POSIX shell example):

```sh
artifact=/absolute/path/to/reviewed/hyperion-atomicassets-plugin.tgz
stage=/absolute/path/to/empty/staging-directory
mkdir -p "$stage" plugins/atomicassets/build
tar -xzf "$artifact" -C "$stage"
cp "$stage/package/legacy/package.json" plugins/atomicassets/package.json
cp "$stage/package/legacy/build/index.js" plugins/atomicassets/build/index.js
cd plugins/atomicassets
npm install --package-lock-only --save-exact --allow-git=all "$artifact"
npm ci --allow-git=all
```

The resulting layout is `plugins/atomicassets/{package.json,package-lock.json,build/index.js,
node_modules/@eosrio/hyperion-atomicassets-plugin/...}`. npm records that same tarball in the
wrapper dependency and lock; retain it at its recorded location for repeatable `npm ci`.
Its manifest also retains the pinned SDK Git prepare-script allowance. A development tarball
does not establish a qualified release. Keep the plugin disabled until the matching host and
chain configuration are qualified; no enablement or readiness is granted by installation.
The wrapper code remains:

```js
export {default} from '@eosrio/hyperion-atomicassets-plugin';
```

No additional executable loader is introduced. The constructor exposes empty legacy action,
delta and stream handler lists: state reduction uses the host's optional
`getStatefulProjectionsV2({binding, sourceCapabilities})` path. A host lacking that v2 path cannot index this component.
Its existing `addRoutes(server, context)` path requires `context.statefulQueryHost(request)`;
missing context refuses registration. All ID endpoints use the same projection ID. The wrapper
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
The original mint-priority flush is reused. The
[chronological relationship slice](parity/atomicmarket/source-relationships.md) adds offer commit
validity and actual token/code inputs; other commit/fork effects remain open.

All original contract/action hooks are selected. An unsupported occurrence fails the affected
candidate explicitly rather than silently dropping that event. As a result, this component is
not ready to serve arbitrary production contracts. [Template state and asset enrichment](parity/atomicassets/templates.md)
are partial; templated sale and auction price enrichment, backing, mint reconciliation,
multi-asset offers/symbol-pair pricing, scope-less table domain mapping,
remaining APIs, nontext JSONB display text and schema/scalar NUL behavior remain explicit gaps.
The field-specific metadata encoder now follows the original JS boundary; see
[the JSON evidence map](parity/atomicassets/json-compatibility.md) for the still-pending physical gates. The v2 source retains
actual scope-less identities; this restricted domain adapter refuses them instead of inventing
a scope. Offer/token/code relationships now come from actual selected occurrences; no synthetic
relation rows are accepted. Native
engine success and source controls do not establish same-input PostgreSQL/view/HTTP parity.

`npm run test:package` installs this exact wrapper layout from the actual packed plugin,
then imports the wrapper, registers its compound descriptor and the ID routes. To additionally
check the real host inventory without adding Hyperion as a dependency, set
`ATOMIC_HOST_INVENTORY_ROOT` to the separately built HAPI emission root at
`c8711ee327a1522871192a36e5d1ef6d288fa0e6`. The check verifies all five transitive runtime blobs
against `tests/fixtures/packed-consumer/host-inventory-c871.json` in the source checkout
before importing the inventory function. It changes only disposable installed copies to prove
that imported domain-code changes affect the digest, and that missing identity still refuses.
An unselected cross-repository check is reported as not run. This proves installed code identity,
not actual HAPI worker attachment, source authority or physical/parity acceptance.
