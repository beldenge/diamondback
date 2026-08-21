"""DF.EXE PE resource dump (cursors, menu, save-filter string)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from inventory import default_dust_root
from pe import load_pe
from rsrc import decode_rt_cursor, dump_pe_resources, list_resources

DUST = default_dust_root()
SKIP = "Dust install not under sources/dust.dbgl"


@unittest.skipUnless(DUST is not None, SKIP)
class TestRsrc(unittest.TestCase):
    def test_lists_named_cursors(self) -> None:
        image = load_pe(DUST / "DF.EXE")
        entries = list_resources(image)
        types = {e["type"] for e in entries}
        self.assertIn("CURSOR", types)
        self.assertIn("GROUP_CURSOR", types)
        self.assertIn("MENU", types)
        names = {e["name"] for e in entries if e["type"] == "GROUP_CURSOR"}
        self.assertIn("CURS.TOUCH", names)
        self.assertIn("CURS.ARROW", names)
        self.assertIn("CURS.WATCH", names)

    def test_dump_writes_touch_png(self) -> None:
        image = load_pe(DUST / "DF.EXE")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            dump_pe_resources(image, dest)
            meta = json.loads((dest / "cursors.json").read_text(encoding="utf-8"))
            by_script = {row["script"]: row for row in meta}
            self.assertIn("touch", by_script)
            self.assertIn("arrow", by_script)
            png = dest / by_script["touch"]["png"]
            self.assertTrue(png.is_file())
            self.assertGreater(png.stat().st_size, 50)
            self.assertTrue((dest / by_script["touch"]["cur"]).is_file())
            strings = json.loads((dest / "strings.json").read_text(encoding="utf-8"))
            blob = json.dumps(strings)
            self.assertIn(".rtd", blob.lower())
            menu = json.loads((dest / "menu.json").read_text(encoding="utf-8"))
            labels = json.dumps(menu)
            self.assertIn("&File", labels)
            self.assertIn("&Sound", labels)

    def test_cursor_decode_has_opaque_pixels(self) -> None:
        image = load_pe(DUST / "DF.EXE")
        entries = list_resources(image)
        cursor = next(e for e in entries if e["type"] == "CURSOR" and e["name"] == 1)
        blob = image.data[cursor["off"] : cursor["off"] + cursor["size"]]
        xhot, yhot, rgba = decode_rt_cursor(blob)
        self.assertEqual(len(rgba), 32 * 32 * 4)
        opaque = sum(1 for i in range(3, len(rgba), 4) if rgba[i])
        self.assertGreater(opaque, 20)
        self.assertLess(xhot, 32)
        self.assertLess(yhot, 32)


if __name__ == "__main__":
    unittest.main()
