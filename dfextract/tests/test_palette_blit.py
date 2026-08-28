"""Pal 0 is VGA still black; codec skip 255 is the hole.

Book: dfextract/docs/images.md § Pal 0 vs codec skip 255.
Do not expand unused 0xFFFF as GDI white on SET/FLT blits, do not key
pal 0, do not remap INVEN opaque black to white.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from container import read_df_file
from cst import (
    companion_set_path,
    cst_frame_palette,
    cst_palette_misses_sprites,
    write_cst_frames,
)
from image import (
    TRANSPARENT_INDEX,
    colorize_sprite,
    cst_palette,
    decode_trans_indices,
    decode_trans_sprite,
    find_palette,
)
from prp import (
    DOOR_VIEW_SET,
    _colorize_trans,
    _companion_flt_palette,
    _companion_set_palette,
    _palette_from_header,
    parse_prp_catalog,
    write_prp_extract,
)

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
DATA = DUST / "DUSTCD" / "DATA"
UNDER = DUST / "DUSTCD" / "UNDER"
HOUSE = DATA / "HOUSE.PRP"
INVEN = DATA / "INVEN.PRP"
GANG = DATA / "GANG.CST"
MINE = UNDER / "MINE.CST"
HUB = UNDER / "HUB.PRP"
SALGAMES = DUST / "DUSTCD" / "SALGAMES" / "SALGAMES.PRP"
OUT = HERE / "out"


def _catalog_item(df, group: str, state: str, index: int = 0):
    return next(
        item
        for item in parse_prp_catalog(df)
        if item.group.lower() == group.lower()
        and item.state.lower() == state.lower()
        and item.index_in_state == index
    )


def _indices(df, container_id: int) -> bytes:
    return decode_trans_indices(df.containers[container_id].data)[4]


def _assert_pal0_black_skip_trans(
    test: unittest.TestCase,
    indices: bytes,
    rgba: bytes,
    *,
    min_pal0: int = 1,
    min_skip: int = 0,
) -> None:
    pal0 = 0
    skip = 0
    white_from_pal0 = 0
    keyed_pal0 = 0
    for i, index in enumerate(indices):
        red, green, blue, alpha = rgba[i * 4 : i * 4 + 4]
        if index == TRANSPARENT_INDEX:
            skip += 1
            test.assertEqual(alpha, 0, "codec skip 255 must stay alpha 0")
            continue
        if index == 0:
            pal0 += 1
            if alpha == 0:
                keyed_pal0 += 1
            if (red, green, blue, alpha) == (255, 255, 255, 255):
                white_from_pal0 += 1
            test.assertEqual(
                (red, green, blue, alpha),
                (0, 0, 0, 255),
                "pal 0 is VGA black, not white and not a knockout",
            )
    test.assertGreaterEqual(pal0, min_pal0, "expected written pal 0 pixels")
    test.assertGreaterEqual(skip, min_skip, "expected codec-skip hole")
    test.assertEqual(white_from_pal0, 0)
    test.assertEqual(keyed_pal0, 0)


def _png_matches_indices(test: unittest.TestCase, path: Path, indices: bytes, width: int, height: int) -> None:
    test.assertTrue(path.exists(), path)
    with Image.open(path) as image:
        pixels = list(image.convert("RGBA").getdata())
    test.assertEqual(len(pixels), width * height, path)
    rgba = bytes(c for pixel in pixels for c in pixel)
    _assert_pal0_black_skip_trans(test, indices, rgba)


def _house_door_sprite(state: str):
    df = read_df_file(HOUSE)
    item = _catalog_item(df, "door", state)
    house_pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
    assert house_pal is not None
    stem = DOOR_VIEW_SET[state.lower()]
    set_pal = _palette_from_header(DATA / f"{stem}.SET", unused_rgb=(0, 0, 0))
    sprite = _colorize_trans(
        df.containers[item.container].data, house_pal, set_pal, []
    )
    width, height, _x, _y, indices = decode_trans_indices(
        df.containers[item.container].data
    )
    return sprite, indices, width, height, item


class TestPaletteBlit(unittest.TestCase):
    def test_gdi_unused_default_is_white_still_blit_passes_black(self) -> None:
        """find_palette() documents GDI sar-8 white. Sprite paths pass black."""
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        data = read_df_file(INVEN).containers[0].data
        gdi = find_palette(data)
        blit = find_palette(data, unused_rgb=(0, 0, 0))
        assert gdi is not None and blit is not None
        self.assertEqual(gdi.colors[0], (255, 255, 255))
        self.assertEqual(blit.colors[0], (0, 0, 0))
        town = DATA / "TOWN.SET"
        if town.is_file():
            set_pal = _palette_from_header(town)
            assert set_pal is not None
            self.assertEqual(set_pal.colors[0], (0, 0, 0))

    def test_gun_pal0_is_opaque_black_skip_is_outline(self) -> None:
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        item = _catalog_item(df, "Gun", "large")
        pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        assert pal is not None
        width, height, x, y, indices = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(width, height, x, y, indices, pal)
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, min_pal0=200, min_skip=1000
        )
        white = sum(
            1
            for i in range(0, len(sprite.rgba), 4)
            if sprite.rgba[i : i + 4] == b"\xff\xff\xff\xff"
        )
        self.assertEqual(white, 0)

    def test_yunnibook_pal0_is_grain_not_salt(self) -> None:
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        item = _catalog_item(df, "Yunnibook", "large")
        pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        assert pal is not None
        width, height, x, y, indices = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(width, height, x, y, indices, pal)
        _assert_pal0_black_skip_trans(self, indices, sprite.rgba, min_pal0=50)

    def test_helpbut_pal0_is_opaque_letter_counters_are_cream(self) -> None:
        """HELP P hole is cream (idx 249), not pal 0 and not a knockout."""
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        item = _catalog_item(df, "helpbut", "large")
        pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        assert pal is not None
        width, height, x, y, indices = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(width, height, x, y, indices, pal)
        pal0 = sum(1 for index in indices if index == 0)
        skip = sum(1 for index in indices if index == TRANSPARENT_INDEX)
        self.assertGreater(pal0, 10)
        self.assertEqual(skip, 0)
        cream = 0
        for i, index in enumerate(indices):
            if index == 0:
                self.assertEqual(sprite.rgba[i * 4 : i * 4 + 4], b"\x00\x00\x00\xff")
            if sprite.rgba[i * 4 : i * 4 + 3] == bytes((255, 237, 198)):
                cream += 1
        self.assertGreater(cream, 100)

    def test_court_door_pal0_is_black_not_whitewash(self) -> None:
        if not HOUSE.exists():
            self.skipTest("HOUSE.PRP not present")
        sprite, indices, _w, _h, _item = _house_door_sprite("court")
        _assert_pal0_black_skip_trans(self, indices, sprite.rgba, min_pal0=1000)
        chroma = sum(
            1
            for i in range(0, len(sprite.rgba), 4)
            if sprite.rgba[i + 3]
            and sprite.rgba[i : i + 3] not in (b"\x00\x00\x00", b"\xff\xff\xff")
        )
        self.assertGreater(chroma, 500, "SET recolor lost; silhouette")

    def test_rice_door_pal0_is_black_flecks(self) -> None:
        if not HOUSE.exists():
            self.skipTest("HOUSE.PRP not present")
        sprite, indices, _w, _h, _item = _house_door_sprite("rice")
        _assert_pal0_black_skip_trans(self, indices, sprite.rgba, min_pal0=100)

    def test_padreout_door_pal0_is_black(self) -> None:
        if not HOUSE.exists():
            self.skipTest("HOUSE.PRP not present")
        sprite, indices, _w, _h, _item = _house_door_sprite("padreout")
        _assert_pal0_black_skip_trans(self, indices, sprite.rgba, min_pal0=1000)

    def test_hub_skeleton_uses_set_pal_pal0_black(self) -> None:
        if not HUB.exists():
            self.skipTest("HUB.PRP not present")
        df = read_df_file(HUB)
        item = _catalog_item(df, "skeleton1", "stand")
        house_pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        set_pal = _companion_set_palette(HUB)
        assert house_pal is not None and set_pal is not None
        sprite = _colorize_trans(
            df.containers[item.container].data, house_pal, set_pal, []
        )
        width, height, _x, _y, indices = decode_trans_indices(
            df.containers[item.container].data
        )
        _assert_pal0_black_skip_trans(self, indices, sprite.rgba, min_pal0=10)
        white = sum(
            1
            for i in range(0, len(sprite.rgba), 4)
            if sprite.rgba[i : i + 4] == b"\xff\xff\xff\xff"
        )
        self.assertEqual(white, 0)

    def test_mine_companion_set_wins_even_when_cst_pal_is_a_full_cube(self) -> None:
        if not MINE.exists():
            self.skipTest("MINE.CST not present")
        df = read_df_file(MINE)
        cube = cst_palette(df.containers[0].data)
        self.assertEqual(cube.colors[79][1], 204)
        self.assertFalse(cst_palette_misses_sprites(df, cube))
        self.assertIsNotNone(companion_set_path(MINE))
        palette = cst_frame_palette(df)
        self.assertNotEqual(palette.colors[79], cube.colors[79])
        sprite = decode_trans_sprite(df.containers[3].data, palette)
        cyan = 0
        rust = 0
        white = 0
        opaque = 0
        for i in range(0, len(sprite.rgba), 4):
            red, green, blue, alpha = sprite.rgba[i : i + 4]
            if alpha < 255:
                continue
            opaque += 1
            if (red, green, blue) == (255, 255, 255):
                white += 1
            if red > 140 and green > 180 and blue > 180:
                cyan += 1
            if 20 <= red <= 90 and green < 40 and blue < 20:
                rust += 1
        self.assertGreater(opaque, 1000)
        self.assertEqual(cyan, 0)
        self.assertGreater(rust, 500)
        self.assertEqual(white, 0)

    def test_gang_has_no_companion_set_help_legs_stay_pal0_black(self) -> None:
        if not GANG.exists():
            self.skipTest("GANG.CST not present")
        self.assertIsNone(companion_set_path(GANG))
        df = read_df_file(GANG)
        palette = cst_frame_palette(df)
        self.assertEqual(palette.colors[0], (0, 0, 0))
        width, height, x, y, indices = decode_trans_indices(df.containers[112].data)
        sprite = colorize_sprite(width, height, x, y, indices, palette)
        pal0 = sum(1 for index in indices if index == 0)
        self.assertGreater(pal0, 100)
        for i, index in enumerate(indices):
            if index == 0:
                self.assertEqual(sprite.rgba[i * 4 : i * 4 + 4], b"\x00\x00\x00\xff")

    def test_ace_does_not_sample_pal0_cream_is_flt(self) -> None:
        if not SALGAMES.exists():
            self.skipTest("SALGAMES.PRP not present")
        df = read_df_file(SALGAMES)
        item = _catalog_item(df, "ah", "full")
        indices = _indices(df, item.container)
        pal0 = sum(1 for index in indices if index == 0)
        self.assertEqual(pal0, 0)
        flt = _companion_flt_palette(SALGAMES)
        prp = find_palette(df.containers[0].data, unused_rgb=(255, 255, 255))
        assert flt is not None and prp is not None
        self.assertEqual(flt.colors[3], (255, 255, 198))
        self.assertEqual(flt.colors[4], (255, 255, 189))
        self.assertEqual(prp.colors[3], (255, 255, 255))
        sprite = decode_trans_sprite(df.containers[item.container].data, flt)
        cream = 0
        white = 0
        for i in range(0, len(sprite.rgba), 4):
            if not sprite.rgba[i + 3]:
                continue
            rgb = tuple(sprite.rgba[i : i + 3])
            if rgb == (255, 255, 255):
                white += 1
            if rgb in ((255, 255, 198), (255, 255, 189)):
                cream += 1
        self.assertGreater(cream, 1000)
        self.assertEqual(white, 0)

    def test_write_inven_and_hub_keep_pal0_black(self) -> None:
        if not INVEN.exists() or not HUB.exists():
            self.skipTest("INVEN/HUB not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            write_prp_extract(
                read_df_file(INVEN), dest / "inven", write_scripts=False, write_frames=True
            )
            write_prp_extract(
                read_df_file(HUB), dest / "hub", write_scripts=False, write_frames=True
            )
            gun = dest / "inven" / "FRAMES" / "Gun" / "large" / "00_c407.png"
            skel = dest / "hub" / "FRAMES" / "skeleton1" / "stand" / "00_c67.png"
            df_i = read_df_file(INVEN)
            gun_item = _catalog_item(df_i, "Gun", "large")
            gw, gh, _x, _y, gidx = decode_trans_indices(
                df_i.containers[gun_item.container].data
            )
            _png_matches_indices(self, gun, gidx, gw, gh)
            df_h = read_df_file(HUB)
            sk_item = _catalog_item(df_h, "skeleton1", "stand")
            sw, sh, _x, _y, sidx = decode_trans_indices(
                df_h.containers[sk_item.container].data
            )
            _png_matches_indices(self, skel, sidx, sw, sh)

    def test_write_mine_stand_is_rust_not_cube(self) -> None:
        if not MINE.exists():
            self.skipTest("MINE.CST not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            write_cst_frames(read_df_file(MINE), dest)
            path = dest / "skeleton" / "stand" / "frame_3.png"
            self.assertTrue(path.exists(), path)
            cyan = 0
            rust = 0
            white = 0
            with Image.open(path) as image:
                for pixel in image.convert("RGBA").getdata():
                    red, green, blue, alpha = pixel
                    if not alpha:
                        continue
                    if (red, green, blue) == (255, 255, 255):
                        white += 1
                    if red > 140 and green > 180 and blue > 180:
                        cyan += 1
                    if 20 <= red <= 90 and green < 40 and blue < 20:
                        rust += 1
            self.assertEqual(cyan, 0)
            self.assertGreater(rust, 500)
            self.assertEqual(white, 0)

    def test_committed_dumps_are_not_stale_salt(self) -> None:
        samples = (
            (
                OUT / "PRP" / "_INVEN" / "FRAMES" / "Gun" / "large" / "00_c407.png",
                INVEN,
                "Gun",
                "large",
            ),
            (
                OUT / "PRP" / "_INVEN" / "FRAMES" / "Yunnibook" / "large" / "00_c304.png",
                INVEN,
                "Yunnibook",
                "large",
            ),
            (
                OUT / "PRP" / "_HOUSE" / "FRAMES" / "door" / "court" / "00_c659.png",
                HOUSE,
                "door",
                "court",
            ),
            (
                OUT / "PRP" / "_HOUSE" / "FRAMES" / "door" / "rice" / "00_c609.png",
                HOUSE,
                "door",
                "rice",
            ),
            (
                OUT / "PRP" / "_HOUSE" / "FRAMES" / "door" / "padreout" / "00_c655.png",
                HOUSE,
                "door",
                "padreout",
            ),
            (
                OUT / "PRP" / "_HUB" / "FRAMES" / "skeleton1" / "stand" / "00_c67.png",
                HUB,
                "skeleton1",
                "stand",
            ),
        )
        if not all(path.exists() for path, *_rest in samples):
            self.skipTest("committed PRP frames not dumped")
        for path, src, group, state in samples:
            df = read_df_file(src)
            item = _catalog_item(df, group, state)
            width, height, _x, _y, indices = decode_trans_indices(
                df.containers[item.container].data
            )
            _png_matches_indices(self, path, indices, width, height)

    def test_committed_mine_stand_is_not_rainbow(self) -> None:
        path = OUT / "CST" / "_MINE" / "skeleton" / "stand" / "frame_3.png"
        if not path.exists():
            self.skipTest("MINE frames not dumped")
        cyan = 0
        rust = 0
        white = 0
        with Image.open(path) as image:
            for pixel in image.convert("RGBA").getdata():
                red, green, blue, alpha = pixel
                if not alpha:
                    continue
                if (red, green, blue) == (255, 255, 255):
                    white += 1
                if red > 140 and green > 180 and blue > 180:
                    cyan += 1
                if 20 <= red <= 90 and green < 40 and blue < 20:
                    rust += 1
        self.assertEqual(cyan, 0, "stale RGB-cube dump")
        self.assertGreater(rust, 500)
        self.assertEqual(white, 0)

    def test_committed_ace_is_flt_cream_not_unused_white(self) -> None:
        path = OUT / "PRP" / "_SALGAMES" / "FRAMES" / "ah" / "full" / "00_c3.png"
        if not path.exists():
            self.skipTest("SALGAMES frames not dumped")
        cream = 0
        white = 0
        with Image.open(path) as image:
            for pixel in image.convert("RGBA").getdata():
                red, green, blue, alpha = pixel
                if not alpha:
                    continue
                if (red, green, blue) == (255, 255, 255):
                    white += 1
                if (red, green, blue) in ((255, 255, 198), (255, 255, 189)):
                    cream += 1
        self.assertGreater(cream, 1000)
        self.assertEqual(white, 0)

    def test_committed_reader_and_bevel_holes_are_codec_skip(self) -> None:
        bords = (
            OUT / "PRP" / "_HOUSE" / "FRAMES" / "yunnibord" / "base" / "00_c557.png",
            OUT / "PRP" / "_HOUSE" / "FRAMES" / "butbevel" / "base" / "00_c66.png",
        )
        if not all(path.exists() for path in bords):
            self.skipTest("HOUSE frames not dumped")
        with Image.open(bords[0]) as image:
            hole = image.convert("RGBA").getpixel((256, 192))
        self.assertEqual(hole[3], 0)
        with Image.open(bords[1]) as image:
            mid = image.convert("RGBA").getpixel((36, 11))
        self.assertEqual(mid[3], 0)


if __name__ == "__main__":
    unittest.main()
