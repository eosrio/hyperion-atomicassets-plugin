# SDK #50: PostgreSQL execution outcomes

The isolated SQL oracle characterizes the pinned AtomicAssets 2.7 handler and
response wrapper against PostgreSQL 16.15. It records the SQL, bindings, original
database error and wrapper response for selected and off-page aggregate overflow,
and count-only behavior. The previous schema fixture supplies the overflowing
aggregate. The off-page result is recorded as observed; the test does not assume
which plan the database chooses.

A second isolated transaction holds an exclusive lock while the unchanged handler
query runs with a transaction-local 100 ms statement timeout. The report records
the original error and wrapper response and both transaction rollback/release
outcomes before assertions. The workflow's final gate also requires normal outer
connection closure. This is bounded fixture evidence, not proof that a cancelled
request or an expired SDK safety deadline is a completed native timeout.

The real fixture runs only in the existing admitted Linux CI service. Socket-free
tests model progress and failure retention. No SDK result type, adapter offer,
production behavior or parity qualification follows from these controls.
