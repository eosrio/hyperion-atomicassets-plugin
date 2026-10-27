"""Derive public constructed domain values from the closed, private original-PG oracle.
No runtime logs, connection configuration, headers or whole reports are emitted.
"""
import argparse
import hashlib
import json
import tarfile
from pathlib import Path

ARCHIVE_SHA = "37d367d7ff475548dbb6af70ccd6a4bbfbf4d94f21306a856f2e476f25e567a7"
REPORTS = {
    "node24": ("cases/node24/aa-pg-30225859f60270cb6a26748e00d290bf/report.json", "4657577f07fdc1b9c2649ce809dc989af1e41754f44ee2b23318a698fb42609f"),
    "node26": ("cases/node26/aa-pg-1700d63d5718276536c5685ce113d5f8/report.json", "de7735744a01c047195f45e220578dd7902c2d42bd1b1b81ee909bed93fa9b23"),
}
sha = lambda data: hashlib.sha256(data).hexdigest()
def selected(report):
    assert report["status"] == "passed" and report["qualified"] is False
    stages = []
    for row in report["result"]["stages"]:
        stage = {key: row[key] for key in ("name", "asset", "collections", "schemas", "view")}
        stage["formatted"] = row["http"]["body"]["data"]
        assert row["http"]["status"] == 200 and row["http"]["body"]["success"] is True
        stage["mints"] = [{**mint, "txid": bytes(mint["txid"]["data"]).hex()} for mint in row["mints"]]
        stages.append(stage)
    assert len(stages) == 7
    return stages

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with args.archive.open("rb") as handle:
        assert hashlib.file_digest(handle, "sha256").hexdigest() == ARCHIVE_SHA
    reports = {}
    with tarfile.open(args.archive, "r:gz") as archive:
        for node, (name, expected) in REPORTS.items():
            member = archive.getmember(name)
            assert member.isfile() and member.size < 500000
            data = archive.extractfile(member).read()
            assert sha(data) == expected
            reports[node] = json.loads(data)
    stages = selected(reports["node24"])
    assert stages == selected(reports["node26"]), "Native oracle domain values disagree"
    root = Path(__file__).resolve().parents[1]
    original = root / "fixtures/harness/atomicassets/lifecycle"
    input_bytes = (original / "input.json").read_bytes()
    inputs = json.loads(input_bytes)
    # The legacy original changed this NUL to a space. Successful tracer inputs
    # deliberately use the safe stored value, NOT the original input/hash.
    inputs["collectionData"]["img"] = stages[0]["collections"][0]["data"]["img"]
    fields = ("contract", "collection", "schema", "assetId", "block", "collectionFormat", "collectionData", "format", "immutableAttributes", "mutableAttributes", "updatedAttributes")
    inputs = {key: inputs[key] for key in fields}
    expected = {"fixtureKind": "constructed-supported-domain-subset", "input": inputs, "stages": stages}
    args.output.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(expected, indent=2, ensure_ascii=True) + "\n").encode()
    (args.output / "expected.json").write_bytes(data)
    provenance = {"schemaVersion": 1, "referenceCommit": "0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e", "archive": {"bytes": 3736882, "sha256": ARCHIVE_SHA},
      "reports": [{"node": node, "member": name, "sha256": digest} for node, (name, digest) in REPORTS.items()],
      "originalInputSha256": sha(input_bytes), "derivedInputSha256": sha(json.dumps(inputs, sort_keys=True, separators=(",", ":")).encode()),
      "fixtureSha256": sha(data), "sourceManifest": "../lifecycle/provenance.json", "sourceManifestSha256": sha((original / "provenance.json").read_bytes()),
      "substitution": {"field": "collectionData.img", "original": "image\u0000hash", "derived": "image hash", "reason": "Refuse unresolved original NUL policy; supported subset uses original stored value"},
      "scope": {"originalPGOutputsAgreeOnNative24And26": True, "newSameInputPhysicalPGComparison": False, "constructedInputs": True, "mongo": False, "sdkRecovery": False, "fullParity": False}}
    (args.output / "provenance.json").write_bytes((json.dumps(provenance, indent=2) + "\n").encode())
    with args.archive.open("rb") as handle:
        assert hashlib.file_digest(handle, "sha256").hexdigest() == ARCHIVE_SHA
    print(json.dumps({"stages": len(stages), "fixtureSha256": sha(data), "scope": provenance["scope"]}))
if __name__ == "__main__":
    main()
