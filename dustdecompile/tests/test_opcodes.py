"""Opcode table recovered from DF.EXE, not from DFET's Titanic list."""

from __future__ import annotations

import sys
import unittest
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from facts import EXTRACT_TXT_ALIASES
from inventory import default_dust_root
from opcodes import name_map, opcode_band, opcode_map, recover_opcodes
from pe import load_pe

DUST = default_dust_root()
SKIP = "Dust install not under sources/dust.dbgl"

# Anchors from extracted Dust scripts / the packed DF.EXE table.
KNOWN = {
    "puppetspeak": 12043,
    "puppetbevel": 12044,
    "puppetevent": 20028,
    "puppetclear": 12041,
    "pluginfx": 20098,
    "plugin": 12027,
    "playmovie": 12017,
    "opensetfile": 12032,
    "hittest": 20070,
    "pointx": 20002,
    "pointy": 20003,
    "code": 4001,
    "if": 4006,
    "walktostar": 12006,
    "makeball": 12007,
    "stopball": 12012,
    "sendtofloor": 12066,
    "sendtostage": 12070,
    "framerate": 16022,
    "and": 8005,
    "or": 8006,
    "&": 8005,
    "|": 8006,
    "@": 8007,
    "currentdir": 16011,
    "findfile": 20067,
    "path": 16009,
}


@unittest.skipUnless(DUST is not None, SKIP)
class TestOpcodes(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.ops = recover_opcodes(load_pe(DUST / "DF.EXE"))
        cls.by_name = name_map(cls.ops)
        cls.by_id = opcode_map(cls.ops)

    def test_count_is_exactly_the_documented_table(self) -> None:
        self.assertEqual(len(self.ops), 304)
        self.assertEqual(len({op.name for op in self.ops}), 304)
        self.assertEqual(len({op.id for op in self.ops}), 302)

    def test_known_ids(self) -> None:
        for name, oid in KNOWN.items():
            self.assertEqual(self.by_name.get(name), oid, name)

    def test_titanic_cricket_names_are_absent(self) -> None:
        names = {op.name for op in self.ops}
        self.assertIn("makeball", names)
        self.assertNotIn("makecricket", names)
        self.assertIn("floorscript", names)
        self.assertNotIn("paintingscript", names)
        self.assertNotIn("currentview", names)
        self.assertNotIn("fileexists", names)
        self.assertNotIn("spotmovie", names)

    def test_no_duplicate_names(self) -> None:
        names = [op.name for op in self.ops]
        self.assertEqual(len(names), len(set(names)))

    def test_and_or_share_ids_with_symbols(self) -> None:
        self.assertEqual(self.by_name["&"], self.by_name["and"])
        self.assertEqual(self.by_name["|"], self.by_name["or"])
        names_8005 = [op.name for op in self.ops if op.id == 8005]
        self.assertEqual(set(names_8005), {"&", "and"})

    def test_table_file_range(self) -> None:
        offs = [op.file_offset for op in self.ops]
        self.assertEqual(min(offs), 279984)
        self.assertEqual(max(offs), 281890)

    def test_puppetspeak_record(self) -> None:
        rec = next(op for op in self.ops if op.name == "puppetspeak")
        self.assertEqual(rec.file_offset, 281240)
        self.assertEqual(rec.name_va, 0x004460C4)
        self.assertEqual(rec.id, 12043)

    def test_no_text_false_positives(self) -> None:
        names = {op.name for op in self.ops}
        self.assertNotIn("o", names)
        self.assertNotIn("frexp", names)
        self.assertFalse(any(op.id == 5515 for op in self.ops))

    def test_id_bands(self) -> None:
        counts = Counter(opcode_band(op.id) for op in self.ops)
        self.assertEqual(counts["language"], 29)
        self.assertEqual(counts["operator"], 12)
        self.assertEqual(counts["command"], 88)
        self.assertEqual(counts["field"], 53)
        self.assertEqual(counts["function"], 108)
        self.assertEqual(counts["transition"], 14)
        self.assertEqual(opcode_band(12043), "command")
        self.assertEqual(opcode_band(20098), "function")
        self.assertEqual(opcode_band(16011), "field")
        self.assertEqual(opcode_band(4001), "language")

    def test_language_ids_are_dense_4001_4029(self) -> None:
        lang = sorted(op.id for op in self.ops if opcode_band(op.id) == "language")
        self.assertEqual(lang[0], 4001)
        self.assertEqual(lang[-1], 4029)
        self.assertEqual(len(lang), 29)

    def test_all_txt_aliases_point_at_dust_names(self) -> None:
        for oid, (_txt, dust) in EXTRACT_TXT_ALIASES.items():
            self.assertEqual(self.by_name[dust], oid)
            self.assertEqual(self.by_id[oid], dust)

    def test_records_are_six_bytes_inside_a_group(self) -> None:
        # First two operator records are packed +6.
        first = next(op for op in self.ops if op.file_offset == 279984)
        second = next(op for op in self.ops if op.file_offset == 279990)
        self.assertEqual(first.name, "&")
        self.assertEqual(second.name, "(")


if __name__ == "__main__":
    unittest.main()
