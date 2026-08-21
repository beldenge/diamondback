"""CLI defaults to everything; flags only narrow the run."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from cli import (
    CONTENT_KINDS,
    DUST_TYPES,
    _format_elapsed,
    _worker_count,
    classify_path,
    collect_dust_files,
    parse_args,
    selected_kinds,
    selected_types,
)


class TestCliDefaults(unittest.TestCase):
    def test_no_flags_means_all_kinds_and_types(self) -> None:
        args = parse_args([])
        self.assertEqual(selected_kinds(args), CONTENT_KINDS)
        self.assertNotIn("video", CONTENT_KINDS)
        self.assertNotIn("video", selected_kinds(args))
        self.assertNotIn("z", selected_kinds(args))
        self.assertEqual(selected_types(args), DUST_TYPES)
        self.assertEqual(args.jobs, 0)
        self.assertFalse(args.catalog)

    def test_format_elapsed(self) -> None:
        self.assertEqual(_format_elapsed(0), "<0.01s")
        self.assertEqual(_format_elapsed(0.04), "0.04s")
        self.assertEqual(_format_elapsed(9.99), "9.99s")
        self.assertEqual(_format_elapsed(10.8), "10.8s")
        self.assertEqual(_format_elapsed(59.4), "59.4s")
        self.assertEqual(_format_elapsed(72), "1m 12s")
        self.assertEqual(_format_elapsed(3661), "1h 1m")

    def test_jobs_flag(self) -> None:
        self.assertEqual(parse_args(["--jobs", "1"]).jobs, 1)
        self.assertEqual(parse_args(["-j", "8"]).jobs, 8)
        self.assertEqual(_worker_count(411, ("scripts",), 0), 1)
        self.assertEqual(_worker_count(1, ("frames",), 0), 1)
        self.assertEqual(_worker_count(411, ("frames",), 1), 1)
        self.assertGreater(_worker_count(411, ("frames",), 0), 1)

    def test_any_kind_flag_restricts_kinds(self) -> None:
        args = parse_args(["--scripts"])
        self.assertEqual(selected_kinds(args), ("scripts",))
        args = parse_args(["--audio", "--frames"])
        self.assertEqual(selected_kinds(args), ("audio", "frames"))
        args = parse_args(["--video"])
        self.assertEqual(selected_kinds(args), ("video",))
        args = parse_args(["--z"])
        self.assertEqual(selected_kinds(args), ("z",))

    def test_type_flag_restricts_types(self) -> None:
        args = parse_args(["--type", "pup,set,SET,bootfile"])
        self.assertEqual(selected_types(args), ("pup", "set", "boot"))

    def test_unknown_type_exits(self) -> None:
        with self.assertRaises(SystemExit):
            selected_types(parse_args(["--type", "shp,trk"]))

    def test_classify_dust_names(self) -> None:
        self.assertEqual(classify_path(Path("JENIX.PUP")), "pup")
        self.assertEqual(classify_path(Path("TOWN.SET")), "set")
        self.assertEqual(classify_path(Path("CHECKERS.FLT")), "flt")
        self.assertEqual(classify_path(Path("HOUSE.PRP")), "prp")
        self.assertEqual(classify_path(Path("INTRO.MOV")), "mov")
        self.assertEqual(classify_path(Path("BOOTFILE")), "boot")
        self.assertIsNone(classify_path(Path("DF.EXE")))

    def test_collect_respects_type_filter(self) -> None:
        puppets = (
            HERE.parent
            / "sources"
            / "dust.dbgl"
            / "dosroot"
            / "0"
            / "dust"
            / "DUSTCD"
            / "PUPPETS"
        )
        if not puppets.exists():
            self.skipTest("Dust PUPPETS folder not present")
        only_pup = collect_dust_files([puppets], ("pup",))
        self.assertTrue(only_pup)
        self.assertTrue(all(path.suffix.lower() == ".pup" for path in only_pup))
        none = collect_dust_files([puppets], ("set",))
        self.assertEqual(none, [])


if __name__ == "__main__":
    unittest.main()
