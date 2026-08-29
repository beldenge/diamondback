"""Curated facts stay aligned with the recovered Dust table."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from facts import EXTRACT_TXT_ALIASES, HOOKS, LIBRARY, OPCODES
from inventory import default_dust_root
from opcodes import name_map, opcode_band, recover_opcodes
from pe import load_pe

SKIP = "Dust install not under sources/dust.dbgl"

# Names that look like engine verbs but are game/library/hooks, not DF.EXE.
NOT_OPCODES = {
    "spotmovie",
    "gototown",
    "gotointerior",
    "gotospecial",
    "advanceday",
    "initall",
    "canadvance",
    "addinven",
    "setupactor",
    "putdownactor",
    "runyoself",
    "mousedown",
    "setcursor",
    "keydown",
}


class TestFactsStatic(unittest.TestCase):
    def test_opcode_facts_have_unique_names(self) -> None:
        names = [row["name"] for row in OPCODES]
        self.assertEqual(len(names), len(set(names)))

    def test_opcode_facts_have_ids_and_confidence(self) -> None:
        for row in OPCODES:
            self.assertIn(row["confidence"], {"proven-scripts", "inferred", "unknown"}, row["name"])
            self.assertIsInstance(row["id"], int)
            self.assertTrue(row.get("summary"))

    def test_aliases_are_real_pairs(self) -> None:
        for oid, (txt, dust) in EXTRACT_TXT_ALIASES.items():
            self.assertNotEqual(txt, dust, oid)
            self.assertTrue(txt.isidentifier(), txt)
            self.assertTrue(dust.isidentifier(), dust)

    def test_library_and_hooks_named(self) -> None:
        self.assertIn("spotmovie", LIBRARY)
        self.assertIn("gototown", LIBRARY)
        self.assertIn("advanceday", LIBRARY)
        self.assertIn("runyoself", HOOKS)
        self.assertIn("mousedown", HOOKS)

    def test_advanceday_notes_start_cash_vs_help_loan(self) -> None:
        notes = LIBRARY["advanceday"]["notes"]
        blob = " ".join(notes)
        self.assertIn("start cash is 5", blob)
        self.assertIn("playercash <= 0", blob)

    def test_playmovie_notes_tower_chain(self) -> None:
        play = next(row for row in OPCODES if row["name"] == "playmovie")
        blob = " ".join(play["notes"])
        self.assertIn("towertop.mov", blob)
        self.assertIn("towerdn.mov", blob)
        self.assertIn("0x419a24", blob)
        self.assertIn("bellmoon", blob)
        self.assertIn("intro3.mov", blob)
        spot = " ".join(LIBRARY["spotmovie"]["notes"])
        self.assertIn("towerup", spot)


@unittest.skipUnless(default_dust_root() is not None, SKIP)
class TestFactsAgainstDfExe(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.by_name = name_map(recover_opcodes(load_pe(default_dust_root() / "DF.EXE")))

    def test_every_fact_id_matches_the_table(self) -> None:
        for row in OPCODES:
            self.assertEqual(self.by_name.get(row["name"]), row["id"], row["name"])

    def test_every_alias_dust_name_matches_the_table(self) -> None:
        for oid, (txt, dust) in EXTRACT_TXT_ALIASES.items():
            self.assertEqual(self.by_name.get(dust), oid, dust)
            self.assertNotEqual(self.by_name.get(txt), oid, f"Titanic name {txt} must not be Dust's name for {oid}")

    def test_library_names_are_not_opcodes(self) -> None:
        for name in NOT_OPCODES:
            self.assertNotIn(name, self.by_name, name)

    def test_fact_bands_match_id_math(self) -> None:
        for row in OPCODES:
            if row["name"] in {"plugin", "playmovie", "puppetspeak", "sendtostage"}:
                self.assertEqual(opcode_band(row["id"]), "command")
            if row["name"] in {"pluginfx", "puppetevent", "pointx", "hittest"}:
                self.assertEqual(opcode_band(row["id"]), "function")


if __name__ == "__main__":
    unittest.main()
