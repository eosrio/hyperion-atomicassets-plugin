# Contextual marketplace indexing: engineering slice

[Issue #6](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/6) remains open until the
remaining actual Node host-process restart cell passes. The earlier complete owned MongoDB program
passed on native Node24.19.0 and26.4.0; that program restarted MongoDB and reconstructed a runtime in
the same Node process. This adds the plugin-owned declarative factory and a source/runtime/read
component path. It provides no production activation, compatible plugin release or complete parity claim.

`@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace-indexing` exports
`createMarketplaceDefinition({id, mappingRevision, marketContract, abiDeployment, abiSha256})`.
It returns the SDK's separately negotiated contextual recovery definition, without loading a host
or a database. Callers must supply the exact ABI deployment and mapping revision. Contract and
original block/time come from host context, while name/creator come from decoded row members.
Creation fields are exact decimal strings and preserved during replacement. Absent rows require
an incomplete projection, matching the original processor's refusal to delete a marketplace.
Unknown/executable/snapshot options are rejected. The factory does not grant source or serving authority.

The existing `readMarketplace` and its 416/body behavior are unchanged. A host reader bridges its
existing fenced query view; native query construction remains inside the adapter. AtomicAssets and
AtomicMarket remain one operator package. SDK `8d37e932df5e0e7d671c9682505de3dd55f0edb4`
is the deliberate package/lock/consumer pin; legacy query and formatter consumers remain checked.

## Source and original-reference controls

The separate harness accepts only frozen HAPI engineering head
`19a347b4dfb97987f6833af65f59a3343c478fd5`, tree
`b9f4e2a13457d98e2c36eee5ddf8441e3fa15442`, with all 273 emitted JavaScript hashes checked and
the original installed native SDK/Wire proof required before loading source inputs.
It does not change that checkout, install it into the plugin or activate its runtime in production.
It retains unchanged Wire716/nestedSDK339b and the exact original 2.7.0 reference commit
`0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`.

The artifact gate recognizes two complete observed byte profiles: `windows-observed` and
`linux-observed`. All 273 files remain required; 267 hashes are common and six exact overrides come
from a normal Linux build of that same Git tree. It selects and reports one coherent full profile;
missing, mutated or mixed files are refused. It never rewrites or normalizes runtime bytes. The
source Git and installed native proof gates still apply. Tests construct the six known LF vectors
from retained Windows bytes and verify their hashes against the independently measured Linux
inventory; this fixture construction does not define a general acceptance rule.
The measurements originated at HAPI 31356. The explicitly selected HAPI 19a child changes only four
private qualification/test/docs paths; its 273 Windows JavaScript outputs match 31356 byte-for-byte.
Earlier 31356 Mongo qualification failed its expected-replica identity input; the new child passes
that identity explicitly. The child remains an engineering dependency pending actual engine results.

The input is actual captured Wire genesis1 followed by **constructed** ABI2, registrationA3 and
updateB4 sections, encoded/decoded with the unchanged Wire codec. The constructed fixture ABI/table
and string key encoding are engineering inputs, not a captured deployed Wire Marketplace contract.
Original headers/times are retained; replacementC3 has an explicitly constructed header/identity.
Actual source bindings, ABI observations, coordinator, proofs and `PortableProjectionSource` execute;
the Elasticsearch transport is in memory. Source/ABI/table/key identities are retained in receipts.
Both B updates use the same qualified provider-normalized key; its opaque physical identity is not
replaced by the Marketplace name. This does not qualify arbitrary deployed contract key conventions.

No Marketplace record is seeded. Every record comes from `processSource`, the contextual runtime,
and the selected adapter. A creates metadata, repeated-key B changes the creator, exact replay and
fresh runtime reconstruction preserve A, rollbackB restores A, rollbackA removes the record,
and replacementC gets C's time. Source revocation rejects reads through the actual source guard.
Missing ABI/time/retained metadata, malformed/absent rows, capability refusal and failed/uncertain
storage cannot advance affected completion; an independent healthy projection continues.

The original DataProcessor/Marketplace processor execute on matching decoded input. The original
transaction replacement SQL generator verifies that updates exclude creation columns. Its database
effects are a bounded script, not PostgreSQL. Original HTTP requests use the original constructor,
route, handler and response wrapper over an explicitly scripted SQL boundary. Their rows come from
the original processor oracle, with the PostgreSQL bigint string boundary declared. The new plugin
output is compared against those results; it is not fed back to fabricate its own oracle.

Run the component controls after normal build/install, with explicit local paths:

```sh
HAPI_CONTEXTUAL_ROOT=/path/to/exact-hapi AA_REFERENCE_ROOT=/path/to/exact-reference npm run test:contextual
```

The reference uses its existing frozen pnpm install. The source harness reuses the pinned host's
retained capture/transport helpers and checks hashes. The component adapter uses an explicit
in-memory database boundary; component success does not establish MongoDB durability or atomicity.
The host's original error envelopes and generic absent-row error remain generic; this factory does
not introduce a new error-hook API merely to duplicate an internal upstream log message.

## Owned MongoDB program and separate Node host restart

```sh
node scripts/check-marketplace-mongodb.mjs --hapi-root /path/to/exact-hapi --reference-root /path/to/exact-reference --output marketplace-mongodb.json
```

This explicit native Linux Node24/26 program reuses HAPI's existing refusal-first owned fixture and
exact MongoDB8.0.34 image. It accepts no database URL. It checks kernel/image/ownership, independently
reads physical metadata/records after lifecycle steps, restarts the same owned server/volume and
reconstructs the runtime. It records original native commands and app-scoped failpoints, then
verifies resource cleanup. Transactional update error2 retains prior state and the original pending
candidate; write-concern error64 exercises an uncertain admission-marker acknowledgment before
mapping. That latter case is not claimed as a lost final-transaction acknowledgment or a durable
original-candidate receipt. HAPI #359 separately owns its original-intent crash/retry controls.

Root owns actual engine execution. Writing this program is not a successful engine run. Production
fork/finality activation remains HAPI #246 and serving context/headers/cache remain #221. Snapshot
rows without proven first-creation metadata are not complete genesis initialization. PostgreSQL
execution, real deployed Market capture, WormDB, transport and full domain parity remain unqualified.

The additive process-restart cell uses two distinct children at the parent's actual native
`process.execPath`, on that same exclusively owned MongoDB fixture and a separate fixed collection
prefix. Child1 reconstructs the engineered source, indexes A and repeated-key B through the public
`processSource` lifecycle, reads the original-reference expected rows and closes. Child2 rebuilds
only the identical in-memory source journal/evidence prefix; it does not seed or re-index state.
A fresh host must re-admit the already completed B through `processSource` before serving. That
admission must return `duplicate`, issue zero effect-write commands after adapter initialization
and preserve the exact recovery view. The parent independently compares complete physical metadata
(including receipts/checkpoint/revision) and rows before permitting the first recovered read.
After reading B with A's creation metadata, another physical-state gate precedes a second exact B
duplicate. Full physical equality is required again after child2 exits.

Both native PID/parent/instance/start identities and normal exits are retained; close/reaping and
PID/process-group absence are checked before success, and child1 must exit before child2 starts.
Failed children retain exit/cleanup receipts; only the owned child process group is terminated.
Child close immediately retires ordinary IPC and termination-timer authority. Pending physical
observations settle without sending late acknowledgements or arming new escalation; a separate
bounded finalization step reaps an owned surviving descendant group and clears timers again.
Jobs accept only
the exact run-derived fixture database/backend/replica-set, fixed prefix and loopback endpoint,
with no executable input or production database URL option. JSON, logs, owner acknowledgements
and whole-child lifetime have fixed bounds; the original readiness, operation and transaction
deadlines are unchanged. All earlier fifteen physical stages and seven fault cells remain.
Pure validation/native refusal controls do not execute MongoDB. Root will run the complete engine
program after review. This cell is a graceful Node host restart with reconstructed in-memory ES
transport, not persistent Elasticsearch, a process crash/lost acknowledgement, PostgreSQL execution,
a deployed contract capture, production activation or full parity.
