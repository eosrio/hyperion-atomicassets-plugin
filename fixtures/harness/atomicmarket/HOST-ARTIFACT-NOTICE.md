# HAPI artifact fixture attribution

The six compressed emitted JavaScript vectors in `host-artifact-variants.json` come from
[eosrio/hyperion-history-api at 31356f34](https://github.com/eosrio/hyperion-history-api/tree/31356f34b9d63e34fd3d02f1ba7193b00749c4bc).
Their exact Windows bytes are retained. Tests construct the LF counterparts and verify them
against the independently measured Linux hashes; runtime verification does not normalize bytes.

The source repository's `license.md` is retained verbatim as
[HOST-ARTIFACT-LICENSE](HOST-ARTIFACT-LICENSE), identifying Attribution-NonCommercial-ShareAlike 4.0
International. These qualification fixtures retain that source license rather than the package's
general MIT label. The fixture vectors, notice and license are excluded from the production tarball.
