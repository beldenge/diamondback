"""Pal 0 is VGA still black; unwritten skip is the hole; written 255 is white.

Book: dfextract/docs/images.md § Pal 0 vs codec skip 255.
Do not expand unused 0xFFFF as GDI white on SET/FLT blits, do not key
pal 0, do not treat every index 255 as skip, do not remap INVEN opaque
black to white.
"""

from __future__ import annotations

import struct
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
    VGA_WHITE,
    Palette,
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


def _decode(df, container_id: int):
    return decode_trans_indices(df.containers[container_id].data)


def _indices(df, container_id: int) -> bytes:
    return _decode(df, container_id)[4]


def _assert_pal0_black_skip_trans(
    test: unittest.TestCase,
    indices: bytes,
    rgba: bytes,
    written: bytes,
    *,
    min_pal0: int = 1,
    min_skip: int = 0,
) -> None:
    pal0 = 0
    skip = 0
    white_from_pal0 = 0
    keyed_pal0 = 0
    wrote_255 = 0
    for i, index in enumerate(indices):
        red, green, blue, alpha = rgba[i * 4 : i * 4 + 4]
        if not written[i]:
            skip += 1
            test.assertEqual(alpha, 0, "codec skip (unwritten) must stay alpha 0")
            continue
        if index == TRANSPARENT_INDEX:
            wrote_255 += 1
            test.assertEqual(
                (red, green, blue, alpha),
                (255, 255, 255, 255),
                "written 255 is VGA white, not a hole",
            )
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


def _png_matches_indices(
    test: unittest.TestCase,
    path: Path,
    indices: bytes,
    written: bytes,
    width: int,
    height: int,
) -> None:
    test.assertTrue(path.exists(), path)
    with Image.open(path) as image:
        pixels = list(image.convert("RGBA").getdata())
    test.assertEqual(len(pixels), width * height, path)
    rgba = bytes(c for pixel in pixels for c in pixel)
    _assert_pal0_black_skip_trans(test, indices, rgba, written)


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
    width, height, _x, _y, indices, written = decode_trans_indices(
        df.containers[item.container].data
    )
    return sprite, indices, written, width, height, item


def _trans_container(height: int, width: int, rows: list[bytes]) -> bytes:
    """Minimal trans-sprite bytes: header + per-row (i16 size, payload)."""
    blob = struct.pack("<hhhh", height, width, 0, 0)
    for payload in rows:
        blob += struct.pack("<h", len(payload)) + payload
    return blob


