"""Golden tests against the existing DFET Dust extract."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from pup import extract_pup

REPO = HERE.parents[1]
PUPPETS = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD" / "PUPPETS"
DFET_EXTRACT = REPO / "sources" / "dust-extract"


def _strip_banner(text: str) -> str:
    lines = text.splitlines()
    while lines and (lines[0].startswith("//") or lines[0] == ""):
        lines.pop(0)
    return "\n".join(lines).rstrip() + "\n"


class TestPupScripts(unittest.TestCase):
    def test_jenix_header_and_dialogue(self) -> None:
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
        df = read_df_file(PUPPETS / "JENIX.PUP")
        extract = extract_pup(df)
        day1 = next(script.text for script in extract.scripts if script.name.lower() == "day1")
        self.assertIn("code runyoself ()", day1)
        self.assertIn("global playercash, jenixphase", day1)
        self.assertIn("if jenixphase = 0", day1)
        self.assertIn('puppetspeak ("jenix.5")', day1)
        self.assertIn('actorowner ("JENIX", "gavemoney")', day1)
        self.assertIn("puppetevent (-1)", day1)

    def test_bolivar_matches_dfet_scripts(self) -> None:
        dfet_dir = DFET_EXTRACT / "_BOLIVAR" / "PUP"
        if not dfet_dir.exists():
            self.skipTest("DFET Bolivar extract not present")
        df = read_df_file(PUPPETS / "BOLIVAR.PUP")
        extract = extract_pup(df)
        ours = {script.name.lower(): script.text for script in extract.scripts}
        dfet_files = list(dfet_dir.glob("*.txt"))
        self.assertGreaterEqual(len(dfet_files), 2)
        for path in dfet_files:
            key = path.stem.lower()
            self.assertIn(key, ours, f"missing script {path.name}")
            self.assertEqual(
                _strip_banner(ours[key]),
                _strip_banner(path.read_text(encoding="utf-8", errors="replace")),
                f"script text mismatch: {path.name}",
            )


if __name__ == "__main__":
    unittest.main()
