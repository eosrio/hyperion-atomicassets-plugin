# Asset-ID and sale-ID HTTP component

Scope: Atomic plugin #24, HAPI #366/#191; full parity #1/#10 remains open. Baseline is AtomicAssets API
2.7.0 at 0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e. SDK source/lock pins f15dc3aa333ff526e24482650b685ebaa02eda4e.

Import `registerAtomicIdRoutes` from `@eosrio/hyperion-atomicassets-plugin/http` and call it on the
existing Fastify instance with configured contract/projection IDs and a request-to-StatefulQueryHost
resolver. Every request enters one compose call, including invalid IDs. All sale/asset/relationship
reads share its supplied reader. The plugin returns its captured value unchanged after compose;
HAPI owns actual admission, late source/owner/ABI/view/cancellation checks, onSend and shared headers.
This package creates no listener, native query, recovery owner, view or readiness setter.

The original AssetApi.getAssetAction/getSaleAction, formatters, fillers and returnAsJSON run through
real Fastify.inject with their exact source pins and a finite synthetic database boundary. No listener
is opened. This proves handler/envelope behavior for those explicit rows, not PostgreSQL execution.
Successful response bodies retain success/data/query_time (epoch milliseconds); controls compare
all fields except the varying query_time, whose presence and integer type are asserted.

Original ID validation accepts leading-zero decimal text, negative text and case-insensitive null,
and rejects +1, decimal points and arbitrary text. It passes original numeric text to SQL and normalizes
null case only. AssetFiller indexes returned canonical rows using the original request string, so a
leading-zero asset request becomes416 while the sale handler returns the canonical sale. The component
preserves that observed distinction. Canonical and leading-zero nonnegative IDs are supported within
the signed PostgreSQL profile. Null, negative nonzero and overflow IDs stay explicitly unavailable;
actual physical database behavior for these forms is unqualified. Long parameter limits, all content
parser/method combinations and HTTP header parity also remain outside these focused controls.

The untemplated lifecycle and fixed-sale readers preserve known-absent416 bodies and the sale's
covered-absent nested asset ID fallback. Templates/pricing, unknown coverage and scope/host errors
propagate for the HAPI retryable-unavailable policy; no arbitrary exception becomes absence.

The two inventory cells gain partial HTTP component annotations. Their original registrations,
source observations and full endpoint parity remain unchanged/unqualified. Controlled injected compose
is not proof of production admission, durable indexing, physical paired parity or all93 routes.
