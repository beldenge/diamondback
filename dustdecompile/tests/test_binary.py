"""PE/NE sniff and mapping errors that do not need a full Dust tree."""

from __future__ import annotations

import struct
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from binary import load_binary
from pe import PeError


class TestLoadBinaryErrors(unittest.TestCase):
    def test_rejects_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "empty.bin"
            path.write_bytes(b"")
            with self.assertRaises(PeError):
                load_binary(path)

    def test_rejects_mz_that_is_neither_pe_nor_ne(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bogus.exe"
            data = bytearray(128)
            data[0:2] = b"MZ"
            struct.pack_into("<I", data, 0x3C, 64)
            data[64:68] = b"XX\x00\x00"
            path.write_bytes(data)
            with self.assertRaises(PeError):
                load_binary(path)

    def test_rejects_non_mz(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "note.txt"
            path.write_bytes(b"not an executable")
            with self.assertRaises(PeError):
                load_binary(path)


if __name__ == "__main__":
    unittest.main()
