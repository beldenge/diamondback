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
from script import binary_script_to_text
from set import extract_set_metadata, looks_like_script, strip_frame_name, write_set_extract

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
APOTH = DUST / "DATA" / "APOTH.SET"
TOWN = DUST / "DATA" / "TOWN.SET"
NITE = DUST / "DATA" / "NITE.SET"
TARGET = DUST / "TARGET" / "TARGET.SET"
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

    def test_town_full_grid_not_g_o_suffix(self) -> None:
        """TOWN/NITE/TARGET are 15×15 (A–O). A 129-cell G–O suffix also
        matches the end-of-header heuristic; we must keep the full table
        or hotel/bank/doctor/court scripts never dump."""
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        for path, label in ((TOWN, "TOWN"), (NITE, "NITE"), (TARGET, "TARGET")):
            if not path.exists():
                self.skipTest(f"{path.name} not present")
            scenes, _waypoints, transitions = extract_set_metadata(read_df_file(path))
            names = {s.name.lower(): s for s in scenes}
            self.assertEqual(len(scenes), 225, label)
            self.assertIn("scene a1", names, label)
            self.assertIn("scene g5", names, label)
            self.assertIn("scene g15", names, label)
            self.assertIn("scene o15", names, label)
            g5 = names["scene g5"]
            self.assertEqual((g5.x, g5.y), (4, 6), label)
            if label != "TARGET":
                self.assertEqual(g5.blocked, 0, label)
                self.assertEqual(g5.interact, 1, label)
            self.assertEqual(len(transitions), 526 if label != "TARGET" else 210, label)

    def test_town_g5_script_is_hotel_and_doctor(self) -> None:
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        df = read_df_file(TOWN)
        scenes, _, _ = extract_set_metadata(df)
        g5 = next(s for s in scenes if s.name.lower() == "scene g5")
        self.assertTrue(looks_like_script(df.containers[g5.script_container].data))
        text = binary_script_to_text(df.containers[g5.script_container].data)
        self.assertIn('gotointerior ("hotlower.set")', text)
        self.assertIn('gotointerior ("doctor1.set")', text)

    def test_town_walk_and_turn_share_a_container(self) -> None:
        """O7→N7 walk and an N7 turn both use container 1640. Per-strip
        names keep the two decodes from overwriting each other."""
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        _scenes, _wps, transitions = extract_set_metadata(read_df_file(TOWN))
        owners = [tr for tr in transitions if tr.frame0 <= 1640 <= tr.frame0 + 5]
        self.assertGreaterEqual(len(owners), 2)
        self.assertEqual(strip_frame_name(1640, 0), "1640_0.png")
        self.assertEqual(strip_frame_name(1635, 5), "1635_5.png")

    def test_apoth_writes_per_strip_frames(self) -> None:
        if not APOTH.exists():
            self.skipTest("APOTH.SET not present")
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            counts = write_set_extract(read_df_file(APOTH), dest, write_scripts=False, write_frames=True)
            first = dest / "FRAMES" / "45_0.png"
            last = dest / "FRAMES" / f"{45}_5.png"
            self.assertTrue(first.exists(), first)
            self.assertTrue(last.exists(), last)
            self.assertGreaterEqual(counts.get("frames", 0), 28 * 5)

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
