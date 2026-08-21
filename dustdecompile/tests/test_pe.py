"""PE/NE parse against the local Dust install. SHA-1 pins *this* dump."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from binary import kind_of, load_binary
from inventory import default_cd_root, default_dust_root, discover_targets
from ne import NeImage
from pe import PeImage

DUST = default_dust_root()
SKIP = "Dust install not under sources/dust.dbgl"

# Documented in docs/findings.md. A mismatch means a different SKU (e.g. DreamCatcher's).
DF_EXE_SHA1 = "54558d7b47b627e9770932be0afa9efd2fadce00"
DREAMCATCHER_DF_SHA1 = "97462977fc15277ba186a64baffe978d658413a9"


@unittest.skipUnless(DUST is not None, SKIP)
class TestPeNe(unittest.TestCase):
    def test_df_exe_is_pe32_msvc(self) -> None:
        image = load_binary(DUST / "DF.EXE")
        self.assertIsInstance(image, PeImage)
        assert isinstance(image, PeImage)
        self.assertEqual(kind_of(image), "PE32")
        self.assertEqual(image.machine, 0x14C)
        self.assertEqual(image.linker, "3.0")
        self.assertEqual(image.imagebase, 0x400000)
        self.assertEqual(image.timestamp_iso, "1996-02-21T19:22:28+00:00")
        self.assertIn("MSVC", image.compiler_hints)
        self.assertEqual(image.exports, ())
        text = next(s for s in image.sections if s.name == ".text")
        self.assertEqual(text.vsz, 271579)
        data = next(s for s in image.sections if s.name == ".data")
        self.assertEqual(data.rsz, 16384)
        kernel = [imp for imp in image.imports if imp.dll.lower() == "kernel32.dll"]
        self.assertEqual(len(kernel), 1)
        self.assertIn("LoadLibraryA", kernel[0].names)
        self.assertIn("GetProcAddress", kernel[0].names)
        winmm = [imp for imp in image.imports if imp.dll.lower() == "winmm.dll"]
        self.assertIn("waveOutOpen", winmm[0].names)
        gdi = [imp for imp in image.imports if imp.dll.lower() == "gdi32.dll"]
        self.assertIn("BitBlt", gdi[0].names)
        self.assertIn("CreatePalette", gdi[0].names)

    def test_df_exe_hash_is_this_install_not_dreamcatcher(self) -> None:
        image = load_binary(DUST / "DF.EXE")
        assert isinstance(image, PeImage)
        self.assertEqual(image.sha1, DF_EXE_SHA1)
        self.assertNotEqual(image.sha1, DREAMCATCHER_DF_SHA1)

    def test_puppetspeak_string_maps_from_va(self) -> None:
        image = load_binary(DUST / "DF.EXE")
        assert isinstance(image, PeImage)
        self.assertEqual(image.read_cstr(277700), "puppetspeak")
        self.assertEqual(image.string_at_va(0x004460C4), "puppetspeak")

    def test_initialized_ranges_skip_executable(self) -> None:
        image = load_binary(DUST / "DF.EXE")
        assert isinstance(image, PeImage)
        text = next(s for s in image.sections if s.name == ".text")
        for raw, _size in image.initialized_ranges():
            self.assertNotEqual(raw, text.raw)

    def test_checkers_exports_plugproc(self) -> None:
        image = load_binary(DUST / "PLUGINS" / "CHECKERS.DLL")
        assert isinstance(image, PeImage)
        self.assertEqual(image.export_dll, "Checkers.486.release.dll")
        self.assertEqual(image.imagebase, 0x10000000)
        names = [e.name for e in image.exports]
        self.assertEqual(names, ["PlugProc"])
        self.assertEqual(image.exports[0].ordinal, 1)
        self.assertEqual(image.exports[0].rva, 0x22D0)
        self.assertEqual([imp.dll.lower() for imp in image.imports], ["kernel32.dll"])
        text = next(s for s in image.sections if s.name == ".text")
        self.assertEqual(text.vsz, 9522)

    def test_movplay_is_pe32(self) -> None:
        image = load_binary(DUST / "MOVPLAY.EXE")
        assert isinstance(image, PeImage)
        self.assertEqual(image.linker, "2.55")
        self.assertEqual(kind_of(image), "PE32")
        self.assertIn(b"playmovie\x00", image.data)
        self.assertIn(b"actionframe\x00", image.data)
        self.assertIn(b"framerate\x00", image.data)

    def test_dust_exe_is_ne16(self) -> None:
        image = load_binary(DUST / "DUST.EXE")
        self.assertIsInstance(image, NeImage)
        assert isinstance(image, NeImage)
        self.assertEqual(kind_of(image), "NE")
        self.assertEqual(image.imported_modules, ("KERNEL", "GDI", "USER", "SHELL"))
        self.assertEqual(image.segment_count, 17)

    def test_alt31_checkers_is_386_build(self) -> None:
        cd = default_cd_root()
        if cd is None:
            self.skipTest("no DUSTCD tree")
        alt = cd / "INSTALL" / "ALT31" / "CHECKERS.DLL"
        if not alt.is_file():
            self.skipTest("no ALT31 CHECKERS.DLL")
        image = load_binary(alt)
        assert isinstance(image, PeImage)
        self.assertEqual(image.export_dll, "Checkers.386.release.dll")
        self.assertEqual(image.exports[0].name, "PlugProc")
        inst = load_binary(DUST / "PLUGINS" / "CHECKERS.DLL")
        assert isinstance(inst, PeImage)
        self.assertNotEqual(image.sha1, inst.sha1)


@unittest.skipUnless(DUST is not None, SKIP)
class TestDiscoverIncludesCheckersVerb(unittest.TestCase):
    def test_plugin_targets_include_installed_checkers(self) -> None:
        names = {t.path.name.upper() for t in discover_targets() if t.role == "plugin"}
        self.assertIn("CHECKERS.DLL", names)


if __name__ == "__main__":
    unittest.main()
