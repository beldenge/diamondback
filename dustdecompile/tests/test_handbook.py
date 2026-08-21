"""Handbook merge: aliases, Jenix choice ids, library, markdown."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from facts import EXTRACT_TXT_ALIASES, HOOKS, LIBRARY, OPCODES
from handbook import build_handbook, render_markdown, write_handbook
from inventory import default_dust_root, default_scripts_root
from opcodes import recover_opcodes
from pe import load_pe

SKIP = "Dust install not under sources/dust.dbgl"


@unittest.skipUnless(default_dust_root() is not None, SKIP)
class TestHandbook(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        ops = recover_opcodes(load_pe(default_dust_root() / "DF.EXE"))
        cls.ops = ops
        cls.data = build_handbook(ops, default_scripts_root())

    def test_alias_currentview(self) -> None:
        row = next(a for a in self.data["aliases"] if a["id"] == 16011)
        self.assertEqual(row["extract_txt"], "currentview")
        self.assertEqual(row["dust_exe"], "currentdir")

    def test_all_aliases_exported(self) -> None:
        ids = {a["id"] for a in self.data["aliases"]}
        self.assertEqual(ids, set(EXTRACT_TXT_ALIASES))

    def test_puppetevent_minus_one(self) -> None:
        ev = next(o for o in self.data["opcodes"] if o["name"] == "puppetevent")
        self.assertEqual(ev["id"], 20028)
        blob = " ".join(
            ex["text"] if isinstance(ex, dict) else str(ex) for ex in ev["examples"]
        )
        if self.data["scripts_indexed"]:
            self.assertIn("puppetevent", blob)
            self.assertIn("-1", blob)

    def test_spotmovie_is_library_not_opcode(self) -> None:
        names = {o["dust_name"] for o in self.data["all_opcodes"]}
        self.assertNotIn("spotmovie", names)
        lib = next(x for x in self.data["library"] if x["name"] == "spotmovie")
        self.assertIn("playmovie", lib["summary"])

    def test_library_and_hooks_sections(self) -> None:
        lib_names = {x["name"] for x in self.data["library"]}
        self.assertEqual(lib_names, set(LIBRARY))
        hook_names = {x["name"] for x in self.data["hooks"]}
        self.assertEqual(hook_names, set(HOOKS))

    def test_high_value_opcodes_all_present(self) -> None:
        names = {o["name"] for o in self.data["opcodes"]}
        self.assertEqual(names, {row["name"] for row in OPCODES})

    def test_no_titanic_cricket_in_dust_table(self) -> None:
        names = {o["dust_name"] for o in self.data["all_opcodes"]}
        self.assertIn("makeball", names)
        self.assertNotIn("makecricket", names)
        self.assertEqual(EXTRACT_TXT_ALIASES[12007][0], "makecricket")

    def test_pluginfx_call_count_when_dump_present(self) -> None:
        fx = next(o for o in self.data["opcodes"] if o["name"] == "pluginfx")
        if self.data["scripts_indexed"]:
            self.assertGreaterEqual(fx["call_count"], 2)
            self.assertEqual(fx["arities_seen"], [4])

    def test_markdown_names_the_protocols(self) -> None:
        md = render_markdown(self.data)
        for needle in (
            "puppetbevel",
            "puppetevent",
            "spotmovie",
            "currentview",
            "currentdir",
            "PlugProc",
            "checkmove",
            "Do not mix Titanic",
        ):
            self.assertIn(needle, md, needle)

    def test_write_handbook_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            written = write_handbook(dest, self.data)
            names = {p.name for p in written}
            self.assertEqual(names, {"handbook.json", "handbook.md"})
            self.assertGreater((dest / "handbook.md").stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
