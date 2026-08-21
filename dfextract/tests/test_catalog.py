"""catalog.json from an existing dump."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from catalog import build_catalog, write_catalog
from cli import main

OUT = HERE / "out"


class TestCatalog(unittest.TestCase):
    def test_indexes_existing_dump(self) -> None:
        if not (OUT / "PUP" / "_JENIX").is_dir():
            self.skipTest("dfextract/out not present")
        payload = build_catalog(OUT)
        self.assertIn("jenix.pup", payload["files"])
        self.assertEqual(payload["files"]["jenix.pup"]["type"], "PUP")
        self.assertIn("jenix.5", payload["line_ids"])
        names = {row["name"] for row in payload["globals"]}
        self.assertIn("day", names)
        self.assertIn("playercash", names)

    def test_cli_catalog_only(self) -> None:
        if not (OUT / "PUP" / "_JENIX").is_dir():
            self.skipTest("dfextract/out not present")
        with tempfile.TemporaryDirectory() as tmp:
            # Point at the real dump via -o
            rc = main(["--catalog", "-o", str(OUT)])
            self.assertEqual(rc, 0)
            catalog = json.loads((OUT / "catalog.json").read_text(encoding="utf-8"))
            self.assertIn("jenix.pup", catalog["files"])
            # tmp unused; ensure a missing dump fails
            missing = Path(tmp) / "nope"
            rc = main(["--catalog", "-o", str(missing)])
            self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
