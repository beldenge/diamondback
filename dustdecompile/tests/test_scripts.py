"""Pretty-print script parser."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from facts import EXTRACT_TXT_ALIASES
from inventory import default_scripts_root
from scripts import (
    _matching_paren,
    _strip_comment,
    default_opcode_names,
    index_scripts,
    split_args,
)

JENIX = """\
// Extracted with dfextract
code runyoself ()
	local arg
	puppetclear ()
	puppetspeak ("jenix.5")
	puppetbevel ("Yes, here is the money.", 101)
	arg = puppetevent (-1)
	switch arg
	case 101
		sendtoactor ("JENIX", putdownactor ())
		sendtostage (spotmovie ("apothpig.mov"))
	endswitch
endcode
"""

SKIP_DUMP = "dfextract/out not present"


class TestSplitArgs(unittest.TestCase):
    def test_string_with_comma(self) -> None:
        self.assertEqual(
            split_args('"Yes, here is the money.", 101'),
            ['"Yes, here is the money."', "101"],
        )

    def test_nested_call(self) -> None:
        self.assertEqual(
            split_args('spotmovie ("apothpig.mov")'),
            ['spotmovie ("apothpig.mov")'],
        )

    def test_empty(self) -> None:
        self.assertEqual(split_args(""), [])
        self.assertEqual(split_args("   "), [])

    def test_three_pluginfx_args(self) -> None:
        self.assertEqual(
            split_args('"checkmove", mainboard, count, 0'),
            ['"checkmove"', "mainboard", "count", "0"],
        )


class TestCommentAndParens(unittest.TestCase):
    def test_strip_comment_keeps_string(self) -> None:
        self.assertEqual(_strip_comment('playmovie ("intro.mov") // fade'), 'playmovie ("intro.mov") ')
        self.assertEqual(_strip_comment('// whole line'), "")
        self.assertEqual(
            _strip_comment('puppetbevel ("http://x", 1)'),
            'puppetbevel ("http://x", 1)',
        )

    def test_matching_paren(self) -> None:
        line = 'sendtostage (spotmovie ("apothpig.mov"))'
        open_at = line.index("(")
        self.assertEqual(line[_matching_paren(line, open_at)], ")")
        self.assertEqual(_matching_paren(line, open_at), len(line) - 1)


class TestIndexFixture(unittest.TestCase):
    def test_jenix_fragment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "day1.txt").write_text(JENIX, encoding="utf-8")
            idx = index_scripts(
                root,
                {
                    "puppetspeak",
                    "puppetbevel",
                    "puppetevent",
                    "puppetclear",
                    "sendtoactor",
                    "sendtostage",
                },
            )
            self.assertEqual([d.name for d in idx.defs], ["runyoself"])
            self.assertEqual(idx.defs[0].params, ())
            names = [c.name for c in idx.calls]
            self.assertIn("puppetspeak", names)
            self.assertIn("putdownactor", names)
            self.assertIn("spotmovie", names)
            speak = idx.calls_named("puppetspeak")[0]
            self.assertEqual(speak.args, ('"jenix.5"',))
            self.assertEqual(speak.kind, "opcode")
            bevel = idx.calls_named("puppetbevel")[0]
            self.assertEqual(len(bevel.args), 2)
            event = idx.calls_named("puppetevent")[0]
            self.assertEqual(event.args, ("-1",))
            stage = idx.calls_named("sendtostage")[0]
            self.assertEqual(stage.args, ('spotmovie ("apothpig.mov")',))
            spot = idx.calls_named("spotmovie")[0]
            self.assertEqual(spot.kind, "user")
            self.assertEqual(spot.args, ('"apothpig.mov"',))

    def test_code_with_params(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "x.txt").write_text(
                "code gotointerior (setname)\n\topensetfile (setname)\nendcode\n",
                encoding="utf-8",
            )
            idx = index_scripts(root, {"opensetfile"})
            self.assertEqual(idx.defs[0].name, "gotointerior")
            self.assertEqual(idx.defs[0].params, ("setname",))


@unittest.skipUnless(default_scripts_root() is not None, SKIP_DUMP)
class TestIndexDump(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        names = default_opcode_names(
            {"puppetspeak", "pluginfx", "playmovie", "puppetbevel", "puppetevent"},
            EXTRACT_TXT_ALIASES,
        )
        names.update({"spotmovie", "gototown", "gotointerior", "advanceday"})
        cls.idx = index_scripts(default_scripts_root(), names)

    def test_indexes_hundreds_of_files(self) -> None:
        self.assertGreaterEqual(self.idx.files_read, 400)

    def test_spotmovie_is_library(self) -> None:
        defs = self.idx.defs_named("spotmovie")
        self.assertTrue(any("NEW" in d.file.upper() for d in defs))

    def test_pluginfx_checkmove(self) -> None:
        texts = [f"{c.args}" for c in self.idx.calls_named("pluginfx")]
        self.assertTrue(any("checkmove" in t for t in texts))
        self.assertEqual(self.idx.arities("pluginfx"), [4])

    def test_gototown_defined(self) -> None:
        self.assertTrue(self.idx.defs_named("gototown"))
        self.assertTrue(self.idx.defs_named("gotointerior"))
        self.assertTrue(self.idx.defs_named("advanceday"))

    def test_runyoself_is_the_puppet_hook(self) -> None:
        defs = self.idx.defs_named("runyoself")
        self.assertGreaterEqual(len(defs), 20)
        self.assertTrue(any("PUP/" in d.file for d in defs))

    def test_jenix_choice_101(self) -> None:
        sites = [
            c
            for c in self.idx.calls_named("puppetbevel")
            if "JENIX" in c.file.upper() and "101" in c.args
        ]
        self.assertTrue(sites, "Jenix money choice 101 must be in the dump")

    def test_boot_playmovie_intro(self) -> None:
        sites = [
            c
            for c in self.idx.calls_named("playmovie")
            if "BOOT" in c.file.upper() and "intro" in ",".join(c.args).lower()
        ]
        self.assertTrue(sites)


if __name__ == "__main__":
    unittest.main()
