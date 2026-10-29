# Bounded AtomicMarket buyoffer ID component

Issue #46 implements the action-derived single-asset buyoffer state at the exact original
API 2.7.0 commit `0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e`. The original processor registers
`lognewbuyo` at priority 1020 and `cancelbuyo`, `acceptbuyo`, `declinebuyo` at 1040. It has
no buyoffers table callback. No table state or relationships are invented to fill that gap.

Creation uses negotiated original action authorization: any actor different from the market
causes the original no-op before reading action data; an explicit empty list passes. Missing
metadata refuses. Authorization remains beside decoded contract data and is bound by the
host retained trace/source proof plus the SDK source/candidate digest. The getter rejects old
host contexts and requires `original-action-authorization-v1`. SDK #40 and HAPI #397, including
the native adapter's own SDK recapture dependency, are prerequisites, not supplied authority.

The component supports source-bound market contract version 1.2.2, exact nonnegative decimal
IDs/amounts in PostgreSQL's supported signed-int64 range, one retained asset link, original
positive amount clamping, create/upsert timestamp reset, stable callback priorities and accepted
replay guard. Updates of missing offers have no rows. Recreating a different asset would retain
a bundle in the original database and therefore refuses this bounded component atomically.
The caller must discard every staged effect on any refusal.

`/atomicmarket/v1/buyoffers/:buyoffer_id` uses the host's single completed coherent reader for
buyoffer, current collection/token and nested asset state. It follows the original ID handler,
416 absence, formatter state, missing-asset fallback, token precision/contract and current versus
retained collection fee. Buyoffers do not query or add `is_seller_contract`. Pending status uses
the current asset owner; accepted replay keeps the original taker and update time. Invalid IDs
produce 400; null/negative/out-of-range IDs remain unavailable until their actual original
PostgreSQL behavior is qualified. Leading zeros are queried by canonical decimal ID.

The twentieth `market-buyoffer` record kind requires an explicit 20-kind budget, a new reviewed
declaration/generation and qualified initialization/replay. Old explicit 19 and smaller budgets
are preserved and refuse. Installing new code neither adopts old state nor raises limits.

The reference controls execute the unmodified original scheduler, callbacks, HTTP middleware,
ID handler, asset filler and formatter. Storage and SQL-view joins are finite controlled
collaborators with explicit scope; these results are not physical PostgreSQL/MongoDB parity.
The original callback/handler collaborator opens no listening socket. The product HEAD control
uses one bounded ephemeral loopback HTTP server because Fastify.inject retains an explicit HEAD
payload. No database service or remote host is used; this does not establish original wire-transport parity.

Bundles, newer contract/v2 legacy-bundle behavior, template pricing and buyoffer-price enrichment,
nontext JSONB display extraction, remaining input shapes, notifications/history, lists/counts,
logs/stats/sockets and full family parity remain open. Templated asset enrichment refuses until
actual original price/buyoffer state is supported. No empty price relation is synthesized.
The previous 19-kind physical profiles and their frozen source remain separate evidence.
