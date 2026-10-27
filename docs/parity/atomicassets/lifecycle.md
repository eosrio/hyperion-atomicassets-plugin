# Original asset lifecycle and metadata controls

Issue [#8](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/8) establishes controls for
the future reducer/read interface. It implements no reducer, source-ingestion host, SDK contract,
native query, API route or engine integration. Full single-asset and AA/Market parity remain open.

The harness imports the actual `DataProcessor`, `configProcessor`, `collectionProcessor`,
`schemaProcessor`, `templateProcessor` and `assetProcessor` from approved AtomicAssets API 2.7.0,
commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. It executes their original registered callbacks
through `processContractRow`, `processActionTrace` and `executeHeadQueue`; it does not reproduce
their sorting, mint buffer or metadata conversion in a replacement implementation. The reference
keeps its own installed compiler and locked `@atomichub/atomicassets` 2.2.0 dependency.

[Provenance](../../../fixtures/harness/atomicassets/lifecycle/provenance.json) pins 15 original
Git blobs, including the processors, scheduler, helpers, actual SQL view, package and dependency
lock and licenses, plus five installed codec/license files. Exact originals live beside that manifest under `original/`.
Every execution verifies them against the reference commit and installed helper hashes. The
approved tag, clean tracked checkout and package version are also checked by the shared harness.
These are licensed upstream reference fixtures; the API notice/license are in `harness/shared/`,
and the retained codec carries its own LICENSE/NOTICE and bundled Apache license. Original blobs
have a byte-preserving Git attribute so Windows line-ending conversion cannot change their hashes.

The checked-in [expected capture](../../../fixtures/harness/atomicassets/lifecycle/expected.json)
comes from those original callbacks and helpers. Tests compare the entire capture, including
constructed inputs, original write/query arguments, notifications, scripted effects, errors and
registered priorities. They do not compare against a proposed reducer or a hand-built API response.
The normal test command never rewrites the capture.

## What the boundary measures

The constructed events are small, fixed and explicitly not chain captures. IDs and integer amounts
larger than 2^53 remain decimal strings. Input block identity/time and transaction bytes travel
through the actual callbacks; the controls retain original lifecycle timestamps and block numbers.

The transaction boundary permits only the explicit query strings and update predicates used by
these processors, at most 128 calls, eight rows per write and 16 rows per table. It records original
arguments and supplies bounded rows from prior scripted effects. Its schema lookup explicitly
decodes the earlier schema write's JSON strings into the array shape the reference expects.
That conversion is a script assumption, not measured PostgreSQL json[] parsing. Owner filtering,
replacement preservation and row counts are likewise scripted effects; the original predicate,
preservation arguments and callback ordering are the actual observed oracle. Any unexpected query
or predicate fails the fixture. Notification and module-allow checks are controlled, with no network.

No transaction begin/commit/rollback, constraints, SQL execution, MVCC, atomicity, durability,
fork recovery or database type casting is exercised. Earlier scripted effects are retained on an
original error to expose the executed prefix; this is not a claim about real transaction rollback.
The raw record is not an assembled PostgreSQL/API row. A Buffer copied into scripted state becomes
a typed byte array; original callback arguments retain the original Buffer JSON representation.

| Original control | Observed discriminator |
| --- | --- |
| Same-block dependency sorting | Config at priority 10, collection/schema at 20 and template at 40 execute before mint at 50 and updates at 60, despite deliberately reversed input groups. |
| Mint priority completion | Original buffered asset/mint inserts occur before an update that was queued before mint. Untemplated `-1` becomes null; exact asset IDs remain strings. |
| Equal-priority order | `templates2` queued before a new template updates zero scripted rows; the later insert has no invented mutable data. Sorting does not repair equal-priority source order. |
| Mutable data | `logsetdata` replaces the mutable object; removed fields do not survive the original update arguments. Immutable asset data remains separate. |
| Transfer | Original update predicate includes `owner = $3`; a wrong owner selects zero scripted rows, a matching owner updates the asset. Empty transfer emits its original notification without transfer writes. |
| Burn | Original update retains the asset and sets owner null, burner and burn/update fields. Mint/transfer fields remain distinct. |
| Backing | Two original backing callbacks read/add the decimal amounts to `18014398509481986` using exact integer arithmetic. |
| Relationships | Collection/schema creation fields are preserved; schema media descriptors change separately. Existing template immutable data remains unchanged, `templates2` clearing writes null and template deletion is soft. |
| Missing source | Template and mutable-template creation reject a missing schema. Unknown-template deletion inserts no placeholder. Collection/schema deletion is rejected. |
| Mint frontier | Original mint does not read required relationship rows. Its scripted insert succeeds in their absence; this is explicitly not FK or serving-completeness evidence. |

## Locked codec and NUL observations

Original `convertAttributeMapToObject` controls cover int64/uint64 scalar and vector decimal
strings, both attribute-map entry forms, duplicate keys, float32 rounding, float64, vectors,
negative zero, and strings that overflow/underflow or are not finite. Original serialization and
deserialization capture exact hex bytes and resulting leaf types for collection/template schema
data and scalar/vector integers/floats. Collection/template processors consume actual serialized
bytes and schema/config dependencies, not already decoded replacement metadata.

The original float helper retains values such as `"1e-60"`, `"3.4028236e38"`, `"1e400"` and `"NaN"`
as strings when it cannot safely coerce them. Signed zero survives the helper, but ordinary JSON
normalizes it to zero, so the capture separately records `Object.is(value, -0)`.

Original `encodeDatabaseJson` replaces a JSON `\u0000` escape with a space. Actual NUL characters
therefore change at that boundary. A literal backslash followed by `u0000` is also matched by the
global replacement: this control produces an invalid JSON escape (`"a\ b"`). The captured raw
string and the original error boundary are retained; the fixture does not repair it or claim a
real PostgreSQL insert would accept it. A future portable normalization design must explicitly
resolve that baseline behavior rather than silently turn these controls into a support claim.

## Actual light relationship shapes

The retained `definitions/views/atomicassets_assets_master.sql` is the source of these shapes:

| Relationship | Selected light fields |
| --- | --- |
| Collection, required inner join | `collection_name`, selected `data ->>` name/img/images text, author, allow_notify, authorized_accounts, notify_accounts, market_fee, creation block/time cast to text. Arbitrary collection metadata is not copied. |
| Schema, required inner join | schema_name, format, types, creation block/time cast to text. It has no nested standalone-schema collection object. |
| Template, optional left join | template_id, max/issued supply as text, transfer/burn flags, immutable/mutable data, creation/deletion block/time as text; null when no template joins. |
| Backing | Array of matching token contract, symbol, precision and backing amount; token definitions are a separate relationship. |
| Original mint | Optional original-mint link from a separate left join. The view also coalesces unreconciled template_mint to zero. |

These controls keep relationship records separate. They do not execute the view or establish its
casts, joins, JSON/text semantics, row existence, reconciliation, snapshot consistency or
relationship-only response updates. The merged formatter still expects an already assembled row.

## Reproduction and remaining work

Prepare the exact reference and its committed dependency lock as documented in the repository
README. Set `AA_REFERENCE_ROOT` to that checkout, then run:

```sh
node --test tests/original-asset-controls.test.mjs
node harness/atomicassets/capture-original-controls.mjs out/original-controls
```

The second command retains complete result/provenance, relative loaded-source hashes and merged
original logs in the selected ignored output directory. It does not regenerate expected outputs.
The capture tool accepts an explicit `--write-golden` only for intentional source-oracle refresh;
moving the reference baseline still requires an architecture decision and requalification.

Normal native Node 24/26 `npm test`, complete-project `npm run typecheck`, normal build and installed
packed-consumer checks continue to apply. The packed production exports are unchanged and do not
depend on this fixture or a reference checkout. Structured reducer/read contracts, actual engine
execution, coherent read assembly, initialization, exact replay/restart, rollback, logs/lists/sockets
and complete AA/Market qualification follow separately.
