"""Golden tests for BOOTFILE, CST, and SND against the DFET extract."""

from __future__ import annotations

import sys
import unittest
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from boot import extract_boot
from container import read_df_file
from cst import extract_cst
from snd import extract_snd

REPO = HERE.parents[1]
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
BOOTFILE = DUST / "WIN31" / "DUST" / "BOOTFILE"
EXTRA_CST = DUST / "DUSTCD" / "DATA" / "EXTRA.CST"
TOWN_SND = DUST / "DUSTCD" / "DATA" / "TOWN.SND"
DFET = REPO / "sources" / "dust-extract"


def _strip_banner(text: str) -> str:
    lines = text.splitlines()
    while lines and (lines[0].startswith("//") or lines[0] == ""):
        lines.pop(0)
    return "\n".join(lines).rstrip() + "\n"


def _wav_pcm(path: Path) -> bytes:
    with wave.open(str(path), "rb") as handle:
        return handle.readframes(handle.getnframes())


class TestKnownTypes(unittest.TestCase):
    def test_bootfile_matches_dfet(self) -> None:
        if not BOOTFILE.exists():
            self.skipTest("BOOTFILE not present")
        scripts = extract_boot(read_df_file(BOOTFILE))
        self.assertTrue(scripts)
        self.assertEqual(scripts[0].name, "Script 1")
        self.assertIn("code boot ()", scripts[0].text)
        dfet = DFET / "_BOOTFILE" / "Script 1.txt"
        if dfet.exists():
            self.assertEqual(
                _strip_banner(scripts[0].text),
                _strip_banner(dfet.read_text(encoding="utf-8", errors="replace")),
            )

    def test_extra_cst_scripts_match_dfet(self) -> None:
        if not EXTRA_CST.exists():
            self.skipTest("EXTRA.CST not present")
        actors = {actor.name: actor for actor in extract_cst(read_df_file(EXTRA_CST))}
        self.assertIn("Jenix", actors)
        self.assertIn("pig", actors)
        self.assertIn("code resetactor ()", actors["Jenix"].script)
        dfet_script = DFET / "_EXTRA" / "CST" / "Jenix" / "Script.txt"
        if dfet_script.exists():
            self.assertEqual(
                _strip_banner(actors["Jenix"].script),
                _strip_banner(dfet_script.read_text(encoding="utf-8", errors="replace")),
            )

    def test_town_snd_decodes_and_matches_dfet_pcm(self) -> None:
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
        dfet_wav = DFET / "_TOWN" / "SND" / "anvil.wav"
        if dfet_wav.exists():
            theirs = _wav_pcm(dfet_wav)
            overlap = min(len(pcm), len(theirs))
            self.assertGreater(overlap, 1000)
            self.assertEqual(pcm[:overlap], theirs[:overlap])


if __name__ == "__main__":
    unittest.main()