class TestTransCodecWrittenMask(unittest.TestCase):
    """No Dust tree. Skip vs written 255 is the bone/ring pinhole bug."""

    def test_skip_stays_clear_written_255_is_vga_white(self) -> None:
        # 2×2: skip, write 255; copy-prev skip, write pal 0.
        # flags: skip=(count<<2)|1, unique=(count<<2)|3, prev=(count<<2).
        container = _trans_container(
            2,
            2,
            [
                bytes((5, 7, 255)),
                bytes((4, 7, 0)),
            ],
        )
        width, height, _x, _y, indices, written = decode_trans_indices(container)
        self.assertEqual((width, height), (2, 2))
        self.assertEqual(list(written), [0, 1, 0, 1])
        self.assertEqual(indices[1], 255)
        self.assertEqual(indices[3], 0)
        pal = Palette(colors=[(1, 2, 3)] * 256)
        sprite = colorize_sprite(
            width, height, 0, 0, indices, pal, written=written
        )
        self.assertEqual(sprite.rgba[0:4], b"\x00\x00\x00\x00")
        self.assertEqual(tuple(sprite.rgba[4:8]), VGA_WHITE)
        self.assertEqual(sprite.rgba[8:12], b"\x00\x00\x00\x00")
        self.assertEqual(sprite.rgba[12:16], b"\x01\x02\x03\xff")

    def test_copy_from_previous_copies_written_255(self) -> None:
        container = _trans_container(
            2,
            1,
            [
                bytes((7, 255)),
                bytes((4,)),
            ],
        )
        width, height, _x, _y, indices, written = decode_trans_indices(container)
        self.assertEqual(list(written), [1, 1])
        self.assertEqual(indices[0], 255)
        self.assertEqual(indices[1], 255)
        pal = Palette(colors=[(0, 0, 0)] * 256)
        sprite = decode_trans_sprite(container, pal)
        self.assertEqual(tuple(sprite.rgba[0:4]), VGA_WHITE)
        self.assertEqual(tuple(sprite.rgba[4:8]), VGA_WHITE)

    def test_collapsing_255_to_skip_is_the_pinhole_bug(self) -> None:
        """colorize without a written mask still keys 255 (legacy). Decode must pass the mask."""
        container = _trans_container(1, 1, [bytes((7, 255))])
        width, height, _x, _y, indices, written = decode_trans_indices(container)
        pal = Palette(colors=[(0, 0, 0)] * 256)
        punched = colorize_sprite(width, height, 0, 0, indices, pal)
        filled = colorize_sprite(
            width, height, 0, 0, indices, pal, written=written
        )
        self.assertEqual(punched.rgba[3], 0)
        self.assertEqual(tuple(filled.rgba[0:4]), VGA_WHITE)


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
        width, height, x, y, indices, written = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(
            width, height, x, y, indices, pal, written=written
        )
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, written, min_pal0=200, min_skip=1000
        )

    def test_yunnibook_pal0_is_grain_not_salt(self) -> None:
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        item = _catalog_item(df, "Yunnibook", "large")
        pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        assert pal is not None
        width, height, x, y, indices, written = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(
            width, height, x, y, indices, pal, written=written
        )
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, written, min_pal0=50
        )

    def test_helpbut_pal0_is_opaque_letter_counters_are_cream(self) -> None:
        """HELP P hole is cream (idx 249), not pal 0 and not a knockout."""
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        item = _catalog_item(df, "helpbut", "large")
        pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        assert pal is not None
        width, height, x, y, indices, written = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(
            width, height, x, y, indices, pal, written=written
        )
        pal0 = sum(1 for i, index in enumerate(indices) if written[i] and index == 0)
        skip = sum(1 for flag in written if not flag)
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
        sprite, indices, written, _w, _h, _item = _house_door_sprite("court")
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, written, min_pal0=1000
        )
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
        sprite, indices, written, _w, _h, _item = _house_door_sprite("rice")
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, written, min_pal0=100
        )

    def test_padreout_door_pal0_is_black(self) -> None:
        if not HOUSE.exists():
            self.skipTest("HOUSE.PRP not present")
        sprite, indices, written, _w, _h, _item = _house_door_sprite("padreout")
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, written, min_pal0=1000
        )

    def test_padre_door_nitescho_not_school_gray(self) -> None:
        """Night-only overlay. Plain NITESCHO expand; do not recolor.

        `lockpadre` is `day < 4` or `clock < 3`. Dust only blits this on
        NITESCHO. Unlocked daytime school is tan; the dark inward photo
        looks out of place — leave it. SCHOOL pal 22/32 is classroom gray
        (the inverted slab). `schoolout` has `schooloutnite`; padre does
        not. Skip/crush/hue-finish are dead ends. Dest is play, not extract.
        """
        if not HOUSE.exists():
            self.skipTest("HOUSE.PRP not present")
        self.assertEqual(DOOR_VIEW_SET["padre"], "NITESCHO")
        self.assertEqual(DOOR_VIEW_SET["padreout"], "PADRE")
        self.assertEqual(DOOR_VIEW_SET["schoolout"], "SCHOOL")
        self.assertEqual(DOOR_VIEW_SET["schooloutnite"], "NITESCHO")
        self.assertNotIn("padrenite", DOOR_VIEW_SET)
        sprite, indices, written, width, height, item = _house_door_sprite("padre")
        self.assertEqual(item.container, 649)
        padreout, *_rest = _house_door_sprite("padreout")
        self.assertNotEqual(sprite.rgba, padreout.rgba)
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, written, min_pal0=1000
        )
        nitescho = _palette_from_header(DATA / "NITESCHO.SET", unused_rgb=(0, 0, 0))
        school = _palette_from_header(DATA / "SCHOOL.SET", unused_rgb=(0, 0, 0))
        assert nitescho is not None and school is not None
        night = colorize_sprite(
            width, height, 0, 0, indices, nitescho, written=written
        )
        washed = colorize_sprite(
            width, height, 0, 0, indices, school, written=written
        )
        self.assertEqual(sprite.rgba, night.rgba)

        def luma(rgba: bytes) -> float:
            total = 0.0
            n = 0
            for i in range(0, len(rgba), 4):
                if rgba[i + 3] < 255:
                    continue
                total += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
                n += 1
            return total / n if n else 0.0

        self.assertLess(luma(sprite.rgba), luma(washed.rgba) - 15)
        holes = sum(1 for a in sprite.rgba[3::4] if a == 0)
        self.assertEqual(holes, 0, "skip holes showed the closed doorknob")
        self.assertEqual(nitescho.colors[22], (8, 6, 8))
        self.assertEqual(school.colors[22], (86, 78, 68))
        found22 = False
        for i, index in enumerate(indices):
            if not written[i] or index != 22:
                continue
            self.assertEqual(
                sprite.rgba[i * 4 : i * 4 + 3],
                bytes((8, 6, 8)),
                "hue-finish to padreout (8,7,8) is a dead end",
            )
            found22 = True
            break
        self.assertTrue(found22)
        dump = OUT / "PRP" / "_HOUSE" / "FRAMES" / "door" / "padre" / "00_c649.png"
        if dump.exists():
            _png_matches_indices(self, dump, indices, written, width, height)
            with Image.open(dump) as image:
                dumped = bytes(c for pixel in image.convert("RGBA").getdata() for c in pixel)
            self.assertEqual(dumped, sprite.rgba, "re-extract HOUSE door/padre")

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
        width, height, _x, _y, indices, written = decode_trans_indices(
            df.containers[item.container].data
        )
        _assert_pal0_black_skip_trans(
            self, indices, sprite.rgba, written, min_pal0=10
        )

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
        width, height, x, y, indices, written = decode_trans_indices(
            df.containers[112].data
        )
        sprite = colorize_sprite(
            width, height, x, y, indices, palette, written=written
        )
        pal0 = sum(1 for i, index in enumerate(indices) if written[i] and index == 0)
        self.assertGreater(pal0, 100)
        for i, index in enumerate(indices):
            if written[i] and index == 0:
                self.assertEqual(sprite.rgba[i * 4 : i * 4 + 4], b"\x00\x00\x00\xff")

    def test_ace_does_not_sample_pal0_cream_is_flt(self) -> None:
        if not SALGAMES.exists():
            self.skipTest("SALGAMES.PRP not present")
        df = read_df_file(SALGAMES)
        item = _catalog_item(df, "ah", "full")
        _w, _h, _x, _y, indices, written = _decode(df, item.container)
        pal0 = sum(1 for i, index in enumerate(indices) if written[i] and index == 0)
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
        # A few written-255 VGA whites on the paper; not unused-pal wash.
        self.assertLess(white, 20)

    def test_bone_written_255_is_white_highlight_not_a_hole(self) -> None:
        """Bone/large writes index 255 twelve times on the cream ridge.

        Treating every 255 as skip punched HUD leather through the bone.
        Unwritten skip stays the silhouette; written 255 is VGA white.
        """
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        item = _catalog_item(df, "Bone", "large")
        pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        assert pal is not None
        width, height, x, y, indices, written = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(
            width, height, x, y, indices, pal, written=written
        )
        wrote_255 = 0
        skip = 0
        for i, index in enumerate(indices):
            alpha = sprite.rgba[i * 4 + 3]
            if not written[i]:
                skip += 1
                self.assertEqual(alpha, 0)
                continue
            if index == TRANSPARENT_INDEX:
                wrote_255 += 1
                self.assertEqual(sprite.rgba[i * 4 : i * 4 + 4], b"\xff\xff\xff\xff")
        self.assertEqual(wrote_255, 12)
        self.assertGreater(skip, 400)

    def test_ring_center_is_skip_band_highlights_are_written_255(self) -> None:
        """Ring/large finger hole is unwritten; eight band pixels write 255."""
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        item = _catalog_item(df, "Ring", "large")
        pal = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        assert pal is not None
        width, height, x, y, indices, written = decode_trans_indices(
            df.containers[item.container].data
        )
        sprite = colorize_sprite(
            width, height, x, y, indices, pal, written=written
        )
        wrote_255 = 0
        skip = 0
        cx, cy = width // 2, height // 2
        self.assertFalse(written[cy * width + cx], "ring center must be skip")
        self.assertEqual(sprite.rgba[(cy * width + cx) * 4 + 3], 0)
        for i, index in enumerate(indices):
            if not written[i]:
                skip += 1
                continue
            if index == TRANSPARENT_INDEX:
                wrote_255 += 1
                self.assertEqual(sprite.rgba[i * 4 : i * 4 + 4], b"\xff\xff\xff\xff")
        self.assertEqual(wrote_255, 8)
        self.assertGreater(skip, 1000)

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
            gw, gh, _x, _y, gidx, gwritten = decode_trans_indices(
                df_i.containers[gun_item.container].data
            )
            _png_matches_indices(self, gun, gidx, gwritten, gw, gh)
            df_h = read_df_file(HUB)
            sk_item = _catalog_item(df_h, "skeleton1", "stand")
            sw, sh, _x, _y, sidx, swritten = decode_trans_indices(
                df_h.containers[sk_item.container].data
            )
            _png_matches_indices(self, skel, sidx, swritten, sw, sh)

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
                OUT / "PRP" / "_HOUSE" / "FRAMES" / "door" / "padre" / "00_c649.png",
                HOUSE,
                "door",
                "padre",
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
            width, height, _x, _y, indices, written = decode_trans_indices(
                df.containers[item.container].data
            )
            _png_matches_indices(self, path, indices, written, width, height)

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
        # A few written-255 VGA whites on the paper; not unused-pal wash.
        self.assertLess(white, 20)

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

    def test_committed_ring_and_bone_keep_skip_and_written_255(self) -> None:
        """Stale dump that keyed every 255 would punch the bone ridge and ring band."""
        ring_png = OUT / "PRP" / "_INVEN" / "FRAMES" / "Ring" / "large" / "00_c20.png"
        bone_png = OUT / "PRP" / "_INVEN" / "FRAMES" / "Bone" / "large" / "00_c12.png"
        if not ring_png.exists() or not bone_png.exists():
            self.skipTest("INVEN frames not dumped")
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        for path, group, state, expect_255, expect_center_skip in (
            (ring_png, "Ring", "large", 8, True),
            (bone_png, "Bone", "large", 12, False),
        ):
            item = _catalog_item(df, group, state)
            width, height, _x, _y, indices, written = decode_trans_indices(
                df.containers[item.container].data
            )
            with Image.open(path) as image:
                pixels = list(image.convert("RGBA").getdata())
            wrote = 0
            for i, index in enumerate(indices):
                if written[i] and index == TRANSPARENT_INDEX:
                    wrote += 1
                    self.assertEqual(
                        pixels[i][:4],
                        (255, 255, 255, 255),
                        f"{group} written 255 must be opaque white in the dump",
                    )
                if not written[i]:
                    self.assertEqual(pixels[i][3], 0, f"{group} skip must stay a hole")
            self.assertEqual(wrote, expect_255)
            if expect_center_skip:
                cx, cy = width // 2, height // 2
                self.assertFalse(written[cy * width + cx])
                self.assertEqual(pixels[cy * width + cx][3], 0)


if __name__ == "__main__":
    unittest.main()
