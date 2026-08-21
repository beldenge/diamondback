"""Full-screen MOV reel classification (and optional ffmpeg encode)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from cli import CONTENT_KINDS, parse_args, selected_kinds
from container import read_df_file
from image import IndexedImage, Palette
from mov import (
    TICK_HZ,
    find_ffmpeg,
    fit_rgb24,
    is_reel_movie,
    write_mov_extract,
)

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
INTRO = DUST / "MOVIES" / "INTRO.MOV"
HELP = DUST / "MOVIES" / "HELP.MOV"
GUN = DUST / "INVEN" / "GUN.MOV"
PIG = DUST / "MOVIES" / "APOTHPIG.MOV"
DOG1 = DUST / "MOVIES" / "DOG1.MOV"
NITEWARN = DUST / "MOVIES" / "NITEWARN.MOV"
LUPRE = DUST / "INFO" / "LUPRE.MOV"
INTRO3 = DUST / "MOVIES" / "INTRO3.MOV"
TIPRE = DUST / "INFO" / "TIPRE.MOV"
ZUNUSED = DUST / "MOVIES" / "ZUNUSED" / "DBSIGN.MOV"


class TestReelClassification(unittest.TestCase):
    def test_intros_and_info_are_reels(self) -> None:
        self.assertTrue(is_reel_movie(INTRO))
        self.assertTrue(is_reel_movie(INTRO3))
        self.assertTrue(is_reel_movie(Path("MOVIES/D2MD2A.MOV")))
        self.assertTrue(is_reel_movie(LUPRE))
        self.assertTrue(is_reel_movie(HELP))

    def test_inspectables_and_overlays_are_not(self) -> None:
        self.assertFalse(is_reel_movie(GUN))
        self.assertFalse(is_reel_movie(PIG))
        self.assertFalse(is_reel_movie(DOG1))
        self.assertFalse(is_reel_movie(ZUNUSED))
        self.assertFalse(is_reel_movie(Path("SET/TOWN.SET")))

    def test_video_flag_is_opt_in(self) -> None:
        self.assertEqual(selected_kinds(parse_args([])), CONTENT_KINDS)
        self.assertNotIn("video", selected_kinds(parse_args([])))
        self.assertEqual(selected_kinds(parse_args(["--video"])), ("video",))
        self.assertEqual(
            selected_kinds(parse_args(["--frames", "--video"])),
            ("frames", "video"),
        )

    def test_tick_hz_is_movplay_60(self) -> None:
        self.assertEqual(TICK_HZ, 60)


class TestReelEncode(unittest.TestCase):
    def test_help_mov_encodes_when_ffmpeg_exists(self) -> None:
        if find_ffmpeg() is None:
            self.skipTest("ffmpeg not on PATH")
        if not HELP.exists():
            self.skipTest("HELP.MOV not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "help"
            result = write_mov_extract(
                read_df_file(HELP),
                dest,
                write_scripts=False,
                write_frames=False,
                write_audio=False,
                write_video=True,
            )
            movie = dest / "movie.mp4"
            self.assertEqual(result.get("video"), 1)
            self.assertGreater(movie.stat().st_size, 1000)
            self.assertFalse((dest / "FRAMES").exists())

    def test_overlay_dog1_encodes(self) -> None:
        if find_ffmpeg() is None:
            self.skipTest("ffmpeg not on PATH")
        if not DOG1.exists():
            self.skipTest("DOG1.MOV not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "dog1"
            result = write_mov_extract(
                read_df_file(DOG1),
                dest,
                write_scripts=False,
                write_frames=False,
                write_audio=False,
                write_video=True,
            )
            movie = dest / "movie.mp4"
            self.assertEqual(result.get("video"), 1)
            self.assertTrue((dest / "timeline.json").is_file())
            self.assertGreater(movie.stat().st_size, 1000)

    def test_odd_size_nitewarn_encodes(self) -> None:
        if find_ffmpeg() is None:
            self.skipTest("ffmpeg not on PATH")
        if not NITEWARN.exists():
            self.skipTest("NITEWARN.MOV not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "nitewarn"
            result = write_mov_extract(
                read_df_file(NITEWARN),
                dest,
                write_scripts=False,
                write_frames=False,
                write_audio=False,
                write_video=True,
            )
            movie = dest / "movie.mp4"
            self.assertEqual(result.get("video"), 1)
            self.assertGreater(movie.stat().st_size, 500)

    def test_fit_rgb24_letterboxes_smaller_still(self) -> None:
        palette = Palette(colors=[(0, 0, 0)] * 256)
        image = IndexedImage(width=2, height=2, pixels=bytes([255, 255, 255, 255]))
        canvas = fit_rgb24(image, palette, 4, 4)
        self.assertEqual(len(canvas), 4 * 4 * 3)
        # VGA still palette maps index 255 to white; centered 2×2 on 4×4.
        white = bytes((255, 255, 255))
        black = bytes((0, 0, 0))
        def px(x: int, y: int) -> bytes:
            off = (y * 4 + x) * 3
            return bytes(canvas[off : off + 3])

        self.assertEqual(px(0, 0), black)
        self.assertEqual(px(1, 1), white)
        self.assertEqual(px(2, 2), white)
        self.assertEqual(px(3, 3), black)


@unittest.skipUnless(TIPRE.is_file(), "TIPRE.MOV not present")
class TestMixedSizeReel(unittest.TestCase):
    def test_tipre_encodes_mixed_384_and_264(self) -> None:
        if find_ffmpeg() is None:
            self.skipTest("ffmpeg not on PATH")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "tipre"
            result = write_mov_extract(
                read_df_file(TIPRE),
                dest,
                write_scripts=False,
                write_frames=False,
                write_audio=False,
                write_video=True,
            )
            movie = dest / "movie.mp4"
            self.assertEqual(result.get("video"), 1)
            self.assertGreater(movie.stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()

