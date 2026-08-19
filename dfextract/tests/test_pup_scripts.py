"""PUP script and dialogue checks against the Dust game files."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from pup import extract_pup

REPO = HERE.parent
PUPPETS = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD" / "PUPPETS"


class TestPupScripts(unittest.TestCase):
    def test_jenix_header_and_dialogue(self) -> None:
        if not (PUPPETS / "JENIX.PUP").exists():
            self.skipTest("JENIX.PUP not present")
        df = read_df_file(PUPPETS / "JENIX.PUP")
        extract = extract_pup(df)
        self.assertEqual(extract.version, 1)
        names = [script.name.lower() for script in extract.scripts]
        self.assertEqual(names, ["boot script", "day1", "day2", "day3"])
        idents = {line.ident: line.text for line in extract.dialogue}
        self.assertEqual(idents["jenix.2"], "They're yours!")
        self.assertIn("jenix.5", idents)
        self.assertIn("Excuse me, stranger", idents["jenix.5"])

    def test_jenix_day1_has_blog_beats(self) -> None:
        if not (PUPPETS / "JENIX.PUP").exists():
            self.skipTest("JENIX.PUP not present")
        df = read_df_file(PUPPETS / "JENIX.PUP")
        extract = extract_pup(df)
        day1 = next(script.text for script in extract.scripts if script.name.lower() == "day1")
        self.assertIn("code runyoself ()", day1)
        self.assertIn("global playercash, jenixphase", day1)
        self.assertIn("if jenixphase = 0", day1)
        self.assertIn('puppetspeak ("jenix.5")', day1)
        self.assertIn('actorowner ("JENIX", "gavemoney")', day1)
        self.assertIn("puppetevent (-1)", day1)

    def test_bolivar_scripts(self) -> None:
        if not (PUPPETS / "BOLIVAR.PUP").exists():
            self.skipTest("BOLIVAR.PUP not present")
        df = read_df_file(PUPPETS / "BOLIVAR.PUP")
        extract = extract_pup(df)
        names = [script.name.lower() for script in extract.scripts]
        self.assertEqual(names, ["boot script", "day1", "checkers vo"])
        day1 = next(script.text for script in extract.scripts if script.name.lower() == "day1")
        self.assertIn("code ", day1)
        self.assertIn("puppetspeak", day1)
        self.assertIn("bolivar", day1.lower())


if __name__ == "__main__":
    unittest.main()
