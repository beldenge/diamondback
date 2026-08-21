"""Win16 NE reader for the Dust launcher (DUST.EXE)."""

from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass
from pathlib import Path


class NeError(ValueError):
    """Not a New Executable we can describe."""


@dataclass
class NeImage:
    path: Path
    data: bytes
    flags: int
    segment_count: int
    target_os: int
    imported_modules: tuple[str, ...]

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.data).hexdigest()

    @property
    def sha1(self) -> str:
        return hashlib.sha1(self.data).hexdigest()


def load_ne(path: Path) -> NeImage:
    data = path.read_bytes()
    if data[:2] != b"MZ":
        raise NeError(f"{path.name}: not MZ")
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    if e_lfanew + 0x2C > len(data) or data[e_lfanew : e_lfanew + 2] != b"NE":
        raise NeError(f"{path.name}: not NE")
    flags = struct.unpack_from("<H", data, e_lfanew + 0x0C)[0]
    segs = struct.unpack_from("<H", data, e_lfanew + 0x1C)[0]
    modrefs = struct.unpack_from("<H", data, e_lfanew + 0x1E)[0]
    target_os = data[e_lfanew + 0x36]
    modtab = e_lfanew + struct.unpack_from("<H", data, e_lfanew + 0x28)[0]
    imptab = e_lfanew + struct.unpack_from("<H", data, e_lfanew + 0x2A)[0]
    names: list[str] = []
    for i in range(modrefs):
        off = struct.unpack_from("<H", data, modtab + i * 2)[0]
        nlen = data[imptab + off]
        names.append(
            data[imptab + off + 1 : imptab + off + 1 + nlen].decode("latin-1", "replace")
        )
    return NeImage(
        path=path,
        data=data,
        flags=flags,
        segment_count=segs,
        target_os=target_os,
        imported_modules=tuple(names),
    )
