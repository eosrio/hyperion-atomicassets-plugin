# Combined Atomic component through the opt-in stateful path

Owning work: [asset lifecycle #10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10),
the merged fixed-sale component from #16/#18, and the still-open [full parity #1](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1).
This is qualification source, outside public package exports and production workers. The installed
SDK dependency remains8d37e932. An explicitly selected component root supplies the separately pinned
SDKb64bac47 and native MongoDB adaptere4a46cfa. No dependency or public interface is upgraded.

`harness/stateful/bridge.mjs` invokes the real emitted asset and fixed-sale reducers through
`executeStatefulBlock`. The SDK owns ordered local staging, candidate capture/custody, native apply,
replay and incomplete recovery. The adapter alone owns MongoDB operations. Asset priorities10/20/50/60
and mint completion precede sale priorities1020/1040 in this combined atomic fixture projection.
This is an explicit fixture grouping, not a new global production commit barrier.

Asset and sale assemblers read current relationships through one `composeStatefulRead` view.
Only structured light rows enter the SDK response. The unchanged original-compatible formatters
then run synchronously at the HTTP JSON boundary: optional undefined properties are omitted there,
as in the reference response. Stored metadata is never normalized this way. Serialized UTF8 bytes
are bounded and the original guard is checked immediately before accepting the result. No HTTP
route, serving metadata/header contract or source authority is implemented by this helper.

## Inputs and expected values

`scenario.mjs` reuses the pinned2.7.0 domain cases already in the repository. It explicitly rebases
the constructed chronology to blocks1+ for empty-genesis initialization. Tests compare the complete
asset response's canonical JSON bytes to the original-derived expected response after only named
block-height fields are rebased. The safe collection-image substitution is inherited from the
asset tracer and remains different from the original NUL-containing PostgreSQL input. NUL and
literal-backslash exception controls still refuse; this is not a new same-input PostgreSQL comparison.

Raw occurrences are explicit UTF8 JSON engineering envelopes with matching hashes/data, ABI epochs
and source-evidence digests. They are not deployed Wire ABI payloads or canonical chain evidence.
The source-derived version1.2.2 configuration is retained as a logical market-config record.
Offer/token/offer-asset relationships use clearly named `engineering.relations` inputs through the
same SDK staging/custody path. They are not implementations of missing production relationship
reducers. Empty-genesis initialization is an engineering assumption, not proof of absent historical
templates/backing/bridge/original-mint data on a real chain.

The scenario retains the prior native fixture's262144-byte candidate/envelope/response budget,
record traversal limits,16 mutations and32 read attempts. It declares the needed18 source selectors,
15 logical kinds,64 input occurrences and32 composed-response records explicitly. These are private
qualification bounds, not a new operator default or performance measurement. Real engine execution
must still bind original fixture timeouts, resources, physical identity, custody and cleanup guards.

## Run and evidence boundary

Build the plugin normally, then select the exact pinned component root:

```
ATOMIC_STATEFUL_COMPONENT_ROOT=/absolute/reviewed/backend-mongodb node --test tests/atomic-stateful-bridge.test.mjs
```

The component pins cover the actual emitted SDK/native-adapter files and controlled driver fixture
used by these tests. Missing opt-in leaves semantic cases explicitly skipped; it is not engine
qualification. The package check also runs the same host against dist files from an actual npm
tarball while keeping the qualification host outside the distributed package.
The host uses a second by-value SDK namespace with identical pinned bytes; the adapter-local SDK
explicitly refuses the foreign host handle until its normal adapter recapture boundary.

Controls exercise combined mint/setdata, owner predicates, sale lifecycle, burn retention, coherent
current joins, pending candidate recovery using new host/adapter objects, fork undo/replacement,
stale/coincident views, cancellation and malformed/NUL input. The native adapter caller executes
against its controlled driver fixture. A failure-before-commit or fresh object is not a real MongoDB
transaction failure, transport uncertainty, database crash or fresh application process. Those
remain root-operated engine work; no engine result is claimed in this source slice.

## Remaining acceptance

Real MongoDB/Node24+26 execution of these domain inputs, separately inspected physical rows/undo,
real failpoint abort/restart, same-input original PostgreSQL/HTTP comparison, production source/ABI
admission and completeness, canonical fork authority, contract-error serving policy, headers/routes,
full sale asset enrichment, templates/backing/bridge/mint reconciliation, pagination/list/stat/log/
socket families, and full AtomicAssets/AtomicMarket parity remain open. This component closes none
of those release gates or #10/#1.
