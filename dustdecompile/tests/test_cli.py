"""CLI defaults and a real run into a temp dir."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from cli import main, parse_args, selected_kinds
from inventory import default_dust_root

DUST = default_dust_root()
SKIP = "Dust install not under sources/dust.dbgl"


class TestCliFlags(unittest.TestCase):
    def test_no_flags_means_all_kinds(self) -> None:
        args = parse_args([])
        self.assertEqual(
            selected_kinds(args),
            ("inventory", "opcodes", "plugins", "handbook", "rsrc"),
        )

    def test_kind_flag_narrows(self) -> None:
        args = parse_args(["--opcodes"])
        self.assertEqual(selected_kinds(args), ("opcodes",))
        args = parse_args(["--handbook", "--plugins"])
        self.assertEqual(selected_kinds(args), ("plugins", "handbook"))

    def test_missing_input_exits(self) -> None:
        with self.assertRaises(SystemExit):
            main(["D:/definitely/not/a/dust/path"])


@unittest.skipUnless(DUST is not None, SKIP)
class TestCliRun(unittest.TestCase):
    def test_run_writes_tables(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            rc = main(["-o", str(dest), str(DUST)])
            self.assertEqual(rc, 0)
            opcodes = json.loads((dest / "opcodes.json").read_text(encoding="utf-8"))
            self.assertEqual(opcodes["count"], 307)
            ts = (dest / "opcodes.ts").read_text(encoding="utf-8")
            self.assertIn("puppetspeak", ts)
            self.assertIn("12043", ts)
            self.assertIn('"if": 4006', ts)
            inventory = json.loads((dest / "inventory.json").read_text(encoding="utf-8"))
            roles = {row["role"] for row in inventory["targets"]}
            self.assertIn("engine", roles)
            self.assertIn("plugin", roles)
            plugins = json.loads((dest / "plugins.json").read_text(encoding="utf-8"))
            verbs = []
            exports = []
            for plug in plugins["plugins"]:
                verbs.extend(plug["verbs"])
                exports.extend(e["name"] for e in plug["exports"])
            self.assertIn("checkmove", verbs)
            self.assertIn("PlugProc", exports)
            handbook = dest / "handbook.md"
            self.assertTrue(handbook.is_file())
            text = handbook.read_text(encoding="utf-8")
            self.assertIn("puppetbevel", text)
            self.assertIn("spotmovie", text)
            hbj = json.loads((dest / "handbook.json").read_text(encoding="utf-8"))
            self.assertEqual(hbj["opcode_count"], 307)

    def test_plugin_only_cannot_recover_opcodes(self) -> None:
        dll = DUST / "PLUGINS" / "CHECKERS.DLL"
        if not dll.is_file():
            self.skipTest("no CHECKERS.DLL")
        with tempfile.TemporaryDirectory() as tmp:
            rc = main(["--opcodes", "-o", str(tmp), str(dll)])
            self.assertEqual(rc, 2)

    def test_opcodes_flag_still_emits_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            rc = main(["--opcodes", "-o", str(dest), str(DUST)])
            self.assertEqual(rc, 0)
            data = json.loads((dest / "opcodes.json").read_text(encoding="utf-8"))
            self.assertEqual(data["count"], 307)
            self.assertFalse((dest / "handbook.md").exists())


if __name__ == "__main__":
    unittest.main()
