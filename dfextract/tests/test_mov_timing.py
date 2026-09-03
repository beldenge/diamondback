"""Dust v1 MOV timeline from MOVPLAY (60 Hz ticks, 80-byte frame records)."""

from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from image import decode_indexed_image
from mov import (
    bed_wrap_cues,
    END_KIND_CHAIN,
    FRAME_AUDIO_OFF,
    FRAME_REC_SIZE,
    FRAME_TABLE_OFF,
    PLAYLIST_OFF,
    REC_END_KIND_OFF,
    REC_FLAGS_OFF,
    REC_NEXT_NAME_OFF,
    WAIT_AUDIO_FLAG,
    TICK_HZ,
    AudioCue,
    mix_cues,
    parse_reel_timeline,
    _collect_reel,
    _pascal_mov_name,
    _rec_next_movie,
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
DOG2 = DUST / "MOVIES" / "DOG2.MOV"
NITEWARN = DUST / "MOVIES" / "NITEWARN.MOV"
BONE = DUST / "INVEN" / "BONE.MOV"
GROCPOTS = DUST / "MOVIES" / "GROCPOTS.MOV"
BELL = DUST / "MOVIES" / "BELL.MOV"
NITEBELL = DUST / "MOVIES" / "NITEBELL.MOV"
TOWERUP = DUST / "MOVIES" / "TOWERUP.MOV"
TOWERTOP = DUST / "MOVIES" / "TOWERTOP.MOV"
TOWERDN = DUST / "MOVIES" / "TOWERDN.MOV"
BELLBARN = DUST / "MOVIES" / "BELLBARN.MOV"
KIDDIE = DUST / "KID" / "KIDDIE.MOV"
BELLMOON = DUST / "MOVIES" / "BELLMOON.MOV"
BELLTOWN = DUST / "MOVIES" / "BELLTOWN.MOV"
MARIEEND = DUST / "MOVIES" / "MARIEEND.MOV"
KETTLE = DUST / "MOVIES" / "KETTLE.MOV"
HARMON = DUST / "INVEN" / "HARMON.MOV"
SAFEBOX = DUST / "MOVIES" / "SAFEBOX.MOV"
MAIN = DUST / "INFO" / "MAIN.MOV"
HWIN = DUST / "MOVIES" / "HWIN.MOV"
SKIP = "Dust CD MOV not present"


class TestPascalNextMovie(unittest.TestCase):
    def test_pascal_mov_name_accepts_clean_stem(self) -> None:
        raw = bytes([12]) + b"towertop.mov" + b"\x80" * 8
        self.assertEqual(_pascal_mov_name(raw, 0), "towertop.mov")

    def test_pascal_mov_name_rejects_header_junk(self) -> None:
        padded = b"intro2.mov''''''''"
        raw = bytes([len(padded)]) + padded
        self.assertEqual(_pascal_mov_name(raw, 0), "")
        self.assertEqual(_pascal_mov_name(b"", 0), "")

    def test_rec_next_movie_only_when_end_kind_3(self) -> None:
        rec = bytearray(80)
        rec[REC_NEXT_NAME_OFF] = 12
        rec[REC_NEXT_NAME_OFF + 1 : REC_NEXT_NAME_OFF + 13] = b"towertop.mov"
        self.assertEqual(_rec_next_movie(bytes(rec)), "")
        struct.pack_into("<H", rec, REC_END_KIND_OFF, END_KIND_CHAIN)
        self.assertEqual(_rec_next_movie(bytes(rec)), "towertop.mov")
        struct.pack_into("<H", rec, 0, 5)
        self.assertEqual(_rec_next_movie(bytes(rec)), "")


class TestTickConstants(unittest.TestCase):
    def test_movplay_constants(self) -> None:
        self.assertEqual(TICK_HZ, 60)
        self.assertEqual(FRAME_TABLE_OFF, 0x8C2)
        self.assertEqual(FRAME_REC_SIZE, 80)
        self.assertEqual(FRAME_AUDIO_OFF, 32)
        self.assertEqual(PLAYLIST_OFF, 0x83E)
        self.assertEqual(REC_FLAGS_OFF, 0x1A)
        self.assertEqual(WAIT_AUDIO_FLAG, 1)


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
        self.assertTrue(all(c.duration_ticks > 0 for c in self.tl.clip_starts if c.channel.startswith("A")))

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
        self.assertEqual([f.wait for f in warning.frames], [False, True, False])
        self.assertEqual([f.wait for f in bone.frames], [False, True, False])
        self.assertTrue(all(f.action == 0 for f in dog.frames))
        self.assertTrue(all(not f.wait for f in dog.frames))
        self.assertEqual(
            [f.wait_audio for f in dog.frames],
            [False, False, True, False, True, False],
        )
        growl = [c for c in dog.clip_starts if c.container == 1]
        self.assertEqual(len(growl), 2)
        self.assertGreater(growl[0].duration_ticks, 0)
        self.assertEqual(growl[0].duration_ticks, growl[1].duration_ticks)

    def test_dog2_waits_audio_on_rec_5(self) -> None:
        if not DOG2.is_file():
            self.skipTest("DOG2.MOV not present")
        tl = parse_reel_timeline(read_df_file(DOG2))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(len(tl.frames), 7)
        self.assertEqual(
            [f.wait_audio for f in tl.frames],
            [False, False, False, False, False, True, False],
        )

    def test_intro2_a_retriggers_do_not_set_wait_audio(self) -> None:
        tl = parse_reel_timeline(read_df_file(INTRO2))
        self.assertIsNotNone(tl)
        assert tl is not None
        a_recs = [
            (i, f)
            for i, f in enumerate(tl.frames)
            if any(
                c.start_tick == f.start_tick and (c.channel or "").startswith("A")
                for c in tl.clip_starts
            )
        ]
        self.assertGreater(len(a_recs), 5)
        self.assertFalse(any(f.wait_audio for _i, f in a_recs))

    def test_nitewarn_odd_size_still_parses_actionframe(self) -> None:
        if not NITEWARN.is_file():
            self.skipTest("NITEWARN.MOV not present")
        tl = parse_reel_timeline(read_df_file(NITEWARN))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(len(tl.frames), 3)
        self.assertEqual([f.action for f in tl.frames], [0, 1, 0])
        self.assertEqual([f.wait for f in tl.frames], [False, True, False])


@unittest.skipUnless(GROCPOTS.is_file() and BELL.is_file(), SKIP)
class TestSpotmovieCommandSfx(unittest.TestCase):
    def test_grocpots_clangs_once_at_the_swing_dest_frame(self) -> None:
        """Rec 1 and rec 9 both jump A1 to rec 2. Rec 9 is replay, not a second clang."""
        tl = parse_reel_timeline(read_df_file(GROCPOTS))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertTrue(tl.frames[1].wait)
        self.assertEqual(len(tl.frames[1].hotspots), 2)
        self.assertEqual(tl.frames[2].start_tick, 42)
        clips = [(c.start_tick, c.container, c.channel) for c in tl.clip_starts]
        self.assertEqual(clips, [(42, 1, "A1")])

    def test_bell_rings_each_a_slot_at_its_dest_frame(self) -> None:
        """Three click rects on rec 1 jump to recs 2 / 22 / 43 (the three swings)."""
        tl = parse_reel_timeline(read_df_file(BELL))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertTrue(tl.frames[1].wait)
        self.assertEqual(len(tl.frames[1].hotspots), 4)
        self.assertEqual(tl.frames[1].hotspots[0].dest, 2)
        self.assertEqual(tl.frames[1].hotspots[1].dest, 22)
        self.assertEqual(tl.frames[1].hotspots[2].dest, 43)
        self.assertEqual(tl.frames[1].hotspots[3].dest, 64)
        self.assertEqual(tl.frames[2].start_tick, 18)
        self.assertEqual(tl.frames[22].start_tick, 78)
        self.assertEqual(tl.frames[43].start_tick, 141)
        clips = [(c.container, c.channel, c.start_tick) for c in tl.clip_starts]
        self.assertEqual(
            clips,
            [(1, "A1", 18), (2, "A2", 78), (3, "A3", 141)],
        )

    def test_safebox_take_stone_has_no_mixer_slot(self) -> None:
        if not SAFEBOX.is_file():
            self.skipTest("SAFEBOX.MOV not present")
        tl = parse_reel_timeline(read_df_file(SAFEBOX))
        self.assertIsNotNone(tl)
        assert tl is not None
        waits = [f for f in tl.frames if f.wait]
        self.assertGreaterEqual(len(waits), 2)
        take = waits[1].hotspots[0]
        self.assertEqual(take.dest, 17)
        self.assertEqual(take.channel, "")

    def test_nitebell_matches_bell_dest_frames(self) -> None:
        if not NITEBELL.is_file():
            self.skipTest("NITEBELL.MOV not present")
        tl = parse_reel_timeline(read_df_file(NITEBELL))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertTrue(tl.frames[1].wait)
        self.assertEqual(len(tl.frames[1].hotspots), 4)
        clips = [(c.container, c.channel, c.start_tick) for c in tl.clip_starts]
        self.assertEqual(
            clips,
            [(1, "A1", 33), (2, "A2", 93), (3, "A3", 156)],
        )

    def test_kettle_replay_hotspots_do_not_retrigger(self) -> None:
        if not KETTLE.is_file():
            self.skipTest("KETTLE.MOV not present")
        tl = parse_reel_timeline(read_df_file(KETTLE))
        self.assertIsNotNone(tl)
        assert tl is not None
        clips = [(c.start_tick, c.channel) for c in tl.clip_starts]
        self.assertEqual(clips, [(39, "A1"), (75, "A2")])

    def test_harmonica_notes_are_click_hotspots_not_auto_sfx(self) -> None:
        if not HARMON.is_file():
            self.skipTest("HARMON.MOV not present")
        tl = parse_reel_timeline(read_df_file(HARMON))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(list(tl.clip_starts), [])
        self.assertTrue(any(f.wait for f in tl.frames))

    def test_info_main_does_not_auto_fire_jump_hotspots(self) -> None:
        if not MAIN.is_file():
            self.skipTest("MAIN.MOV not present")
        tl = parse_reel_timeline(read_df_file(MAIN))
        self.assertIsNotNone(tl)
        assert tl is not None
        a_clips = [c for c in tl.clip_starts if (c.channel or "").startswith("A")]
        self.assertLessEqual(len(a_clips), 8)
        beds = [c for c in tl.clip_starts if c.channel == "B"]
        self.assertGreaterEqual(len(beds), 1)

    def test_hotel_window_sfx_from_command_stream(self) -> None:
        if not HWIN.is_file():
            self.skipTest("HWIN.MOV not present")
        tl = parse_reel_timeline(read_df_file(HWIN))
        self.assertIsNotNone(tl)
        assert tl is not None
        clips = [(c.start_tick, c.channel) for c in tl.clip_starts]
        self.assertEqual(clips, [(33, "A1"), (36, "A2")])


@unittest.skipUnless(KIDDIE.is_file(), SKIP)
class TestKiddieQuickdraw(unittest.TestCase):
    def test_kiddie_is_three_timed_click_windows_not_a_linear_reel(self) -> None:
        tl = parse_reel_timeline(read_df_file(KIDDIE))
        self.assertIsNotNone(tl)
        assert tl is not None
        dests = sorted(
            {spot.dest for frame in tl.frames for spot in frame.hotspots}
        )
        self.assertEqual(dests, [20, 32, 49])
        self.assertTrue(all(not frame.wait for frame in tl.frames))
        timeouts = [frame for frame in tl.frames if frame.timeout_movie]
        self.assertEqual(len(timeouts), 3)
        self.assertTrue(all(frame.timeout_movie == "kidwin.mov" for frame in timeouts))
        self.assertEqual([frame.end_kind for frame in timeouts], [3, 3, 3])


@unittest.skipUnless(TOWERUP.is_file() and TOWERTOP.is_file() and TOWERDN.is_file(), SKIP)
class TestTowerChain(unittest.TestCase):
    def test_towerup_chains_to_towertop(self) -> None:
        """Last rec kind 3 (DF.EXE 0x419a24) names towertop.mov. Scripts only say towerup."""
        tl = parse_reel_timeline(read_df_file(TOWERUP))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(tl.next_movie, "towertop.mov")
        self.assertTrue(all(not f.wait for f in tl.frames))

    def test_towertop_is_the_examine_still(self) -> None:
        """Rec 2: type-4 windows + type-2 bell + ladder dismiss. Last rec chains down."""
        tl = parse_reel_timeline(read_df_file(TOWERTOP))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertTrue(tl.frames[2].wait)
        spots = tl.frames[2].hotspots
        self.assertEqual(len(spots), 5)
        self.assertEqual(spots[0].movie, "bellmoon.mov")
        self.assertEqual(spots[0].dest, 0)
        self.assertEqual((spots[0].top, spots[0].left, spots[0].bottom, spots[0].right), (0, 374, 253, 512))
        self.assertEqual(spots[1].movie, "bellbarn.mov")
        self.assertEqual((spots[1].top, spots[1].left, spots[1].bottom, spots[1].right), (0, 0, 189, 72))
        self.assertEqual(spots[2].dest, 24)
        self.assertEqual(spots[2].channel, "")
        self.assertEqual((spots[2].top, spots[2].left, spots[2].bottom, spots[2].right), (198, 7, 264, 367))
        self.assertEqual(spots[3].dest, 3)
        self.assertEqual(spots[3].channel, "A1")
        self.assertEqual((spots[3].top, spots[3].left, spots[3].bottom, spots[3].right), (56, 203, 129, 278))
        self.assertEqual(spots[4].movie, "belltown.mov")
        self.assertEqual((spots[4].top, spots[4].left, spots[4].bottom, spots[4].right), (7, 129, 195, 344))
        self.assertEqual(tl.next_movie, "towerdn.mov")
        clips = [(c.container, c.channel) for c in tl.clip_starts]
        self.assertEqual(clips, [(1, "A1")])

    def test_towerdn_does_not_chain(self) -> None:
        tl = parse_reel_timeline(read_df_file(TOWERDN))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(tl.next_movie, "")
        self.assertTrue(all(not f.wait for f in tl.frames))

    def test_tower_windows_are_inspect_stills(self) -> None:
        if not (BELLBARN.is_file() and BELLMOON.is_file() and BELLTOWN.is_file()):
            self.skipTest("tower window MOVs not present")
        barn = parse_reel_timeline(read_df_file(BELLBARN))
        moon = parse_reel_timeline(read_df_file(BELLMOON))
        town = parse_reel_timeline(read_df_file(BELLTOWN))
        assert barn is not None and moon is not None and town is not None
        self.assertTrue(any(f.wait for f in barn.frames))
        self.assertTrue(any(f.wait for f in moon.frames))
        self.assertTrue(any(f.wait for f in town.frames))
        self.assertEqual(barn.next_movie, "")
        self.assertEqual(moon.next_movie, "")
        self.assertEqual(town.next_movie, "")

    def test_theme_playlist_wraps_and_intro3_reaches_it(self) -> None:
        """MOVPLAY 0x40B933 links the last B node back to entry header+0x8BE."""
        intro3 = parse_reel_timeline(read_df_file(INTRO3))
        dog1 = parse_reel_timeline(read_df_file(DOG1))
        assert intro3 is not None and dog1 is not None
        # Every Dust reel with a theme loops the whole list.
        self.assertEqual(intro3.bed_wrap, 0)
        # No group B at all -> nothing to wrap.
        self.assertEqual(dog1.bed_wrap, -1)
        # Six reels run out of playlist before the picture ends, so the
        # loop is audible: INTRO by ~2 s, the LUPRE / LUSS attract reels by
        # ~59 s / ~30 s. Assert it on INTRO, which is a fixture here.
        intro = parse_reel_timeline(read_df_file(INTRO))
        assert intro is not None
        bed = [c for c in intro.clip_starts if c.channel == "B"]
        self.assertTrue(bed)
        last = max(c.start_tick + c.duration_ticks for c in bed)
        self.assertLess(last, intro.duration_ticks)

    def test_bed_wrap_cues_cover_the_reel_for_linear_consumers(self) -> None:
        """`--video` is linear, so the playlist loop must be spelled out."""
        intro = parse_reel_timeline(read_df_file(INTRO))
        dog1 = parse_reel_timeline(read_df_file(DOG1))
        assert intro is not None and dog1 is not None
        extra = bed_wrap_cues(intro)
        self.assertTrue(extra)
        self.assertTrue(all(c.channel == "B" for c in extra))
        bed = [c for c in list(intro.clip_starts) + extra if c.channel == "B"]
        end = max(c.start_tick + c.duration_ticks for c in bed)
        self.assertGreaterEqual(end, intro.duration_ticks)
        # No theme playlist -> nothing to repeat.
        self.assertEqual(bed_wrap_cues(dog1), [])

    def test_intro_does_not_chain_but_intro2_plays_intro3(self) -> None:
        """Boot names intro then intro2. intro2's last rec kind 3 is intro3.mov."""
        intro = parse_reel_timeline(read_df_file(INTRO))
        intro2 = parse_reel_timeline(read_df_file(INTRO2))
        assert intro is not None and intro2 is not None
        self.assertEqual(intro.next_movie, "")
        self.assertEqual(intro2.next_movie, "intro3.mov")

    def test_marieend_chains_finalend(self) -> None:
        if not MARIEEND.is_file():
            self.skipTest("MARIEEND.MOV not present")
        tl = parse_reel_timeline(read_df_file(MARIEEND))
        self.assertIsNotNone(tl)
        assert tl is not None
        self.assertEqual(tl.next_movie, "finalend.mov")


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
