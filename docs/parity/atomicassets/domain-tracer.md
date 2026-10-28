# Internal untemplated asset domain tracer

This is the domain-only slice of [issue #10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10).
It does not close #10 or the full [parity requirement](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/1).
[SDK #32](https://github.com/eosrio/hyperion-sdk/issues/32) and
[History API #366](https://github.com/eosrio/hyperion-history-api/issues/366) remain integration prerequisites.
No public export, route, activation metadata, SDK pin, package version or dependency changes accompany it.
The existing AtomicMarket formatter is unchanged.

## Domain behavior

`src/atomicassets/internal/lifecycle.ts` reduces normalized, constructed row/action occurrences through
an intentionally private structural read/stage port. Config provides the collection decoder format;
collection/schema records remain separate from asset and immutable mint facts. Config version/token
indexing, transfers history and notifications are not implemented by this component.

Jobs retain original priorities 10 (config), 20 (collection/schema), 50 (mint), and 60 (updates).
Equal priorities retain insertion order. Mint-buffer completion precedes priority-60 updates and
also runs when mint is the last priority. Same-block mutable data replaces the previous object.
Runtime dispatch requires primitive string table/action names and validates them separately;
coercible arrays and names from the other kind refuse the entire candidate. Only explicit
`logburnasset` occurrences enter burn handling.
Wrong-owner transfers leave asset state unchanged. Burn retains the asset with null owner and
burn/update chronology; immutable mint/earlier transfer chronology remains separate. Collection and
schema replacement preserves creation fields. Later relationship-only changes affect current read
responses without changing earlier asset timestamps or storing a mint-time formatted response.

The fixed assembler reads the asset and required collection/schema through one caller-owned coherent
view, constructs the restricted original SQL light shape, then invokes the existing asset formatter.
A covered-absent asset returns null. Unknown coverage and missing required relationships throw
`AssetDomainUnavailable`; this is an internal result and declares no HTTP status contract.
Template links, backed tokens and original-mint links must each have explicit covered absence.
A present relationship is unsupported here. This is a fixed domain join, not a generic query engine.
The selected collection name/img/images fields support text/null/missing only; other selected JSON
shapes refuse rather than guess PostgreSQL JSON-to-text casting. Other metadata stays structured.

The supplied block context requires canonical decimal block/time and a block ID. Each occurrence
requires an occurrence identifier and ABI deployment/hash; schema writes and mint/setdata require
the applicable format digest. The reducer checks the supplied binding against the staged schema.
These inputs are evidence requirements, not certification that a caller has authentic chain source.
Snapshot rows cannot invent creation/mint/transfer/burn times. Inputs and output rows are detached.

The caller supplies the existing pinned AtomicAssets 2.2.0 codec, whose retained code hash is checked
by the tests. This tracer supports string (including explicit null), exact signed/unsigned 64-bit
scalar/vector strings, and the original float scalar/vector variants. Other attribute variants and
numeric 64-bit inputs are explicitly unsupported. It retains codec float rounding/string fallbacks
and JSON's negative-zero representation. The unresolved original NUL/literal-escape conversion
policy is a refusal boundary, not normalization. Original failing controls remain unchanged.

## Caller ownership

`lifecycle-port.ts` is private and adaptable to the forthcoming SDK processing view. The SDK must
own declaration/backend/generation/recovery identity, predecessor checkpoint, bounded staging,
before-images, retries, fences before/after awaits, coherent reads and commit/abort. Its staged puts
and deletes must shadow base reads in order. On any throw the caller discards **all** staged effects;
this function performs no native writes or commit. There is no plugin-owned recovery system.
Generic staging and input/resource bounds remain caller obligations; this finite engineering fixture
does not qualify an unbounded production workload or establish SDK bounds.

Tests use a local callback storage fixture to demonstrate these domain rules. That fixture is not
physical MongoDB, SDK conformance, concurrency, durability, restart, uncertain-commit or fork recovery
qualification. Read-fence errors propagate without a partial formatted result.

## Differential evidence and reproduction

The [sanitized fixture](../../../fixtures/harness/atomicassets/domain/expected.json) selects domain
rows, SQL light-view rows and formatted response data from seven closed original PostgreSQL stages.
The [provenance](../../../fixtures/harness/atomicassets/domain/provenance.json) pins the complete
private archive, exact native Node 24/26 reports, original source/codec manifest and derived bytes.
Both original reports agree on every selected expected value. Neither report claims full qualification.
Runtime credentials, logs, HTTP headers and whole reports are excluded.

The original input's `collectionData.img` contains NUL; its legacy stored value is `image hash`.
The successful tracer fixture deliberately starts with that safe space-containing value. Thus its
inputs differ from the original physical PG run: **no new same-input physical PG comparison occurred**.

The portable tracer now reads the full named `portable-safe-image` input through
the same pinned loader used by the original PostgreSQL/view/HTTP harness. That
driver requires an explicit `--input-profile portable-safe-image` selection; its
default NUL-bearing original input is unchanged. The new raw fixture differs
from the original at exactly the declared image field, retains all codec probes,
and reports both digests and the unresolved conversion exception. This removes
the need to edit frozen fixtures before a later same-input run. It does not
replace the existing expected fixture or establish a new physical comparison.
The seven output comparisons cover the supported subset. A local control also invokes the unmodified
original collection callback/codec on that safe input and the original formatter on all seven views.
Git blobs and installed codec hashes are checked; Windows Git checkout newline differences are
recognized explicitly. NUL/literal-escape tracer refusals and original failing controls remain separate.

The derivation script reads only the two exact report members from the pinned private archive and
writes only the allowlisted constructed data/provenance. Intentional derivation uses:

```sh
python scripts/capture-asset-domain-fixture.py --archive PRIVATE_ARCHIVE --output fixtures/harness/atomicassets/domain
```

Normal tests never regenerate expected values. With the exact installed `AA_REFERENCE_ROOT` set:

```sh
npm ci --allow-git=all
bun check -p tsconfig.json
npm run build
node --test tests/asset-lifecycle.test.mjs
npm test
npm run test:package
npm run check:docs
```

Run native Node 24 and 26. The package checker installs its own tarball, verifies unchanged public
exports/dependencies, reruns the internal domain controls against its installed private emitted files,
and checks the installed declarations. The private file check does not make a supported subpath.
Complete physical MongoDB lifecycle, source admission, SDK/HAPI integration, template/backing/bridge,
marketplace lifecycle, endpoint families and full AtomicAssets/AtomicMarket parity remain open.
