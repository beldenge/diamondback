"""PRP shop-table names."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from prp import parse_prp_catalog

REPO = HERE.parents[1]
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
INVEN = DUST / "DATA" / "INVEN.PRP"
CHECKERS = DUST / "CHECKERS" / "CHECKERS.PRP"


class TestPrpNames(unittest.TestCase):
    def test_inven_has_named_items(self) -> None:
        if not INVEN.exists():
            self.skipTest("INVEN.PRP missing")
        catalog = parse_prp_catalog(read_df_file(INVEN))
        groups = {item.group for item in catalog}
        self.assertIn("Bone", groups)
        self.assertIn("Cigar", groups)
        self.assertIn("Gun", groups) if "Gun" in groups else self.assertIn("BKnife", groups)
        states = {(item.group, item.state) for item in catalog}
        self.assertIn(("Bone", "small"), states)
        self.assertIn(("Bone", "large"), states)
        self.assertGreater(len(catalog), 50)

    def test_checkers_pieces(self) -> None:
        if not CHECKERS.exists():
            self.skipTest("CHECKERS.PRP missing")
        catalog = parse_prp_catalog(read_df_file(CHECKERS))
        names = {(item.group, item.state) for item in catalog}
        self.assertIn(("me1", "normal"), names)
        self.assertIn(("me1", "king"), names)
        self.assertIn(("him1", "king"), names)


if __name__ == "__main__":
    unittest.main()
