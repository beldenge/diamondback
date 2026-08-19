"""Tests for Dust SET / FLT / PRP / MOV extraction."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from image import decode_indexed_image, find_palette
from mov import is_audio_container
from set import extract_set_metadata, looks_like_script

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
APOTH = DUST / "DATA" / "APOTH.SET"
CHECKERS_FLT = DUST / "CHECKERS" / "CHECKERS.FLT"
NITEFOUN = DUST / "MOVIES" / "NITEFOUN.MOV"
INTRO = DUST / "MOVIES" / "INTRO.MOV"


class TestRemaining(unittest.TestCase):
    def test_apoth_grid_and_waypoints(self) -> None:
        if not APOTH.exists():
            self.skipTest("APOTH.SET not present")
        scenes, waypoints, transitions = extract_set_metadata(read_df_file(APOTH))
        self.assertEqual(len(scenes), 9)
        names = {(s.x, s.y): s.name for s in scenes}
        self.assertEqual(names[(1, 0)], "Scene A2")
        self.assertTrue(next(s for s in scenes if s.name == "Scene A1").blocked)
        self.assertFalse(next(s for s in scenes if s.name == "Scene A2").blocked)
        self.assertEqual([w.name for w in waypoints], ["drugs.watson1", "drugs.watson2"])
        self.assertEqual(len(transitions), 28)
        self.assertEqual(transitions[0].frame0, 45)
        self.assertEqual(transitions[0].dir_from, 1)
        self.assertEqual(transitions[0].dir_to, 3)

    def test_apoth_boot_is_script(self) -> None:
        if not APOTH.exists():
            self.skipTest("APOTH.SET not present")
        df = read_df_file(APOTH)
        self.assertTrue(looks_like_script(df.containers[1].data))
        self.assertTrue(looks_like_script(df.containers[35].data))

    def test_apoth_frame_decodes(self) -> None:
        if not APOTH.exists():
            self.skipTest("APOTH.SET not present")
        df = read_df_file(APOTH)
        self.assertIsNotNone(find_palette(df.containers[0].data))
        image = decode_indexed_image(df.containers[45].data)
        self.assertEqual((image.width, image.height), (512, 264))
        # A decoded still should not be all zeros.
        self.assertGreater(sum(image.pixels) / max(len(image.pixels), 1), 1)

    def test_checkers_flt_has_script(self) -> None:
        if not CHECKERS_FLT.exists():
            self.skipTest("CHECKERS.FLT not present")
        df = read_df_file(CHECKERS_FLT)
        self.assertTrue(looks_like_script(df.containers[1].data))

    def test_nitefoun_mov_frame(self) -> None:
        if not NITEFOUN.exists():
            self.skipTest("NITEFOUN.MOV not present")
        df = read_df_file(NITEFOUN)
        self.assertIsNotNone(find_palette(df.containers[0].data))
        image = decode_indexed_image(df.containers[1].data)
        self.assertEqual((image.width, image.height), (512, 264))
        self.assertGreater(sum(image.pixels) / max(len(image.pixels), 1), 1)

    def test_intro_mov_has_audio_containers(self) -> None:
        if not INTRO.exists():
            self.skipTest("INTRO.MOV not present")
        df = read_df_file(INTRO)
        audio = [c for c in df.containers[1:] if is_audio_container(c.data)]
        self.assertGreaterEqual(len(audio), 10)
        self.assertFalse(is_audio_container(df.containers[0].data))


if __name__ == "__main__":
    unittest.main()
