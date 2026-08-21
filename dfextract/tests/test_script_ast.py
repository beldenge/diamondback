"""JSON token stream for Dust scripts."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from opcodes import dust_opcode_name
from pup import extract_pup, write_pup_extract

REPO = HERE.parent
JENIX = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD" / "PUPPETS" / "JENIX.PUP"


class TestScriptAst(unittest.TestCase):
    def test_jenix_day1_tokens_use_dust_names(self) -> None:
        if not JENIX.exists():
            self.skipTest("JENIX.PUP not present")
        df = read_df_file(JENIX)
        extract = extract_pup(df)
        day1 = next(s for s in extract.scripts if s.name.lower() == "day1")
        names = [t.get("name") for t in day1.tokens if t.get("kind") == "opcode"]
        self.assertIn("puppetspeak", names)
        self.assertIn("puppetbevel", names)
        speaks = [
            t
            for t in day1.tokens
            if t.get("kind") == "string" and t.get("value") == "jenix.5"
        ]
        self.assertTrue(speaks)

    def test_currentdir_alias_marked(self) -> None:
        self.assertEqual(dust_opcode_name(16011), "currentdir")
        self.assertEqual(dust_opcode_name(12043), "puppetspeak")

    def test_write_includes_json_and_animlogic(self) -> None:
        if not JENIX.exists():
            self.skipTest("JENIX.PUP not present")
        df = read_df_file(JENIX)
        extract = extract_pup(df)
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            write_pup_extract(extract, dest, write_scripts=True)
            ast = json.loads((dest / "day1.json").read_text(encoding="utf-8"))
            self.assertTrue(ast["tokens"])
            csv_text = (dest / "AUDIO" / "texts.csv").read_text(encoding="utf-8")
            header = csv_text.splitlines()[0]
            self.assertIn("animLogic", header)
            self.assertIn("jenix.5", csv_text)


if __name__ == "__main__":
    unittest.main()
