"""Golden tests for PUP/CST transparent sprites against the DFET extract."""

from __future__ import annotations

import sys
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

REPO = HERE.parents[1]
DUST = REPO / "sources" / "dust.dbgl" / "dosroot" / "0" / "dust"
BOLIVAR = DUST / "DUSTCD" / "PUPPETS" / "BOLIVAR.PUP"
EXTRA = DUST / "DUSTCD" / "DATA" / "EXTRA.CST"
DFET = REPO / "sources" / "dust-extract"


def _rgba(path: Path) -> tuple[tuple[int, int], bytes]:
    image = Image.open(path).convert("RGBA")
    return image.size, image.tobytes()


class TestFrames(unittest.TestCase):
    def test_bolivar_background_matches_dfet(self) -> None:
        if not BOLIVAR.exists():
            self.skipTest("BOLIVAR.PUP not present")
        df = read_df_file(BOLIVAR)
        sprite = decode_trans_sprite(df.containers[4].data, pup_palette(df.containers[0].data))
        dfet = DFET / "_BOLIVAR" / "PUP" / "FRAMES" / "Background" / "frame_4.png"
        self.assertTrue(dfet.exists())
        size, pixels = _rgba(dfet)
        self.assertEqual(size, (sprite.width, sprite.height))
        self.assertEqual(pixels, sprite.rgba)

    def test_write_bolivar_frame_count(self) -> None:
        if not BOLIVAR.exists():
            self.skipTest("BOLIVAR.PUP not present")
        import tempfile

        dfet_count = len(list((DFET / "_BOLIVAR" / "PUP" / "FRAMES").rglob("*.png")))
        with tempfile.TemporaryDirectory() as tmp:
            written = write_pup_frames(read_df_file(BOLIVAR), Path(tmp))
        self.assertEqual(written, dfet_count)
        self.assertGreater(written, 40)

    def test_extra_jenix_stand_matches_dfet(self) -> None:
        if not EXTRA.exists():
            self.skipTest("EXTRA.CST not present")
        import tempfile

        dfet = DFET / "_EXTRA" / "CST" / "Jenix" / "stand" / "frame_195.png"
        self.assertTrue(dfet.exists())
        with tempfile.TemporaryDirectory() as tmp:
            written = write_cst_frames(read_df_file(EXTRA), Path(tmp))
            ours = Path(tmp) / "Jenix" / "stand" / "frame_195.png"
            self.assertTrue(ours.exists())
            self.assertGreater(written, 100)
            self.assertEqual(_rgba(ours), _rgba(dfet))


if __name__ == "__main__":
    unittest.main()
