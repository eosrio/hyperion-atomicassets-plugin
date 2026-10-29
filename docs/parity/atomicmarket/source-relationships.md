# Chronological fixed-sale relationships

[Issue #28](https://github.com/eosrio/hyperion-atomicassets-plugin/issues/28) adds actual input-driven
relationships to the compound factory. It preserves factory27 and changes no SDK, native adapter,
source capture, serving authority or deployment. It does not close full 2.7.0 parity.

The existing asset reducer provides current asset/collection/schema rows. Actual `lognewoffer`
occurrences now create offer state and asset-owner links; accept/decline/cancel actions update their
states. Priorities 80/90 follow the original. Matched/wrong-owner transfers and burns are still handled
by the existing asset reducer. The final offer pass runs after market jobs, matching original commit
ordering: pending offers become invalid when current linked ownership differs (including burns),
and restored ownership changes invalid back to pending without replacing the invalidation timestamp.
Accepted/declined/cancelled offers are excluded from that pass. A missing asset does not match the
original inner join. Covered absence and unavailable reads retain their existing distinct meanings.

The logical `asset-offers` reverse index is maintained only from real offer occurrences, in the same
candidate as the forward links and offer. It replaces a database scan, never source authority. Its
arrays, traversal, reads and mutations use the existing explicit SDK limits: hot fan-out fails the
affected candidate rather than truncating. Definitions now require at least 16 record kinds.
The operator must select sufficient finite limits; the package supplies no budget default. A changed
definition/index requires the host's normal new projection/source initialization, not adoption of
the older incomplete relationship state. Generic persistence/rollback covers these logical records.

Market config must supply its real `atomicassets_account`, `supported_tokens`, empty
`supported_symbol_pairs`, and supported version 1.2.2. Token updates retain original behavior:
only a change in array length triggers inserts; removing a token retains its existing row; same-length
precision/contract changes leave the row unchanged; re-adding a retained token produces the original
insert conflict rather than an invented upsert. Token precision is normalized losslessly to the SQL
integer view shape. Erasing config refuses the whole candidate. Nonempty symbol pairs and Delphi
conversion remain unsupported.

The factory also selects the actual system `setcode` action (`systemContract`, default `eosio`).
It records the account's code-observation presence for the original sale `is_seller_contract` predicate.
The original receiver retains that presence even when code is empty; the projection does likewise.
This is a real selected action, not a fixture code row. Choose the actual system account on another
protocol; that choice is not Wire domain qualification. The host still resolves its real ABI epochs.

Single-asset offers (sender or recipient side), untemplated assets and same-currency sale responses
now read real offer, token, asset links and code observations through the unchanged coherent reader
and formatter. Updating an asset relationship changes the current nested sale response. HTTP routes
still require an actual request-scoped host and its final publication fence. No native adapter or
persisted label can grant serving readiness.

Source controls execute the exact original asset/offer/config/sale processors, priority scheduler and
setcode receiver at `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. Their finite callback collaborator models
only the observed SQL predicates; it starts with no asset/offer/token/code rows, and chronological
occurrences create them. The original initializer's empty config singleton is explicit. Tests compare
every resulting offer/link/token/asset-owner/sale/code snapshot, and retain raw original receipts.
Current sale responses also run through real Fastify injection and actual installed tarballs.
This is not PostgreSQL query execution, physical MongoDB recovery, actual source admission, or a
new same-input original HTTP comparison. The existing original HTTP/formatter controls remain.

Complete original side effects/history/notifications, multi-asset exchanges/bundles, templates,
backing/mint reconciliation, scope-less schema interpretation, pricing/conversion, NUL/literal-backslash
conversion and remaining route families stay open. Whole-block validation may observe an unsupported
or erased input earlier than the original priority queue; final staged effects still discard together.
