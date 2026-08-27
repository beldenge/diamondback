"""PUP/CST transparent-sprite decode and write checks."""

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
from cst import cst_frame_palette, detect_contact_shadows, write_cst_frames
from image import (
    CONTACT_SHADOW_ALPHA,
    cst_palette,
    decode_trans_sprite,
    find_palette,
    pup_palette,
)
from prp import parse_prp_catalog, write_prp_extract
from pup import write_pup_frames

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
BOLIVAR = DUST / "DUSTCD" / "PUPPETS" / "BOLIVAR.PUP"
EXTRA = DUST / "DUSTCD" / "DATA" / "EXTRA.CST"
GANG = DUST / "DUSTCD" / "DATA" / "GANG.CST"
TARGET_CST = DUST / "DUSTCD" / "TARGET" / "TARGET.CST"
INVEN = DUST / "DUSTCD" / "DATA" / "INVEN.PRP"
HOUSE = DUST / "DUSTCD" / "DATA" / "HOUSE.PRP"
SALGAMES = DUST / "DUSTCD" / "SALGAMES" / "SALGAMES.PRP"


class TestFrames(unittest.TestCase):
    def test_bolivar_background_decodes(self) -> None:
        if not BOLIVAR.exists():
            self.skipTest("BOLIVAR.PUP not present")
        df = read_df_file(BOLIVAR)
        sprite = decode_trans_sprite(df.containers[4].data, pup_palette(df.containers[0].data))
        self.assertEqual((sprite.width, sprite.height), (512, 264))
        self.assertEqual(len(sprite.rgba), 512 * 264 * 4)
        self.assertGreater(sum(1 for byte in sprite.rgba if byte), 1000)
        self.assertEqual(sprite.pos_x, 0)
        self.assertEqual(sprite.pos_y, 60)

    def test_write_bolivar_frame_count(self) -> None:
        if not BOLIVAR.exists():
            self.skipTest("BOLIVAR.PUP not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            written = write_pup_frames(read_df_file(BOLIVAR), dest)
            background = dest / "FRAMES" / "Background" / "frame_4.png"
            self.assertTrue(background.exists())
            sidecar = dest / "FRAMES" / "sprites.json"
            self.assertTrue(sidecar.exists())
            payload = json.loads(sidecar.read_text(encoding="utf-8"))
            self.assertIn("Background", payload["layers"])
            self.assertEqual(payload["layers"]["Background"][0]["y"], 60)
            self.assertEqual(payload["still"], [512, 264])
            rest = payload.get("rest") or {}
            if rest:
                self.assertEqual(rest["Background"], [256, 132])
            rest_layers = payload.get("restLayers") or {}
            if rest_layers:
                self.assertGreaterEqual(rest_layers["Hands 1"], 0)
        self.assertEqual(written, 58)

    def test_leroy_foot_matte_is_contact_shadow(self) -> None:
        if not GANG.exists():
            self.skipTest("GANG.CST not present")
        df = read_df_file(GANG)
        palette = cst_palette(df.containers[0].data)
        shadows = detect_contact_shadows(df, palette, [68])
        self.assertIn(131, shadows)
        sprite = decode_trans_sprite(df.containers[68].data, palette, shadows)
        opaque = 0
        shadow = 0
        for i in range(0, len(sprite.rgba), 4):
            red, green, blue, alpha = sprite.rgba[i : i + 4]
            if alpha == 0:
                continue
            if (
                red == 0
                and green == 0
                and blue == 0
                and alpha == CONTACT_SHADOW_ALPHA
            ):
                shadow += 1
            elif alpha == 255:
                opaque += 1
        self.assertGreater(shadow, 700)
        self.assertGreater(opaque, 4000)
        # Chest/skin stays fully opaque — not the maroon pancake.
        mid = sprite.height // 2
        row = sprite.rgba[mid * sprite.width * 4 : (mid + 1) * sprite.width * 4]
        maroon = 0
        cheek = 0
        for i in range(0, len(row), 4):
            if row[i : i + 3] == b"\x19\x11\x11" and row[i + 3] == 255:
                maroon += 1
            if (
                row[i : i + 3] == b"\x00\x00\x00"
                and row[i + 3] == CONTACT_SHADOW_ALPHA
            ):
                cheek += 1
        self.assertEqual(maroon, 0)
        self.assertEqual(cheek, 0)

    def test_help_robe_is_opaque(self) -> None:
        """Help's changshan is index 0 black. That is clothes, not a matte."""
        if not GANG.exists():
            self.skipTest("GANG.CST not present")
        df = read_df_file(GANG)
        palette = cst_palette(df.containers[0].data)
        # stand frames 112–113 — same slice write_cst_frames uses
        shadows = detect_contact_shadows(df, palette, [112, 113])
        self.assertNotIn(0, shadows)
        self.assertIn(131, shadows)
        sprite = decode_trans_sprite(df.containers[112].data, palette, shadows)
        opaque = 0
        shadow = 0
        for i in range(0, len(sprite.rgba), 4):
            red, green, blue, alpha = sprite.rgba[i : i + 4]
            if alpha == 0:
                continue
            if (
                red == 0
                and green == 0
                and blue == 0
                and alpha == CONTACT_SHADOW_ALPHA
            ):
                shadow += 1
            elif alpha == 255:
                opaque += 1
        self.assertGreater(opaque, 3600)
        self.assertGreater(shadow, 20)
        self.assertLess(shadow, 200)
        # Waist/robe stays solid — the old key made the lower coat alpha 120.
        mid = sprite.height // 2
        row = sprite.rgba[mid * sprite.width * 4 : (mid + 1) * sprite.width * 4]
        ghost = 0
        for i in range(0, len(row), 4):
            if row[i + 3] == CONTACT_SHADOW_ALPHA:
                ghost += 1
            elif 0 < row[i + 3] < 255:
                ghost += 1
        self.assertEqual(ghost, 0)
        lower = (sprite.height * 3) // 4
        coat = sprite.rgba[lower * sprite.width * 4 : (lower + 1) * sprite.width * 4]
        coat_opaque = 0
        coat_shadow = 0
        for i in range(0, len(coat), 4):
            if coat[i + 3] == 255:
                coat_opaque += 1
            elif coat[i + 3] == CONTACT_SHADOW_ALPHA:
                coat_shadow += 1
        self.assertGreater(coat_opaque, coat_shadow)

    def test_extra_jenix_stand_writes(self) -> None:
        if not EXTRA.exists():
            self.skipTest("EXTRA.CST not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            written = write_cst_frames(read_df_file(EXTRA), dest)
            ours = dest / "Jenix" / "stand" / "frame_195.png"
            self.assertTrue(ours.exists())
            with Image.open(ours) as image:
                self.assertGreater(image.size[0], 0)
                self.assertGreater(image.size[1], 0)
            sidecar = json.loads((dest / "sprites.json").read_text(encoding="utf-8"))
            dog0 = sidecar["actors"]["dog"]["stand"][0]
            dog2 = sidecar["actors"]["dog"]["stand"][2]
            self.assertEqual(dog0["deg"], 0)
            self.assertEqual(dog0["pose"], 0)
            self.assertEqual(dog2["deg"], 32)
        self.assertGreater(written, 100)

    def test_target_cst_uses_set_palette(self) -> None:
        """TARGET plates index-blit with TARGET.SET, not CST pal 36 unused-black."""
        if not TARGET_CST.exists():
            self.skipTest("TARGET.CST not present")
        df = read_df_file(TARGET_CST)
        palette = cst_frame_palette(df)
        sprite = decode_trans_sprite(df.containers[7].data, palette)
        colors = {}
        for i in range(0, len(sprite.rgba), 4):
            red, green, blue, alpha = sprite.rgba[i : i + 4]
            if alpha < 255:
                continue
            colors[(red, green, blue)] = colors.get((red, green, blue), 0) + 1
        self.assertGreater(len(colors), 5)
        black = colors.get((0, 0, 0), 0)
        self.assertLess(black / max(1, sum(colors.values())), 0.5)

    def test_target_crows_are_black_not_set_unused_white(self) -> None:
        """birdtarg bodies are pal 0. SET unused-white made them blank."""
        if not TARGET_CST.exists():
            self.skipTest("TARGET.CST not present")
        df = read_df_file(TARGET_CST)
        sprite = decode_trans_sprite(df.containers[261].data, cst_frame_palette(df))
        black = 0
        white = 0
        opaque = 0
        for i in range(0, len(sprite.rgba), 4):
            red, green, blue, alpha = sprite.rgba[i : i + 4]
            if alpha < 255:
                continue
            opaque += 1
            if (red, green, blue) == (0, 0, 0):
                black += 1
            if (red, green, blue) == (255, 255, 255):
                white += 1
        self.assertGreater(opaque, 400)
        self.assertGreater(black / opaque, 0.7)
        self.assertLess(white / opaque, 0.05)

    def test_inven_index_0_is_white_not_a_hole(self) -> None:
        """DF.EXE 0x423e59 sar-8 of unused 0xFFFF is white, not a knockout.

        Pal 0 is sampled (HELP counters, gun flecks). Codec skip stays
        alpha 0 (gun outline). CST Help legs stay unused→black
        (SET VGA index 0).
        """
        if not INVEN.exists():
            self.skipTest("INVEN.PRP not present")
        df = read_df_file(INVEN)
        palette = find_palette(df.containers[0].data)
        assert palette is not None
        self.assertEqual(palette.colors[0], (255, 255, 255))
        gun = decode_trans_sprite(df.containers[407].data, palette)
        white = 0
        opaque_black = 0
        trans = 0
        for i in range(0, len(gun.rgba), 4):
            red, green, blue, alpha = gun.rgba[i : i + 4]
            if (red, green, blue, alpha) == (255, 255, 255, 255):
                white += 1
            if (red, green, blue, alpha) == (0, 0, 0, 255):
                opaque_black += 1
            if alpha == 0:
                trans += 1
        self.assertGreater(white, 200)
        self.assertEqual(opaque_black, 0)
        self.assertGreater(trans, 1000)
        helpbut = decode_trans_sprite(df.containers[421].data, palette)
        help_white = 0
        help_trans = 0
        for i in range(0, len(helpbut.rgba), 4):
            red, green, blue, alpha = helpbut.rgba[i : i + 4]
            if (red, green, blue, alpha) == (255, 255, 255, 255):
                help_white += 1
            if alpha == 0:
                help_trans += 1
        self.assertGreater(help_white, 20)
        self.assertEqual(help_trans, 0)

    def test_minigame_prp_unused_is_white_not_inverted(self) -> None:
        """SALGAMES/INVEN/CHECKERS RGB-composite onto FLT stills.

        Unused 0xFFFF is white in DF.EXE. Unused-as-black (HOUSE SET blit)
        inverts card faces and slot handles.
        """
        if not SALGAMES.exists():
            self.skipTest("SALGAMES.PRP not present")
        df = read_df_file(SALGAMES)
        palette_black = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
        palette_white = find_palette(df.containers[0].data, unused_rgb=(255, 255, 255))
        assert palette_black is not None and palette_white is not None
        self.assertEqual(palette_white.colors[0], (255, 255, 255))
        catalog = parse_prp_catalog(df)
        ace = next(
            item
            for item in catalog
            if item.group.lower() == "ah" and item.state.lower() == "full"
        )
        black = decode_trans_sprite(df.containers[ace.container].data, palette_black)
        white = decode_trans_sprite(df.containers[ace.container].data, palette_white)
        def chroma(sprite) -> int:
            n = 0
            for i in range(0, len(sprite.rgba), 4):
                r, g, b, a = sprite.rgba[i : i + 4]
                if a and (r, g, b) != (0, 0, 0):
                    n += 1
            return n
        self.assertGreater(chroma(white), chroma(black))
        self.assertGreater(chroma(white), 200)

    def test_salgames_cards_use_flt_palette_not_prp_unused(self) -> None:
        """SALGAMES.PRP ColorPalette is unused-white; indices belong to SALGAMES.FLT."""
        if not SALGAMES.exists():
            self.skipTest("SALGAMES.PRP not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            write_prp_extract(read_df_file(SALGAMES), dest, write_scripts=False, write_frames=True)
            ace = dest / "FRAMES" / "ah" / "full" / "00_c3.png"
            handle = dest / "FRAMES" / "handle" / "handle1" / "00_c541.png"
            self.assertTrue(ace.exists(), ace)
            self.assertTrue(handle.exists(), handle)
            for path in (ace, handle):
                chroma = 0
                white = 0
                with Image.open(path) as image:
                    for pixel in image.convert("RGBA").getdata():
                        red, green, blue, alpha = pixel
                        if not alpha:
                            continue
                        if (red, green, blue) == (255, 255, 255):
                            white += 1
                        elif (red, green, blue) != (0, 0, 0):
                            chroma += 1
                self.assertGreater(chroma, 500, f"{path.name} washed out")
                self.assertGreater(chroma, white, f"{path.name} is unused-white")

    def test_house_world_overlays_are_not_silhouettes(self) -> None:
        """World PRP sprites index the SET palette, not HOUSE unused-black."""
        if not HOUSE.exists():
            self.skipTest("HOUSE.PRP not present")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            written = write_prp_extract(
                read_df_file(HOUSE), dest, write_scripts=False, write_frames=True
            )
            self.assertGreater(written.get("frames", 0), 50)
            world_groups = ("door", "gamblers", "blackjack", "table1")
            checked = 0
            for png in (dest / "FRAMES").glob("*/*/*.png"):
                if png.parent.parent.name not in world_groups:
                    continue
                chroma = 0
                with Image.open(png) as image:
                    for pixel in image.getdata():
                        if len(pixel) == 4:
                            red, green, blue, alpha = pixel
                        else:
                            red, green, blue = pixel[:3]
                            alpha = 255
                        if alpha and (red, green, blue) != (0, 0, 0):
                            chroma += 1
                self.assertGreater(chroma, 50, f"{png.relative_to(dest)} is a silhouette")
                checked += 1
            self.assertGreater(checked, 20)
            # Reader *bord indexes the companion FLT, not chroma-max TOWN.
            bords = (
                (dest / "FRAMES" / "yunnibord" / "base" / "00_c557.png", (41, 0, 0)),
                (dest / "FRAMES" / "histbord" / "base" / "00_c197.png", (99, 24, 0)),
                (dest / "FRAMES" / "diarybord" / "base" / "00_c261.png", (140, 107, 82)),
                (dest / "FRAMES" / "pagebord" / "base" / "00_c266.png", (132, 41, 8)),
            )
            for path, wood in bords:
                self.assertTrue(path.exists(), path)
                with Image.open(path) as image:
                    pixel = image.convert("RGBA").getpixel((0, 0))
                self.assertEqual(pixel[:3], wood, path.name)
                with Image.open(path) as image:
                    hole = image.convert("RGBA").getpixel((256, 192))
                self.assertEqual(hole[3], 0, f"{path.name} page hole is opaque")

    def test_committed_saloon_tables_have_felt(self) -> None:
        """On-disk HOUSE overlays must keep SET chroma (green felt), not cache a silhouette dump."""
        root = REPO / "dfextract" / "out" / "PRP" / "_HOUSE" / "FRAMES"
        samples = (
            root / "gamblers" / "sit" / "00_c166.png",
            root / "blackjack" / "sit" / "00_c499.png",
            root / "table1" / "stand" / "00_c508.png",
        )
        if not all(path.exists() for path in samples):
            self.skipTest("HOUSE frames not dumped")
        for path in samples:
            felt = 0
            chroma = 0
            with Image.open(path) as image:
                for pixel in image.convert("RGBA").getdata():
                    red, green, blue, alpha = pixel
                    if not alpha:
                        continue
                    if (red, green, blue) != (0, 0, 0):
                        chroma += 1
                    if green > 40 and green > red + 20:
                        felt += 1
            self.assertGreater(chroma, 1000, f"{path.name} is a silhouette")
            if path.parent.parent.name != "table1":
                self.assertGreater(felt, 200, f"{path.name} has no green felt")

    def test_committed_reader_bords_match_open_movies(self) -> None:
        """On-disk HOUSE *bord must keep FLT wood, not a TOWN.SET invert."""
        root = REPO / "dfextract" / "out" / "PRP" / "_HOUSE" / "FRAMES"
        samples = (
            (root / "yunnibord" / "base" / "00_c557.png", (41, 0, 0)),
            (root / "histbord" / "base" / "00_c197.png", (99, 24, 0)),
            (root / "diarybord" / "base" / "00_c261.png", (140, 107, 82)),
            (root / "pagebord" / "base" / "00_c266.png", (132, 41, 8)),
            (root / "curebord" / "untitled" / "00_c527.png", (57, 8, 0)),
        )
        if not all(path.exists() for path, _wood in samples):
            self.skipTest("HOUSE frames not dumped")
        for path, wood in samples:
            with Image.open(path) as image:
                rgba = image.convert("RGBA")
                self.assertEqual(rgba.getpixel((0, 0))[:3], wood, path.name)
                self.assertEqual(rgba.getpixel((256, 192))[3], 0, f"{path.name} hole")


if __name__ == "__main__":
    unittest.main()
