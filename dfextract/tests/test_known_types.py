"""BOOTFILE, CST, and SND checks against the Dust game files."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from boot import extract_boot
from container import read_df_file
from cst import extract_cst
from snd import extract_snd

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
BOOTFILE = DUST / "WIN31" / "DUST" / "BOOTFILE"
EXTRA_CST = DUST / "DUSTCD" / "DATA" / "EXTRA.CST"
TOWN_SND = DUST / "DUSTCD" / "DATA" / "TOWN.SND"


class TestKnownTypes(unittest.TestCase):
    def test_bootfile_scripts(self) -> None:
        if not BOOTFILE.exists():
            self.skipTest("BOOTFILE not present")
        scripts = extract_boot(read_df_file(BOOTFILE))
        self.assertTrue(scripts)
        self.assertEqual(scripts[0].name, "Script 1")
        self.assertIn("code boot ()", scripts[0].text)

    def test_extra_cst_scripts(self) -> None:
        if not EXTRA_CST.exists():
            self.skipTest("EXTRA.CST not present")
        actors = {actor.name: actor for actor in extract_cst(read_df_file(EXTRA_CST))}
        self.assertIn("Jenix", actors)
        self.assertIn("pig", actors)
        self.assertIn("code resetactor ()", actors["Jenix"].script)
        self.assertIn("code initactor ()", actors["Jenix"].script)

    def test_town_snd_decodes(self) -> None:
        if not TOWN_SND.exists():
            self.skipTest("TOWN.SND not present")
        decoded, failed = extract_snd(read_df_file(TOWN_SND))
        self.assertFalse(failed)
        names = {clip.name for clip, _pcm, _hz, _w in decoded}
        self.assertIn("anvil", names)
        self.assertIn("town.snd", names)
        anvil = next(item for item in decoded if item[0].name == "anvil")
        _clip, pcm, hertz, width = anvil
        self.assertGreater(len(pcm), 1000)
        self.assertEqual(hertz, 22050)
        self.assertEqual(width, 1)


if __name__ == "__main__":
    unittest.main()
