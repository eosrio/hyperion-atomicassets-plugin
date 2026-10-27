# Original PostgreSQL oracle for one untemplated asset

This is the source-pinned plan for [issue #10](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/10),
against AtomicAssets API 2.7.0, commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.
The [source manifest](postgres-oracle-sources.json) records exact Git blobs and SHA256 values.
No PostgreSQL engine was started. The source-only harness now pins an official PostgreSQL 16
Linux/amd64 image from primary registry inspection; its server version remains unobserved. This does not implement or
qualify Hyperion projections, backend adapters, SDK stateful interfaces or full parity.

## Engine and ownership admission

The original [compose declaration](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/docker-compose.yml#L14)
uses `postgres:16-alpine`; its [CI matrix](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/.github/workflows/ci.yaml#L58)
covers PostgreSQL 14, 15, 16, 17 and 18. These are mutable tags, not immutable qualification pins.
The [fixture pin](../../../harness/atomicassets/postgres/fixture-pin.json) selects an immutable
Linux/amd64 digest whose registry configuration reports PostgreSQL 16.15. Registry metadata is
not an observed running server. Root must review the pin, resources, deadlines and exact owning
Docker daemon receipt before future execution. PostgreSQL 16 is the
existing compose starting point; this plan does not promise the whole CI version matrix.

The fixture must be a fresh exclusively owned container/database, with a new run identity, exact
container/image/label/volume/daemon/socket identities and loopback-only published port. The program
must derive its database name and endpoint from that owned receipt, refuse arbitrary URLs and
production/fallback configuration, and verify the database/schema are empty before setup. Root
serializes this with other server qualification. Preserve original source/dependencies read-only.
Use bounded native Node24/26 children, SQL/HTTP/output limits and explicit PID/exit/reap ownership.
Capture failed outcomes, disconnect clients and close HTTP before final custody. Final cleanup
requires independent absence of owned containers/volumes and restoration of the initial baseline;
a passing query is not cleanup evidence. Unknown or still-writing processes cannot seal custody.

## Use the original schema path

Do not invoke the original [init-test-db CLI](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/bin/init-test-db.ts):
its local fallback reads operator configuration and drops/recreates a database. Its existing
configuration-free CI initialization algorithm is a useful source seam after owned-empty-DB
admission, without that CLI or any fallback.

1. Construct original `PostgresConnection` with the exact owned host/port/user/database and explicit
   local SSL policy; call original `initBaseTables(connection)`.
2. Follow the original test-init setup order: `atomicassets`, `delphioracle`, `atomicmarket`,
   `atomicpacksx`, `atomicdropsx`, `simpleassets`; call each original handler's `setup(client)` in
   the original setup transaction. This is the already-defined dependency closure. An AA-only
   reduction remains unqualified until every migration/view dependency is proved.
3. Sort original `definitions/migrations` with original `compareVersionString`. For each version,
   execute original `database.sql`, each selected handler SQL and `handler.upgrade(client, version)`
   in the original order, then commit. Apply original deferred SQL outside the transaction as the
   original test initializer does on empty tables, preserving its explicit `CONCURRENTLY` removal.
   Record every original SQL file/hash and actual executed SQL hash; do not invent simplified DDL.
4. Verify the resulting actual `atomicassets_assets_master` definition and required constraints.
   `AtomicAssetsHandler.setup` initially installs `pre-original-mint`; upgrade `2.0.13` installs the
   current view joining `atomicassets_original_mints`. Omitting migrations would test another API.

The original [test helper](https://github.com/atomicassets/atomicassets-api/blob/0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e/src/filler/handlers/test-helper.ts#L58)
already wraps a real `pg.Client` for original `ContractDBTransaction`; `createTestTransaction`
sets `inTransaction` because its caller owns `BEGIN`. Its default omits reversible-query bookkeeping.
Use this exact independent baseline seam and declare that omission; it does not qualify production
fork/restart recovery. Commit each positive block before reading through a separate actual API
connection, so deferred foreign-key checks and visibility are exercised. Do not answer queries from
the scripted transaction implementation or manufacture view rows.

## Original lifecycle and serving calls

Load the original `DataProcessor(ProcessingState.HEAD, moduleLoader)` and original
`configProcessor`, `collectionProcessor`, `schemaProcessor` and `assetProcessor`.
The no-op module filter and recording notifier are existing test seams, not domain replacements.
Feed each input through `processContractRow`/`processActionTrace`, then original `executeHeadQueue`.
Record queued and executed order and release all listeners. Original priorities are config10,
collections/schemas20, templates40, mint50 and updates60. Equal priorities retain original input
index order. The priority50 completion callback flushes asset/mint inserts before updates60;
queueing `logsetdata` before `logmint` must not bypass that original ordering.

Use asset ID **`9007199254740993`** as an exact decimal string, template `-1` producing SQL null,
and a real config/collection/schema supplied through their original processors. The asset ID fits
the original signed `bigint` column. The scripted fixture's separate max-uint64 asset ID does not;
do not import that row into PostgreSQL and disguise a range error as parity. Exact uint64 strings
inside JSON metadata remain a different boundary.

| Step | Required independent physical/view/HTTP evidence |
| --- | --- |
| Dependencies plus mint, with same-block update queued first | Original priority/flush order; one committed asset/mint; replacement mutable data removes missing old keys; creation block/time remain mint values. |
| Wrong-owner then right-owner transfers | Original SQL predicate applies no asset update for the wrong owner, then updates the right owner. Do not suppress the original transfer/history/notification side effects merely because an asset update matched zero rows. |
| Collection/schema/media relationship update after mint | Asset storage unchanged, while a fresh real view and HTTP read reflect current joined relationship fields. Preserve collection/schema creation metadata. |
| Burn | Row remains present with null owner and original burn actor/time; original mint/creation remain. Read the committed row through the same original view/HTTP route. |
| Invalid/missing relationship controls | Preserve original processor errors and deferred FK failures. Actual view requires collection/schema inner joins; mint callback success alone does not prove a serveable asset. |

Construct the original `HTTPServer`, `AtomicAssetsNamespace`, router, response wrapper and
`AssetApi` lookup, with Redis cache disabled and only chain-health RPC explicitly stubbed as in the
existing reference harness. Route `/atomicassets/v1/assets/9007199254740993` must execute its original
SQL against real PostgreSQL, not a SQL-response script. Compare independent physical tables, actual
view row and original HTTP data after each committed step. Retain raw clocks/headers; deterministic
comparison may exclude only documented environment-dependent clock fields.

The view joins current collections/schemas, left-joins templates/original-mint, builds nested JSON,
casts nested identity/time fields to text and computes backed tokens. The original formatter then
merges mutable/immutable layers and removes routing keys. No formatted mint snapshot may substitute
for this changing relationship view. Preserve actual driver types, arrays, fractions, nulls and
missing-key distinctions. Arbitrary nested/null JSON metadata not produced by supported original
contract codecs may be measured as separate native JSONB/type probes, never seeded asset-state
evidence or a claim that those values came from a mint.

## Preserve the codec frontier

Retain the original locked `@atomichub/atomicassets@2.2.0` scalar/vector integer and float cases,
exact decimal strings and negative-zero observations. The original `encodeDatabaseJson` replaces
serialized NUL escapes with a space; a literal backslash-u0000 can yield invalid JSON. Run these as
isolated expected boundary/failure controls with raw converted/encoded values, PostgreSQL outcomes
and rollback/savepoint evidence. Do not repair the JSON, remove the cases or choose a replacement
policy. A native PostgreSQL normalization/error is an observed original baseline, not resolution of
the open SDK/projection codec policy.

The [source-only runner](postgres-oracle-harness.md) implements the original real-PG transaction,
migration and HTTP paths behind strict owned-empty admission. It creates or removes no Docker
resources. Root supplies the future exclusively owned fixture and remains responsible for final
independent physical cleanup and custody. Socket-free native controls validate admission, original
source loading and query transport; they never produce PostgreSQL oracle outputs. Actual Node 24/26
engine runs, independent review and cleanup remain required before this oracle is qualified.
