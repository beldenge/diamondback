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
from cst import detect_contact_shadows, write_cst_frames
from image import (
    CONTACT_SHADOW_ALPHA,
    cst_palette,
    decode_trans_sprite,
    find_palette,
    pup_palette,
)
from pup import write_pup_frames

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
BOLIVAR = DUST / "DUSTCD" / "PUPPETS" / "BOLIVAR.PUP"
EXTRA = DUST / "DUSTCD" / "DATA" / "EXTRA.CST"
GANG = DUST / "DUSTCD" / "DATA" / "GANG.CST"
INVEN = DUST / "DUSTCD" / "DATA" / "INVEN.PRP"


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


if __name__ == "__main__":
    unittest.main()
