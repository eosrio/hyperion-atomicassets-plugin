# Hyperion AtomicAssets plugin: agent guidance

Read [README.md](README.md), the [architecture definition](https://github.com/eosrio/hyperion-tools/blob/a36fda12ba813968ce361e85893206d8f5bceb0f/docs/architecture/hyperion-4.5.md)
and applicable ADRs. Work from the approved release plan and scoped linked issues.

Keep AtomicAssets and AtomicMarket in one operator-facing package. Record coverage against the
exact 2.7.0 baseline. Preserve compatible JSON responses and use shared serving metadata contracts.
Do not duplicate database-native queries or move asset lifecycle rules into Hyperion core.

Keep accepted release constraints, implementation status and qualification evidence distinct.
A scaffold or green documentation check is not a working extension. Add appropriate runtime
checks with implementation. Do not publish versions or compatibility claims implicitly.
