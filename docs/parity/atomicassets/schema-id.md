# Schema ID component

This component models the pinned 2.7.0 schema-ID handler through the complete schema kind and coherent collection/count reads. It expands comma tokens and request-bound operator lists before one state composition, applies original name validation, defaults to creation descending and schema name ascending, and preserves the original empty-result 200 wrapper without data. A missing list source is retryably unavailable. List results are nonrecursive; empty or missing lists remove that field filter.

The HAPI host must supply an SDK-negotiated request-bound list resolver and retain its source/configuration generation and guard through serialization, caching and final publication. This component does not establish that lifecycle, physical backend parity, full API parity, or production qualification. The complete state owner must cover all 21 declared kinds, including schema counts. The baseline is atomicassets-api 2.7.0 commit 0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e.

Only `/atomicassets/v1/schemas/:collection_name/:schema_name` is added here. It is one source-level implementation slice among the 93 inventoried JSON paths, not proof of full coverage. Selected non-text collection metadata is refused pending original PostgreSQL `json->>` comparison. Physical, managed HTTP and full list/cache integration remain unverified.
