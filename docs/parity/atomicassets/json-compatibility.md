# Original JSON compatibility boundaries

This is the field map for [issue #39](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/39).
Reference: AtomicAssets API 2.7.0, commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`,
with its pinned `@atomichub/atomicassets` 2.2.0 codec. No physical PostgreSQL result has been
accepted for this work. Source observations and engine-dependent behavior are separate below.

The original [encoder](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/filler/utils.ts)
calls `JSON.stringify`, then replaces literal backslash-u0000 sequences in that JSON text with
a space. It does not replace all strings before serialization. For a decoded NUL this produces
valid JSON containing a space; a decoded literal backslash-u0000 can leave an invalid JSON escape.
Both raw input and encoded text must be retained. Replacing the input with the safe fixture
would hide the very difference under test.

## Field and input map

| Field/input | Original producer/storage path | Selection/formatter path | Established observation or remaining gate |
| --- | --- | --- | --- |
| Collection `data`, including default ORIGINAL `img` containing NUL | Codec deserialize, `encodeDatabaseJson`, `jsonb` column | Full `data`; view `data->>'name'` and `data->>'img'` | Original JS encoded bytes replace the NUL with a space. Actual SQL and full original-profile replay remain physical gates. |
| Asset immutable/mutable metadata and set-data | Attribute-map conversion, encoder, `jsonb` columns | Asset formatter merges metadata and preserves resulting JSON types | Apply the original encoder at this boundary; source bytes and rejection must remain visible. No global string replacement. |
| Template immutable/mutable metadata | Codec deserialize, encoder, `jsonb` columns | Template/asset metadata precedence | Same encoder boundary, including keys and nested values; original SQL/view/HTTP comparison remains pending. |
| Actual NUL in metadata keys/values | JSON stringification emits an escape; original encoder replaces it | JSONB value and metadata joins | JS transformation is established. Key collisions after replacement must retain original serialization order and last-value behavior, with engine verification pending. |
| Literal backslash-u0000 in encoded metadata | Original regex can leave malformed JSON text | Original write fails before a new view exists | Native `JSON.parse` rejection can be observed independently. Actual PostgreSQL rejection/SQLSTATE must be captured rather than invented. |
| Missing or JSON-null collection display field | Original view uses `jsonb ->> text` | Collection/asset/sale/auction collection display | PostgreSQL documents SQL NULL for missing paths and JSON-null text extraction. Physical vector result remains pending. |
| Boolean or numeric display field | Original encoder produces JSON; PostgreSQL stores JSONB | `->>` produces text | The operator's result type is documented. Exact number/exponent formatting must be checked on the pinned engine; do not use a blanket `String(value)`. |
| Object or array display field, nested numbers/strings | Original encoder and JSONB storage | `->>` produces JSON text | Exact spacing, UTF-8 key ordering, escaping and numeric representation are unproven until the actual vector run. `JSON.stringify` output is not an observed SQL result. |
| Schema/config format elements | Original processors use `JSON.stringify` elements in `jsonb[]` columns (`collection_format`, `format`, `types`), without this encoder | JSON view construction and schema formatter | Distinct path: the element values still enter JSONB, but do not pass through the metadata encoder. NUL/escape behavior through the actual write and view remains a physical gate. |
| Scalar SQL text such as marketplace fields | Direct parameters, no metadata encoder | Scalar field returned unchanged | Distinct path. Preserve raw text and actual acceptance/rejection; a metadata NUL-to-space rule must not be applied here. |
| Native SQL numeric literal not produced by the JS encoder | Direct JSON/JSONB probe only | SQL `->>` | Keep separate from ABI/codec lifecycle evidence. A JS parse can lose lexical precision/scale and cannot stand in for the original SQL observation. |

The official PostgreSQL 16 [JSON type documentation](https://www.postgresql.org/docs/16/datatype-json.html)
describes JSON versus JSONB representation, numeric conversion and Unicode restrictions.
The [extraction operator documentation](https://www.postgresql.org/docs/16/functions-json.html)
defines text extraction and missing-path behavior. These are primary specifications, not measured
Hyperion or physical-oracle results. Tagged engine source and the pinned 16.15 reference run must
resolve exact display bytes before a formatter claims them.

## Profiles and evidence

The default remains the byte-exact `original-lifecycle` input. `portable-safe-image` is a separately
named engineering fixture; its declared `collectionData.img` substitution remains explicit.
Neither profile is rewritten, and the existing `inputsNormalized:false` descriptor must remain true.
Raw original encoder/codec output, PostgreSQL acceptance/error and SQL/view/HTTP response are
separate evidence fields. A source-only vector records physical outputs as not-run.

The existing real-reference scenario already contains original encoder NUL/literal probes and a
native JSONB numeric probe. Extend that narrow source seam and preserve the pinned PostgreSQL
16.15 image, guards, resources, lifetimes and original-profile default. Root alone owns physical
execution. Source/component packets under the old operator are not accepted physical results.

Implementation belongs in the plugin, at the original field-specific boundaries. The SDK's
generic inert JSON capture already preserves well-formed NUL and literal escapes; do not change it.
No new record kind, operator budget, backend-native query or serving authority is introduced.
Full API/physical PostgreSQL/MongoDB/WormDB parity and source/recovery/worker serving remain open.

## Implemented source slice

The private metadata boundary now applies the pinned original encoder after the original codec
for collection data, asset immutable/mutable metadata, set-data, and template immutable/mutable
metadata. Raw NUL is accepted only within those action metadata fields before conversion; the
remaining action envelope, schema fields, scalar values and stored-record checks retain their
existing refusal policy. Literal backslash-u0000 that produces malformed JSON refuses the whole
staged candidate, including earlier writes. Unpaired Unicode surrogates, malformed records,
accessors, unsupported attribute variants and non-finite values remain unavailable.

The 21 independent inputs in `harness/atomicassets/json-vectors.cjs` cover nested objects/arrays,
numbers, null/missing values, Unicode, both key-collision orders, actual NUL and literal escapes.
The source child invokes the actual 2.7.0 encoder and unchanged codec, and reports native JSON
syntax/value conversion separately from `postgres: not-run`. Both original and explicitly safe
profiles are retained with their original raw pins and declared difference. Their older
`codecExceptions` descriptor remains historical evidence; this source implementation does not
upgrade it into physical qualification.

The existing real-reference PostgreSQL scenario additionally records each vector's original
encoded text, actual JSONB value/text and `->>` display selections or actual error. These new
probes are pending execution under the original guards and budgets; the unchanged three older
codec probes and direct native numeric probe remain separate. No SQL output, key order, numeric
text or error code is prefilled. Nontext collection display selections still refuse in portable
reads until the pinned-engine result establishes their exact representation. This is a partial
implementation of issue #39; the physical PostgreSQL/view/HTTP and nontext formatter gates remain
open. Historical safe-profile fixtures and failing reports are not rewritten.

The installed hook inventory changes with this encoder module. The host must bind the actual
new executable inventory in a new declaration/generation as required by its normal activation
rules; an old declaration is not silently relabeled. This encoder adds no record kind. The current
combined marketplace declaration requires 19; old explicit 18-kind limits remain 18 and are refused.
Operator limits are never silently raised. Rebuild state projections separately from retained history.
