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
from cst import write_cst_frames
from image import decode_trans_sprite, pup_palette
from pup import write_pup_frames

REPO = HERE.parent
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
BOLIVAR = DUST / "DUSTCD" / "PUPPETS" / "BOLIVAR.PUP"
EXTRA = DUST / "DUSTCD" / "DATA" / "EXTRA.CST"


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
        self.assertEqual(written, 58)

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
        self.assertGreater(written, 100)


if __name__ == "__main__":
    unittest.main()
