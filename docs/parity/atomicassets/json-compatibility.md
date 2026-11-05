# Original JSON storage and display boundaries

This is the field map and bounded implementation record for [issue #39](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/39).
The reference remains AtomicAssets API 2.7.0, commit
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`, with its pinned `@atomichub/atomicassets` 2.2.0 codec.
This component is not a full AtomicAssets/AtomicMarket parity qualification.

## Original field boundaries

The original [encoder](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/filler/utils.ts)
calls `JSON.stringify`, then replaces literal backslash-u0000 sequences in that serialized text
with a space. It does not replace strings before serialization. A decoded NUL becomes a space;
a decoded literal backslash-u0000 can instead leave invalid JSON. Raw input and encoded text
remain separate evidence. A portable-safe fixture must never replace the original default.

| Input/field | Original boundary | Plugin behavior and remaining scope |
| --- | --- | --- |
| Collection data and asset/template immutable/mutable metadata | Codec or attribute-map conversion, original encoder, JSONB storage | Apply the original encoder only here. NUL keys/values and key collisions retain original serialization/last-value behavior. |
| Literal backslash-u0000 and unpaired surrogates in metadata | Actual original JSONB write refuses | Refuse unsupported candidate metadata; never manufacture a successful empty value or a database SQLSTATE. |
| Collection display name/img/images in collection, asset, template, schema and market joins | JSONB text extraction (`->>`) | One private backend-neutral `jsonbText` helper handles missing/null, text, booleans, numbers, objects and arrays. Collection-ID retains only its original name/img fields. |
| Schema/config JSON-array elements | JSON stringification into JSONB array elements without metadata encoder | Keep this separate storage boundary and existing guards. A metadata NUL-to-space rule does not apply. |
| Scalar SQL text | Direct scalar parameter without metadata encoder | Keep existing scalar validation; display conversion never rewrites scalar values. |
| Native SQL numeric literals | JSON/JSONB numeric parsing without the JS encoder | Preserve raw lexical precision/scale in separate evidence. A parsed JavaScript Number cannot recover it. |

The [PostgreSQL 16 JSON specification](https://www.postgresql.org/docs/16/datatype-json.html) and
[extraction operators](https://www.postgresql.org/docs/16/functions-json.html) explain the
boundaries. Measured outputs below establish the selected bytes; documentation alone is not
physical qualification.

## Accepted bounded original capture

[Workflow run 41958628616](https://github.com/eosrio/hyperion-atomicassets-plugin/actions/runs/41958628616)
executed the actual pinned original initializer, processors, PostgreSQL 16.15 views and HTTP
server for original-lifecycle and portable-safe-image on both Node majors. Capture source
`f13815acfa32d3a732b4722e4d2ad584bd15f617`, tree `38432c47533471c062c8414f08a611bad110572c`,
was merged as `92e57c492976dab46af45bd014f234e7dff8b1fe` with the same tree.

Each of the four runs used the same 21 independent original vectors and three named field
rotations: 63 cases, not 252 independent inputs. Each recorded 51 accepted JSONB writes with
collection/asset HTTP 200 results and 12 actual SQLSTATE 22P02 refusals with the baseline
unchanged. Three additional native SQL numeric probes remain separately labeled. Every vector
restore, acquired scenario closer and outer connection closer reported success, and the CI
container-stop steps succeeded. Those observations do not establish independent retirement of
every possible resource or qualify a plugin backend.

The checked-in [compact measured fixture](../../../tests/fixtures/jsonb-display-pg16.json)
retains raw serialized input, negative-zero paths, original encoded bytes/hash, exact SQL text,
storage output, selected original view/HTTP fields, rejection evidence and all four raw-report
hashes/runtime versions. Its fixed hash and input-plan checks prevent replacing the captured
expectations with renderer-produced answers. The full source reports remain the workflow
artifacts named by that fixture.

The default profile remains byte-exact original-lifecycle, including `image\0hash` before the
encoder. Portable-safe-image remains separately named with its declared single image
substitution. Neither input profile nor its historical unresolved codec-exception descriptor was
rewritten or relabeled by this capture.

## Portable display implementation and controls

Seven former text-only selection sites now use the same private helper already used by the
indexed schema reader: collection-ID, asset light view, template-ID, schema-ID, sale light view,
auction light view and buyoffer light view. They keep their existing caller-owned coherent
reader and response shape. No adapter-native query, SDK interface, record kind, budget,
operator default or executable-update behavior changes.

`jsonbText` renders JSONB object keys by UTF-8 byte length then binary comparison, uses the
measured comma/colon spacing, and expands exponent notation for finite numbers originating at
the original JS encoder boundary. Strings use JSON escaping inside composites and remain
unquoted at the scalar extraction boundary. Missing paths and JSON null return null. This is
not `JSON.stringify` formatting of composites and is not a native SQL numeric-lexeme codec.
For example, native SQL can retain `9007199254740993` and `1.2300`; conversion after parsing them
as Number cannot claim either original precision or scale.

[Pure emitted-code controls](../../../tests/jsonb-display.test.mjs) compare all 51 successful
vectors through the seven actual read exports against independently captured SQL strings;
collection and asset expectations also match their captured view/HTTP fields. Template,
schema and market endpoint-specific physical responses were not captured by this program.
The 12 refused inputs exercise the metadata conversion refusal, not a new physical plugin
transaction or a fabricated plugin SQL error. Additional controls retain accessor/cycle,
non-finite/unsupported-value and scalar/NUL refusal boundaries. The actual combined factory
processes the unchanged default ORIGINAL codec input through its real callback reducer into a
finite in-memory port. This is not an SDK-managed staging, cache, recovery or serving test.

The ordinary Node 24/26 test discovery selects these controls, and the existing package check
now selects them against its installed tarball. Those CI/package executions for this patch remain
pending. Local Windows validation is restricted to pure finite callbacks,
source checks, checker and artifact emission. Full native reference/package CI, physical
MongoDB/WormDB execution, arbitrary scalar/schema encoding families, API/history/socket
coverage, source/recovery/worker serving and full 2.7 parity remain separate gates.

The existing stored-record guard still refuses NUL/literal-u0000 before AA read assembly.
The new helper does not weaken that guard. It rejects unpaired surrogates when selected by AM
joins; those are refused by the captured original JSONB storage boundary rather than supported
existing database state. The helper alone may represent a literal backslash-u0000 string, but
this does not authorize bypassing the original metadata encoder or importing arbitrary native
SQL state.

Executable artifact identity changes require the normal new declaration/generation and
operator activation; an old hook declaration is not silently relabeled. Initialize/rebuild
state projections separately from retained Elasticsearch history.
