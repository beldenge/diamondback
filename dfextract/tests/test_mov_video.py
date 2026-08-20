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
from mov import (
    REEL_FPS,
    AudioCue,
    find_ffmpeg,
    is_reel_movie,
    mix_cues,
    write_mov_extract,
)

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
INTRO = DUST / "MOVIES" / "INTRO.MOV"
HELP = DUST / "MOVIES" / "HELP.MOV"
GUN = DUST / "INVEN" / "GUN.MOV"
PIG = DUST / "MOVIES" / "APOTHPIG.MOV"
LUPRE = DUST / "INFO" / "LUPRE.MOV"
INTRO3 = DUST / "MOVIES" / "INTRO3.MOV"
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
        self.assertFalse(is_reel_movie(ZUNUSED))
        self.assertFalse(is_reel_movie(Path("SET/TOWN.SET")))

    def test_video_flag_is_opt_in(self) -> None:
        self.assertEqual(selected_kinds(parse_args([])), CONTENT_KINDS)
        self.assertEqual(selected_kinds(parse_args(["--video"])), ("video",))
        self.assertEqual(
            selected_kinds(parse_args(["--frames", "--video"])),
            ("frames", "video"),
        )

    def test_reel_fps_matches_intro_timing(self) -> None:
        # 2467 stills / 178 s ≈ 13.86. Constant is the nearest integer.
        self.assertEqual(REEL_FPS, 14)

    def test_overlapping_cues_mix_at_still_timestamps(self) -> None:
        # 8-bit DC: 192 = +0.5, 64 = -0.5. Second clip starts at still 7
        # (0.5 s at 14 fps) so they overlap for half a second.
        hz = 22050
        first = bytes([192]) * hz  # 1 s
        second = bytes([64]) * hz
        pcm, out_hz = mix_cues(
            [
                AudioCue(0, first, hz, 1),
                AudioCue(7, second, hz, 1),
            ],
            n_stills=28,
        )
        self.assertEqual(out_hz, hz)
        self.assertEqual(len(pcm), 28 // REEL_FPS * hz * 2)
        import struct as st

        early = st.unpack_from("<h", pcm, 1000 * 2)[0]
        overlap = st.unpack_from("<h", pcm, (hz // 2 + 100) * 2)[0]
        self.assertGreater(early, 10000)
        self.assertLess(abs(overlap), 2000)


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


if __name__ == "__main__":
    unittest.main()
