"""PE32 reader for Dust's Win32s binaries (DF.EXE, MOVPLAY, plugins).

Only PE32 (magic 0x10B). Dust has no PE32+.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


class PeError(ValueError):
    """Not a PE32 image we can map."""


@dataclass(frozen=True)
class Section:
    name: str
    va: int
    vsz: int
    raw: int
    rsz: int
    characteristics: int

    def contains_rva(self, rva: int) -> bool:
        span = max(self.vsz, self.rsz)
        return self.va <= rva < self.va + span


@dataclass(frozen=True)
class ImportedDll:
    dll: str
    names: tuple[str, ...]


@dataclass(frozen=True)
class ExportedSymbol:
    name: str
    ordinal: int
    rva: int


@dataclass
class PeImage:
    path: Path
    data: bytes
    machine: int
    timestamp: int
    linker: str
    imagebase: int
    oep_rva: int
    subsystem: int
    os_version: tuple[int, int]
    characteristics: int
    sections: tuple[Section, ...]
    imports: tuple[ImportedDll, ...]
    exports: tuple[ExportedSymbol, ...]
    export_dll: str | None = None
    compiler_hints: tuple[str, ...] = field(default_factory=tuple)

    def rva_to_off(self, rva: int) -> int | None:
        for section in self.sections:
            if section.contains_rva(rva):
                off = section.raw + (rva - section.va)
                if 0 <= off < len(self.data):
                    return off
        return None

    def va_to_off(self, va: int) -> int | None:
        if va < self.imagebase:
            return None
        return self.rva_to_off(va - self.imagebase)

    def read_cstr(self, file_off: int, maxlen: int = 256) -> str | None:
        if not (0 <= file_off < len(self.data)):
            return None
        end = self.data.find(b"\x00", file_off, file_off + maxlen)
        if end <= file_off:
            return None
        raw = self.data[file_off:end]
        if not raw or not all(32 <= b < 127 for b in raw):
            return None
        return raw.decode("ascii")

    def string_at_va(self, va: int, maxlen: int = 256) -> str | None:
        off = self.va_to_off(va)
        if off is None:
            return None
        return self.read_cstr(off, maxlen)

    def initialized_ranges(self) -> tuple[tuple[int, int], ...]:
        """(file_off, size) of non-executable sections that have raw bytes.

        Opcode strings and the name/id table live in `.data`. Scanning
        `.text` hits packed x86 that looks like `{ptr, u16}` by accident.
        """
        execute = 0x20000000  # IMAGE_SCN_MEM_EXECUTE
        ranges = []
        for section in self.sections:
            if section.rsz <= 0 or section.raw <= 0:
                continue
            if section.characteristics & execute:
                continue
            size = min(section.rsz, len(self.data) - section.raw)
            if size > 0:
                ranges.append((section.raw, size))
        return tuple(ranges)

    @property
    def timestamp_iso(self) -> str:
        return datetime.fromtimestamp(self.timestamp, timezone.utc).isoformat()

    @property
    def sha256(self) -> str:
        import hashlib

        return hashlib.sha256(self.data).hexdigest()

    @property
    def sha1(self) -> str:
        import hashlib

        return hashlib.sha1(self.data).hexdigest()


def load_pe(path: Path) -> PeImage:
    data = path.read_bytes()
    if data[:2] != b"MZ":
        raise PeError(f"{path.name}: not MZ")
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    if e_lfanew + 24 > len(data) or data[e_lfanew : e_lfanew + 4] != b"PE\x00\x00":
        raise PeError(f"{path.name}: not PE")
    coff = e_lfanew + 4
    machine, nsec, timedate, _sym, _nsym, optsize, chars = struct.unpack_from(
        "<HHIIIHH", data, coff
    )
    opt = coff + 20
    if opt + optsize > len(data):
        raise PeError(f"{path.name}: truncated optional header")
    magic = struct.unpack_from("<H", data, opt)[0]
    if magic != 0x10B:
        raise PeError(f"{path.name}: PE magic {magic:#x} is not PE32")
    linker = f"{data[opt + 2]}.{data[opt + 3]}"
    oep = struct.unpack_from("<I", data, opt + 16)[0]
    imagebase = struct.unpack_from("<I", data, opt + 28)[0]
    os_major, os_minor = struct.unpack_from("<HH", data, opt + 40)
    subsystem = struct.unpack_from("<H", data, opt + 68)[0]
    num_dd = struct.unpack_from("<I", data, opt + 92)[0]
    dd = opt + 96

    sections: list[Section] = []
    sec_off = opt + optsize
    for i in range(nsec):
        rec = sec_off + i * 40
        name = data[rec : rec + 8].split(b"\x00", 1)[0].decode("latin-1", "replace")
        vsz, va, rsz, raw, _rel, _ln, _nrel, _nln, schars = struct.unpack_from(
            "<IIIIIIHHI", data, rec + 8
        )
        sections.append(
            Section(
                name=name,
                va=va,
                vsz=vsz,
                raw=raw,
                rsz=rsz,
                characteristics=schars,
            )
        )

    def rva_to_off(rva: int) -> int | None:
        for section in sections:
            if section.contains_rva(rva):
                off = section.raw + (rva - section.va)
                if 0 <= off < len(data):
                    return off
        return None

    def cstr(off: int | None, maxlen: int = 256) -> str:
        if off is None:
            return "?"
        end = data.find(b"\x00", off, off + maxlen)
        if end <= off:
            return "?"
        return data[off:end].decode("latin-1", "replace")

    def dirent(index: int) -> tuple[int, int]:
        if index >= num_dd:
            return 0, 0
        return struct.unpack_from("<II", data, dd + index * 8)

    imports = _read_imports(data, rva_to_off, cstr, dirent(1)[0])
    exports, export_dll = _read_exports(data, rva_to_off, cstr, dirent(0)[0])
    hints = _compiler_hints(data)

    return PeImage(
        path=path,
        data=data,
        machine=machine,
        timestamp=timedate,
        linker=linker,
        imagebase=imagebase,
        oep_rva=oep,
        subsystem=subsystem,
        os_version=(os_major, os_minor),
        characteristics=chars,
        sections=tuple(sections),
        imports=imports,
        exports=exports,
        export_dll=export_dll,
        compiler_hints=hints,
    )


def _read_imports(data, rva_to_off, cstr, imp_rva: int) -> tuple[ImportedDll, ...]:
    if not imp_rva:
        return ()
    off = rva_to_off(imp_rva)
    if off is None:
        return ()
    dlls: list[ImportedDll] = []
    while off + 20 <= len(data):
        ilt, _timed, _fwd, name_rva, iat = struct.unpack_from("<IIIII", data, off)
        if ilt == 0 and name_rva == 0 and iat == 0:
            break
        dll = cstr(rva_to_off(name_rva))
        thunk = ilt or iat
        names: list[str] = []
        toff = rva_to_off(thunk)
        while toff is not None and toff + 4 <= len(data):
            ent = struct.unpack_from("<I", data, toff)[0]
            if ent == 0:
                break
            if ent & 0x80000000:
                names.append(f"ord_{ent & 0xFFFF}")
            else:
                n = rva_to_off(ent)
                if n is not None and n + 2 < len(data):
                    names.append(cstr(n + 2))
                else:
                    names.append(f"rva_{ent:x}")
            toff += 4
            if len(names) > 512:
                break
        dlls.append(ImportedDll(dll=dll, names=tuple(names)))
        off += 20
    return tuple(dlls)


def _read_exports(data, rva_to_off, cstr, exp_rva: int) -> tuple[tuple[ExportedSymbol, ...], str | None]:
    if not exp_rva:
        return (), None
    eoff = rva_to_off(exp_rva)
    if eoff is None or eoff + 40 > len(data):
        return (), None
    (
        _ch,
        _time,
        _ver,
        name_rva,
        ordinal_base,
        nfunc,
        nnames,
        addr_rva,
        nameptr_rva,
        ord_rva,
    ) = struct.unpack_from("<IIIIIIIIII", data, eoff)
    dll_name = cstr(rva_to_off(name_rva)) if name_rva else None
    np = rva_to_off(nameptr_rva)
    op = rva_to_off(ord_rva)
    ap = rva_to_off(addr_rva)
    if np is None or op is None or ap is None:
        return (), dll_name
    exports: list[ExportedSymbol] = []
    for i in range(nnames):
        nrva = struct.unpack_from("<I", data, np + i * 4)[0]
        ordidx = struct.unpack_from("<H", data, op + i * 2)[0]
        rva = struct.unpack_from("<I", data, ap + ordidx * 4)[0]
        exports.append(
            ExportedSymbol(
                name=cstr(rva_to_off(nrva)),
                ordinal=ordinal_base + ordidx,
                rva=rva,
            )
        )
    return tuple(exports), dll_name


def _compiler_hints(data: bytes) -> tuple[str, ...]:
    hints = []
    if b"Microsoft Visual C++" in data:
        hints.append("MSVC")
    if b"Borland" in data:
        hints.append("Borland")
    if b"Watcom" in data:
        hints.append("Watcom")
    return tuple(hints)
