"""Sniff MZ and load PE32 or NE."""

from __future__ import annotations

import struct
from pathlib import Path

from ne import NeImage, load_ne
from pe import PeError, PeImage, load_pe

Loaded = PeImage | NeImage


def load_binary(path: Path) -> Loaded:
    data = path.read_bytes()
    if len(data) < 0x40 or data[:2] != b"MZ":
        raise PeError(f"{path.name}: not MZ")
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    sig = data[e_lfanew : e_lfanew + 4]
    if sig[:2] == b"NE":
        return load_ne(path)
    if sig[:4] == b"PE\x00\x00":
        return load_pe(path)
    raise PeError(f"{path.name}: MZ but neither PE nor NE (sig={sig!r})")


def kind_of(image: Loaded) -> str:
    return "PE32" if isinstance(image, PeImage) else "NE"
