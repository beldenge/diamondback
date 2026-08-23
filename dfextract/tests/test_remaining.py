"""Tests for Dust SET / FLT / PRP / MOV extraction."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from image import decode_indexed_image, find_palette, write_indexed_png
from mov import is_audio_container
from script import binary_script_to_text
from set import _read_star_paths, extract_set_metadata, looks_like_script, strip_frame_name, write_set_extract

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

    def test_town_second_slot_has_leroy1(self) -> None:
        """50-byte waypoint records hold two stars. town.leroy1 is slot B
        of the town.leroy2 record — not missing, and not a guessed xyz."""
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        _scenes, waypoints, _tr = extract_set_metadata(read_df_file(TOWN))
        by_name = {w.name: w for w in waypoints}
        self.assertEqual((by_name["town.leroy1"].x, by_name["town.leroy1"].y), (1740, 3536))
        self.assertEqual((by_name["town.leroy2"].x, by_name["town.leroy2"].y), (2656, 2720))
        self.assertEqual((by_name["town.blood2"].x, by_name["town.blood2"].y), (2482, 1670))
        self.assertEqual((by_name["town.jug"].x, by_name["town.jug"].y), (1730, 3476))
        names = [w.name for w in waypoints]
        self.assertEqual(names.count("town.leroy1"), 1)
        self.assertLess(names.index("town.leroy2"), names.index("town.leroy1"))
        if NITE.exists():
            nite = {w.name: w for w in extract_set_metadata(read_df_file(NITE))[1]}
            self.assertEqual((nite["town.leroy1"].x, nite["town.leroy1"].y), (1740, 3536))

    def test_nite_leroy_star_path(self) -> None:
        """Waypoint +0x18 is a SET container of {x,y,z,seg} hops, not BFS."""
        if not NITE.exists():
            self.skipTest("NITE.SET not present")
        import struct

        df = read_df_file(NITE)
        wp_id = struct.unpack_from("<h", df.containers[0].data, 34)[0]
        paths = _read_star_paths(df, wp_id)
        pair = next(p for p in paths if p.b == "town.leroy1")
        self.assertEqual(pair.a, "town.leroy2")
        self.assertEqual(pair.length, 1795)
        self.assertEqual((pair.points[0]["x"], pair.points[0]["y"]), (2656, 2720))
        self.assertEqual((pair.points[-1]["x"], pair.points[-1]["y"]), (1740, 3536))
        self.assertEqual((pair.points[-2]["x"], pair.points[-2]["y"]), (1664, 3476))

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

    def test_still_palette_forces_vga_ends(self) -> None:
        """DFET BMP: index 0 black, 255 white. Stored 255 is (0,0,0);
        without the override the O7 ox skull dumps as a black hole."""
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        df = read_df_file(TOWN)
        pal = find_palette(df.containers[0].data)
        self.assertIsNotNone(pal)
        self.assertEqual(pal.still_rgba(0)[:3], (0, 0, 0))
        self.assertEqual(pal.still_rgba(255)[:3], (255, 255, 255))
        self.assertEqual(pal.rgba(255)[:3], (0, 0, 0))
        image = decode_indexed_image(df.containers[1640 + 5].data)
        n255 = sum(1 for p in image.pixels if p == 255)
        self.assertGreater(n255, 200)
        # Skull lives in the lower-right; those 255s must paint white.
        skull = 0
        for y in range(190, 264):
            for x in range(380, 512):
                if image.pixels[y * 512 + x] == 255:
                    skull += 1
        self.assertGreater(skull, 100)

    def test_still_plte_matches_still_rgba(self) -> None:
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        pal = find_palette(read_df_file(TOWN).containers[0].data)
        self.assertIsNotNone(pal)
        assert pal is not None
        plte = pal.still_plte
        self.assertEqual(len(plte), 768)
        for index in range(256):
            red, green, blue, alpha = pal.still_rgba(index)
            base = index * 3
            self.assertEqual((plte[base], plte[base + 1], plte[base + 2]), (red, green, blue))
            self.assertEqual(alpha, 255)

    def test_indexed_png_roundtrip_matches_still_rgba(self) -> None:
        """Paletted PNG must expand to the same RGB as still_rgba, including
        VGA index 255 = white on the O7 skull frame."""
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        df = read_df_file(TOWN)
        pal = find_palette(df.containers[0].data)
        self.assertIsNotNone(pal)
        assert pal is not None
        image = decode_indexed_image(df.containers[1640 + 5].data)
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "skull.png"
            write_indexed_png(dest, image, pal)
            with Image.open(dest) as png:
                self.assertEqual(png.mode, "P")
                rgba = png.convert("RGBA").tobytes()
        expected = bytearray()
        white = 0
        for index in image.pixels:
            color = pal.still_rgba(index)
            expected.extend(color)
            if color == (255, 255, 255, 255):
                white += 1
        self.assertEqual(rgba, bytes(expected))
        self.assertGreater(white, 200)

    def test_town_stills_have_a_z_plane(self) -> None:
        """Color stream does not consume the container. Trailing RLE is Z.

        Offsets are from the Z table start (first offset = height*2).
        """
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        df = read_df_file(TOWN)
        for index in (1640, 1640 + 5, 1635):
            data = df.containers[index].data
            image = decode_indexed_image(data, decode_z=True)
            self.assertIsNotNone(image.z_pixels)
            assert image.z_pixels is not None
            self.assertEqual(len(image.z_pixels), image.width * image.height)
            depths = set(image.z_pixels)
            self.assertGreater(len(depths), 1)
            self.assertGreater(min(depths), 0)

    def test_l7_turn_wall_is_not_sky(self) -> None:
        """L7 west→north motion used to paint sky-blue speckles on the
        sheriff wall. Negative ``look`` must copy *ahead* into the prior
        framebuffer (DFET ``dst - lookUpOffset``), not skip the write."""
        if not TOWN.exists():
            self.skipTest("TOWN.SET not present")
        df = read_df_file(TOWN)
        pal = find_palette(df.containers[0].data)
        self.assertIsNotNone(pal)
        sky = {
            i
            for i in range(256)
            if pal.rgba(i)[:3] == (102, 127, 193)
        }
        self.assertTrue(sky)
        prior = None
        wall = []
        for offset in range(6):
            image = decode_indexed_image(df.containers[2866 + offset].data, prior)
            n = 0
            for y in range(55, 230):
                for x in range(0, 175):
                    if image.pixels[y * 512 + x] in sky:
                        n += 1
            wall.append(n)
            prior = image.pixels
        # Frame 0 / 5 show real sky beside the building. Motion 1–4 must not.
        self.assertLess(wall[1], 50)
        self.assertLess(wall[2], 50)
        self.assertLess(wall[3], 50)
        self.assertLess(wall[4], 50)

    def test_apoth_writes_per_strip_frames(self) -> None:
        if not APOTH.exists():
            self.skipTest("APOTH.SET not present")

        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            counts = write_set_extract(
                read_df_file(APOTH),
                dest,
                write_scripts=False,
                write_frames=True,
                write_z=True,
            )
            first = dest / "FRAMES" / "45_0.png"
            last = dest / "FRAMES" / f"{45}_5.png"
            z_first = dest / "FRAMES" / "z" / "45_0.png"
            self.assertTrue(first.exists(), first)
            self.assertTrue(last.exists(), last)
            self.assertTrue(z_first.exists(), z_first)
            self.assertGreaterEqual(counts.get("frames", 0), 28 * 5)

    def test_z_only_skips_color_pngs(self) -> None:
        if not APOTH.exists():
            self.skipTest("APOTH.SET not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            counts = write_set_extract(
                read_df_file(APOTH),
                dest,
                write_scripts=False,
                write_frames=False,
                write_z=True,
            )
            color = dest / "FRAMES" / "45_0.png"
            z_first = dest / "FRAMES" / "z" / "45_0.png"
            self.assertFalse(color.exists(), color)
            self.assertTrue(z_first.exists(), z_first)
            self.assertGreaterEqual(counts.get("z", 0), 28 * 5)

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

    def test_new_flt_keeps_mainpanel_makeface(self) -> None:
        from flt import parse_flt_flats, write_flt_extract

        new_flt = DUST / "DATA" / "NEW.FLT"
        if not new_flt.exists():
            self.skipTest("NEW.FLT not present")
        df = read_df_file(new_flt)
        flats = parse_flt_flats(df.containers[0].data)
        names = [row["name"] for row in flats.get("flats", [])]
        self.assertEqual(names, ["mainpanel", "map", "avatar", "score", "death"])
        self.assertEqual(flats["flats"][0]["script"], 2)
        text = binary_script_to_text(df.containers[2].data)
        self.assertIn("code makeface ()", text)
        self.assertIn("code noface ()", text)
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            write_flt_extract(df, dest, write_scripts=True, write_frames=False)
            main = (dest / "openflat_2.txt").read_text(encoding="utf-8")
            score = (dest / "openflat_11.txt").read_text(encoding="utf-8")
            plain = (dest / "openflat.txt").read_text(encoding="utf-8")
            self.assertIn("code makeface ()", main)
            self.assertIn("code trackbut (arg)", score)
            self.assertIn("code makeface ()", plain)
            payload = json.loads((dest / "flats.json").read_text(encoding="utf-8"))
            self.assertEqual(payload["flats"][0]["file"], "openflat_2.json")

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
