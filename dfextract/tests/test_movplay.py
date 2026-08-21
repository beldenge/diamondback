"""Load an extracted MOV folder without opening a window."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from movplay import load_movie_dump, parse_args

DOG1 = HERE / "out" / "MOV" / "_DOG1"
INTRO = HERE / "out" / "MOV" / "_INTRO"


class TestMovplayArgs(unittest.TestCase):
    def test_folder_and_scale(self) -> None:
        args = parse_args(["out/MOV/_DOG1"])
        self.assertEqual(args.scale, 2)
        args = parse_args(["out/MOV/_INTRO", "--scale", "1"])
        self.assertEqual(args.scale, 1)


@unittest.skipUnless(DOG1.is_dir(), "DOG1 extract not present")
class TestLoadDog1(unittest.TestCase):
    def test_timeline_and_wavs(self) -> None:
        dump = load_movie_dump(DOG1)
        self.assertEqual(dump.tick_hz, 60)
        self.assertEqual(len(dump.frames), 6)
        self.assertEqual(dump.frames[0].container, 2)
        self.assertEqual(dump.duration_ticks, 59)
        self.assertGreaterEqual(len(dump.cues), 1)
        self.assertEqual(dump.missing_clips, ())
        self.assertTrue(dump.frames[0].path.is_file())


@unittest.skipUnless(INTRO.is_dir(), "INTRO extract not present")
class TestLoadIntro(unittest.TestCase):
    def test_has_later_voice(self) -> None:
        dump = load_movie_dump(INTRO)
        self.assertEqual(len(dump.frames), 638)
        starts = {(c.start_tick, c.channel) for c in dump.cues}
        self.assertIn((1839, "A3"), starts)
        self.assertIn((1989, "A1"), starts)


if __name__ == "__main__":
    unittest.main()
