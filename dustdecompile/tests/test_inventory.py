"""Target discovery: Cyberflix binaries only, keep hash-divergent copies."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from inventory import (
    ROLE_ENGINE,
    ROLE_LAUNCHER,
    ROLE_MOVIE,
    ROLE_PLUGIN,
    default_dust_root,
    discover_targets,
    engine_target,
)

SKIP = "Dust install not under sources/dust.dbgl"


@unittest.skipUnless(default_dust_root() is not None, SKIP)
class TestDiscover(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.targets = discover_targets()

    def test_finds_engine_movie_plugin_launcher(self) -> None:
        roles = {t.role for t in self.targets}
        self.assertEqual(roles, {ROLE_ENGINE, ROLE_LAUNCHER, ROLE_MOVIE, ROLE_PLUGIN})

    def test_engine_is_df_exe(self) -> None:
        engine = engine_target(self.targets)
        self.assertIsNotNone(engine)
        assert engine is not None
        self.assertEqual(engine.path.name.upper(), "DF.EXE")
        self.assertEqual(engine.size, 346624)

    def test_two_checkers_builds_if_both_present(self) -> None:
        plugins = [t for t in self.targets if t.role == ROLE_PLUGIN]
        self.assertGreaterEqual(len(plugins), 1)
        hashes = {t.sha1 for t in plugins}
        self.assertEqual(len(hashes), len(plugins), "hash-identical plugins should be deduped")

    def test_two_launchers_differ_when_cd_copy_present(self) -> None:
        launchers = [t for t in self.targets if t.role == ROLE_LAUNCHER]
        self.assertGreaterEqual(len(launchers), 1)
        if len(launchers) > 1:
            self.assertNotEqual(launchers[0].sha1, launchers[1].sha1)

    def test_sha1_is_40_hex(self) -> None:
        for target in self.targets:
            self.assertEqual(len(target.sha1), 40, target.path.name)
            int(target.sha1, 16)


if __name__ == "__main__":
    unittest.main()
