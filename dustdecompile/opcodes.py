"""Recover Dust's script opcode table from DF.EXE.

Layout (MSVC, packed): groups of

    struct { char *name; unsigned short id; }  /* 6 bytes */

Each group starts 4-byte aligned so the first pointer is naturally
aligned, then packs at +6, and ends with {NULL, 0}. String literals live
in initialized .data. IDs match the 8-byte script tokens dfextract prints.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

from pe import PeImage

# Operators + words the VM treats as commands. Single-space is DFET id 1.
OPERATORS = {
    " ",
    "!",
    "!=",
    "&",
    "(",
    ")",
    "*",
    "+",
    ",",
    "-",
    "/",
    "<",
    "<=",
    "=",
    ">",
    ">=",
    "@",
    "and",
    "not",
    "or",
    "|",
}

# DreamFactory command ids in Dust sit in these bands (plus id 1 for space).
_ID_MIN = 4000
_ID_MAX = 25000


@dataclass(frozen=True)
class Opcode:
    name: str
    id: int
    file_offset: int
    name_va: int


def recover_opcodes(image: PeImage) -> list[Opcode]:
    """Return Dust's opcode table in file order (roughly alphabetical groups)."""
    data = image.data
    found: list[Opcode] = []
    consumed: set[int] = set()
    for start, size in image.initialized_ranges():
        end = start + size
        for off in range(_align4(start), end - 6, 4):
            if off in consumed:
                continue
            group = _walk_group(image, off, end)
            if not group:
                continue
            for op in group:
                consumed.add(op.file_offset)
            found.extend(group)
    return found


def opcode_map(ops: list[Opcode]) -> dict[int, str]:
    """id → name. Later duplicates keep the first (file order)."""
    out: dict[int, str] = {}
    for op in ops:
        out.setdefault(op.id, op.name)
    return out


def name_map(ops: list[Opcode]) -> dict[str, int]:
    out: dict[str, int] = {}
    for op in ops:
        out.setdefault(op.name, op.id)
    return out


# DreamFactory ids are family * 4000 + index. Observed in Dust DF.EXE, not a
# documented enum: language 4xxx, operators 8xxx, commands 12xxx, fields 16xxx,
# functions 20xxx, transitions 24xxx.
BAND_NAMES = {
    4000: "language",
    8000: "operator",
    12000: "command",
    16000: "field",
    20000: "function",
    24000: "transition",
}


def opcode_band(oid: int) -> str:
    fam = (oid // 4000) * 4000
    return BAND_NAMES.get(fam, "unknown")


def _align4(n: int) -> int:
    return (n + 3) & ~3


def _walk_group(image: PeImage, start: int, range_end: int) -> list[Opcode]:
    first = _record(image, start)
    if first is None:
        return []
    group = [first]
    off = start + 6
    while off + 6 <= range_end:
        ptr, oid = struct.unpack_from("<IH", image.data, off)
        if ptr == 0 and oid == 0:
            break
        rec = _record(image, off)
        if rec is None:
            break
        group.append(rec)
        off += 6
    if not _group_looks_like_opcodes(group):
        return []
    return group


def _record(image: PeImage, off: int) -> Opcode | None:
    if off + 6 > len(image.data):
        return None
    ptr, oid = struct.unpack_from("<IH", image.data, off)
    if not _is_opcode_id(oid):
        return None
    name = _string_start_at_va(image, ptr)
    if name is None or not _is_opcode_name(name):
        return None
    if oid == 1 and name != " ":
        return None
    return Opcode(name=name, id=oid, file_offset=off, name_va=ptr)


def _string_start_at_va(image: PeImage, va: int) -> str | None:
    off = image.va_to_off(va)
    if off is None or off < 1:
        return None
    if image.data[off - 1] != 0:
        return None
    return image.read_cstr(off, maxlen=48)


def _is_opcode_id(oid: int) -> bool:
    return oid == 1 or _ID_MIN <= oid <= _ID_MAX


def _is_opcode_name(name: str) -> bool:
    if name in OPERATORS:
        return True
    # Real commands are lowercase identifiers. Single letters in .text
    # are x86 immediates, not `me` / `if` (those are two characters).
    return (
        len(name) >= 2
        and name.isascii()
        and name.isidentifier()
        and name[0].isalpha()
        and name.islower()
    )


def _group_looks_like_opcodes(group: list[Opcode]) -> bool:
    """Drop CRT leftovers (frexp, y1) if a stray run ever matches the shape."""
    if not group:
        return False
    # Real Dust groups are letter-runs of commands, not libc.
    crt = {"frexp", "ldexp", "modf", "y0", "y1", "j0", "j1"}
    if any(op.name in crt for op in group):
        return False
    return True
