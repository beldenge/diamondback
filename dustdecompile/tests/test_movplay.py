"""MOVPLAY.EXE facts used by dfextract reel timing / mixer."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from inventory import default_dust_root
from opcodes import recover_opcodes
from pe import load_pe

DUST = default_dust_root()
SKIP = "Dust install not under sources/dust.dbgl"
MOVPLAY_SHA1 = "f6560e384c0ea910b6e373b224829806b1047fad"


@unittest.skipUnless(DUST is not None, SKIP)
class TestMovplayBinary(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        assert DUST is not None
        cls.image = load_pe(DUST / "MOVPLAY.EXE")

    def test_hash(self) -> None:
        self.assertEqual(self.image.sha1, MOVPLAY_SHA1)

    def test_has_dust_opcode_table(self) -> None:
        names = {op.name for op in recover_opcodes(self.image)}
        self.assertEqual(len(names), 304)
        self.assertTrue(
            {"singlesound", "dualsound", "multiplesound", "playtheme", "playmovie"}
            <= names
        )

    def test_frame_table_lea_0x8c2(self) -> None:
        # lea esi, [eax+ecx+0x8C2] at the play-loop copy (VA 0x40BCFD)
        self.assertIn(bytes.fromhex("8db408c2080000"), self.image.data)

    def test_group_a_count_from_header_plus_1a(self) -> None:
        # mov ax, word ptr [eax+0x1A] in the scene-load (VA 0x40B98D)
        self.assertIn(bytes.fromhex("668b401a"), self.image.data)

    def test_waveoutopen_via_register(self) -> None:
        winmm = [imp for imp in self.image.imports if imp.dll.lower() == "winmm.dll"]
        self.assertTrue(winmm)
        self.assertIn("waveOutOpen", winmm[0].names)
        self.assertIn("waveOutWrite", winmm[0].names)
        self.assertIn(b"waveOutOpen", self.image.data)

    def test_rec_flags_bit0_waits_mixer_idle(self) -> None:
        # test byte ptr [esp+0x56], 1  at the play loop (rec+0x1A bit 0)
        # MOVPLAY 0x40BF6C; DF.EXE 0x419300
        self.assertIn(bytes.fromhex("f644245601"), self.image.data)


@unittest.skipUnless(DUST is not None, SKIP)
class TestDfMovieWait(unittest.TestCase):
    def test_same_rec_flag_wait_as_movplay(self) -> None:
        assert DUST is not None
        image = load_pe(DUST / "DF.EXE")
        self.assertIn(bytes.fromhex("f644245601"), image.data)


if __name__ == "__main__":
    unittest.main()
