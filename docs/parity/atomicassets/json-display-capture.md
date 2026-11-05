# Original PostgreSQL display capture candidate (#39)

This source-only candidate is for explicit root-reviewed Linux CI execution. The manual
`json-display-oracle.yml` workflow does not trigger from a pull request or push. No physical
result is supplied here. It reuses the original pinned AtomicAssets2.7.0 source/codec/locked
installation, PostgreSQL16.15 image, 2CPU/1GiB limits, empty-database admission and original
schema initializer. It never imports the destructive original init-test-db CLI.

Each Node24/26 and `original-lifecycle`/`portable-safe-image` combination owns a fresh CI
service. The byte-exact profiles stay distinct. The original processors seed the mint and
dependencies; no source-authority claim follows from these constructed inputs. Then the
capture observes the21 unchanged JSON vectors and separately labeled rotations of the top
level name/img/images keys (63 cases). Rotations are additional test inputs, not normalized
original values. Negative-zero paths are retained because raw JSON itself writes negative
zero as zero. Both NUL/literal exceptions and unpaired-surrogate outcomes remain measured.

For every case retain raw input, actual original encoder text/bytes/hash, actual JSON/JSONB
text and SQLSTATE, unencoded JSONB-array and unencoded scalar-text outcomes. These latter
probes are boundary observations, not complete schema/config route qualification. A committed
metadata update is observed through the original collection/asset SQL views and original
HTTP routes; full raw JSON text, HTTP bytes/hash/status/headers remain evidence. No guessed
PostgreSQL text or formatter helper is introduced. Driver-decoded numeric objects are never
used as exact lexical numeric evidence: retained PostgreSQL/HTTP text is authoritative.
Three separately labeled raw SQL numeric literals cover an integer above2^53, lexical scale/
negative zero, exponents and the numeric-range rejection boundary. They never pass through
the JS encoder and their actual acceptance/SQLSTATE is discovered, not prefilled.

Each case restores and verifies the original stored data, including on HTTP failure. A failed
write must leave the baseline unchanged and produces no fabricated input-specific HTTP view.
All original listener/HTTP/SQL closers are attempted; the first failure is retained separately
from cleanup failures. The existing180-second child,30-second SQL,10-second HTTP,2MiB body,
2048-event and8MiB report bounds remain. A deadline records failure/incomplete cleanup; there
is no retry, budget increase or optimistic cleanup claim. CI owns physical service retirement;
report completion verifies explicit connection cleanup, not container deletion.

Root must review source and independently audit actual reports/terminal CI teardown before
adopting measured cases into a backend-neutral display helper. Whole-lifecycle replay, native
MongoDB/WormDB, real factory/coherent routes/cache/recovery, template/schema/market propagation
and full2.7 API parity remain open. HAPI440 schema/royalty work is separate.
