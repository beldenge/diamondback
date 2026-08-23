"""Dust v1 MOV timeline from MOVPLAY (60 Hz ticks, 80-byte frame records)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from image import decode_indexed_image
from mov import (
    FRAME_AUDIO_OFF,
    FRAME_REC_SIZE,
    FRAME_TABLE_OFF,
    PLAYLIST_OFF,
    TICK_HZ,
    AudioCue,
    mix_cues,
    parse_reel_timeline,
    _collect_reel,
)

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust" / "DUSTCD"
INTRO = DUST / "MOVIES" / "INTRO.MOV"
INTRO2 = DUST / "MOVIES" / "INTRO2.MOV"
INTRO3 = DUST / "MOVIES" / "INTRO3.MOV"
SALUP = DUST / "MOVIES" / "SALUP.MOV"
HELP = DUST / "MOVIES" / "HELP.MOV"
WARNING = DUST / "MOVIES" / "WARNING.MOV"
DOG1 = DUST / "MOVIES" / "DOG1.MOV"
NITEWARN = DUST / "MOVIES" / "NITEWARN.MOV"
BONE = DUST / "INVEN" / "BONE.MOV"
SKIP = "Dust CD MOV not present"


class TestTickConstants(unittest.TestCase):
    def test_movplay_constants(self) -> None:
        self.assertEqual(TICK_HZ, 60)
        self.assertEqual(FRAME_TABLE_OFF, 0x8C2)
        self.assertEqual(FRAME_REC_SIZE, 80)
        self.assertEqual(FRAME_AUDIO_OFF, 32)
        self.assertEqual(PLAYLIST_OFF, 0x83E)


class TestMixCuesTicks(unittest.TestCase):
    def test_second_clip_at_half_second(self) -> None:
        hz = 22050
        first = bytes([192]) * hz
        second = bytes([64]) * hz
        pcm, out_hz = mix_cues(
            [AudioCue(0, first, hz, 1), AudioCue(30, second, hz, 1)],
            duration_ticks=120,
            tick_hz=60,
        )
        self.assertEqual(out_hz, hz)
        self.assertEqual(len(pcm), 2 * hz * 2)
        import struct as st

        early = st.unpack_from("<h", pcm, 1000 * 2)[0]
        overlap = st.unpack_from("<h", pcm, (hz // 2 + 100) * 2)[0]
        self.assertGreater(early, 10000)
        self.assertLess(abs(overlap), 2000)

    def test_same_channel_retrigger_replaces(self) -> None:
        hz = 22050
        first = bytes([192]) * hz
        second = bytes([64]) * hz
        pcm, _out_hz = mix_cues(
            [
                AudioCue(0, first, hz, 1, "A2"),
                AudioCue(30, second, hz, 1, "A2"),
            ],
            duration_ticks=120,
            tick_hz=60,
        )
        import struct as st

        early = st.unpack_from("<h", pcm, 1000 * 2)[0]
        after = st.unpack_from("<h", pcm, (hz // 2 + 100) * 2)[0]
        self.assertGreater(early, 10000)
        self.assertLess(after, -10000)


@unittest.skipUnless(INTRO.is_file(), SKIP)
class TestIntroTimeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tl = parse_reel_timeline(read_df_file(INTRO))

    def test_parses(self) -> None:
        self.assertIsNotNone(self.tl)
        assert self.tl is not None
        self.assertEqual(self.tl.tick_hz, 60)
        self.assertEqual(len(self.tl.frames), 638)
        self.assertEqual(self.tl.duration_ticks, 2529)
        self.assertAlmostEqual(self.tl.duration_ticks / 60, 42.15, places=1)

    def test_first_still_is_container_9(self) -> None:
        assert self.tl is not None
        self.assertEqual(self.tl.frames[0].container, 9)
        self.assertEqual(self.tl.frames[-1].container, 674)

    def test_group_a_cued_by_frame_record(self) -> None:
        assert self.tl is not None
        by_cont = {}
        for clip in self.tl.clip_starts:
            by_cont.setdefault(clip.container, []).append(
                (clip.start_tick, clip.channel)
            )
        self.assertEqual(by_cont[1], [(0, "A1")])
        self.assertEqual(by_cont[2], [(120, "A2")])
        self.assertEqual(by_cont[3], [(348, "A3")])
        self.assertEqual(by_cont[146], [(610, "A1")])

    def test_group_b_playlist_starts_at_scene(self) -> None:
        assert self.tl is not None
        beds = [c for c in self.tl.clip_starts if c.channel == "B"]
        self.assertGreaterEqual(len(beds), 1)
        self.assertEqual(beds[0].container, 4)
        self.assertEqual(beds[0].start_tick, 0)
        self.assertGreater(beds[1].start_tick, 0)
        self.assertEqual(beds[1].channel, "B")

    def test_new_theme_cancels_rest_of_old_playlist(self) -> None:
        assert self.tl is not None
        leftover = [
            c
            for c in self.tl.clip_starts
            if c.channel == "B"
            and c.container in (4, 5, 6, 7, 8)
            and c.start_tick >= 2229
        ]
        self.assertEqual(leftover, [])
        theme = [
            c.start_tick
            for c in self.tl.clip_starts
            if c.container == 545
        ]
        self.assertEqual(theme, [2229, 2288, 2347])

    def test_later_voice_not_at_scene_start(self) -> None:
        assert self.tl is not None
        clip146 = [c for c in self.tl.clip_starts if c.container == 146]
        self.assertEqual(len(clip146), 1)
        self.assertEqual(clip146[0].start_tick, 610)

    def test_next_scene_voice_waits_for_previous_line(self) -> None:
        """Clip 325 is still going when scene 422 would fire 423."""
        assert self.tl is not None
        c325 = [c for c in self.tl.clip_starts if c.container == 325]
        c423 = [c for c in self.tl.clip_starts if c.container == 423]
        self.assertEqual(len(c325), 1)
        self.assertEqual(len(c423), 1)
        self.assertEqual(c325[0].start_tick, 1839)
        self.assertGreaterEqual(c423[0].start_tick, 1839 + 150)
        self.assertEqual(c423[0].start_tick, 1989)

    def test_hold_is_at_least_scene_default(self) -> None:
        assert self.tl is not None
        self.assertGreaterEqual(min(f.hold_ticks for f in self.tl.frames), 1)


@unittest.skipUnless(INTRO2.is_file() and INTRO3.is_file(), SKIP)
class TestIntroPack(unittest.TestCase):
    def test_three_intros_sum_near_two_minutes_forty(self) -> None:
        seconds = 0.0
        counts = []
        for path in (INTRO, INTRO2, INTRO3):
            tl = parse_reel_timeline(read_df_file(path))
            self.assertIsNotNone(tl)
            assert tl is not None
            counts.append(len(tl.frames))
            seconds += tl.duration_ticks / tl.tick_hz
        self.assertEqual(counts, [638, 354, 1475])
        # 14 fps average was 178 s. Engine ticks give ~162 s.
        self.assertGreater(seconds, 150)
        self.assertLess(seconds, 175)


@unittest.skipUnless(WARNING.is_file() and DOG1.is_file() and BONE.is_file(), SKIP)
class TestActionframeWait(unittest.TestCase):
    def test_inspect_stills_set_rec0_dog1_does_not(self) -> None:
        warning = parse_reel_timeline(read_df_file(WARNING))
        dog = parse_reel_timeline(read_df_file(DOG1))
        bone = parse_reel_timeline(read_df_file(BONE))
        assert warning is not None and dog is not None and bone is not None
        self.assertEqual([f.action for f in warning.frames], [0, 1, 0])
        self.assertEqual([f.action for f in bone.frames], [0, 1, 0])
        self.assertTrue(all(f.action == 0 for f in dog.frames))

    def test_nitewarn_odd_size_still_parses_actionframe(self) -> None:
        if not NITEWARN.is_file():
            self.skipTest("NITEWARN.MOV not present")
        tl = parse_reel_timeline(read_df_file(NITEWARN))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(len(tl.frames), 3)
        self.assertEqual([f.action for f in tl.frames], [0, 1, 0])


@unittest.skipUnless(SALUP.is_file(), SKIP)
class TestStairsAreQuick(unittest.TestCase):
    def test_salup_under_three_seconds(self) -> None:
        tl = parse_reel_timeline(read_df_file(SALUP))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(len(tl.frames), 30)
        self.assertLess(tl.duration_ticks / 60, 3.0)
        self.assertGreater(tl.duration_ticks / 60, 1.0)


@unittest.skipUnless(INTRO2.is_file(), SKIP)
class TestIntro2Cues(unittest.TestCase):
    def test_first_voice_is_not_at_zero(self) -> None:
        tl = parse_reel_timeline(read_df_file(INTRO2))
        self.assertIsNotNone(tl)
        assert tl is not None
        a1 = [c for c in tl.clip_starts if c.channel == "A1"]
        self.assertEqual(len(a1), 1)
        self.assertEqual(a1[0].start_tick, 255)
        a2 = [c for c in tl.clip_starts if c.channel == "A2"]
        self.assertGreater(len(a2), 1)
        self.assertEqual(a2[0].start_tick, 597)


@unittest.skipUnless(INTRO.is_file(), SKIP)
class TestIntroFramebuffer(unittest.TestCase):
    def test_scene_header_does_not_clear_prior(self) -> None:
        df = read_df_file(INTRO)
        stills, _cues = _collect_reel(df, decode_audio=False)
        by_index = {still.container: still.image for still in stills}
        self.assertIn(461, by_index)
        self.assertEqual(by_index[461].pixels.count(0), 0)
        holey = decode_indexed_image(df.containers[461].data, None)
        self.assertEqual(holey.pixels.count(0), 300)

    def test_first_still_is_keyframe(self) -> None:
        df = read_df_file(INTRO)
        stills, _cues = _collect_reel(df, decode_audio=False)
        first = stills[0]
        self.assertEqual(first.container, 9)
        fresh = decode_indexed_image(df.containers[9].data, None)
        self.assertEqual(first.image.pixels, fresh.pixels)

    def test_later_scene_uses_its_own_palette(self) -> None:
        df = read_df_file(INTRO)
        stills, _cues = _collect_reel(df, decode_audio=False)
        by = {still.container: still for still in stills}
        self.assertNotEqual(by[9].palette.colors[1], by[147].palette.colors[1])
        self.assertNotEqual(by[9].palette.colors[1], by[326].palette.colors[1])
        from image import still_rgb24

        wrong = still_rgb24(by[326].image, by[9].palette)
        right = still_rgb24(by[326].image, by[326].palette)
        self.assertNotEqual(wrong, right)


@unittest.skipUnless(HELP.is_file(), SKIP)
class TestHelpTimeline(unittest.TestCase):
    def test_three_stills(self) -> None:
        tl = parse_reel_timeline(read_df_file(HELP))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(len(tl.frames), 3)
        self.assertEqual([f.container for f in tl.frames], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
