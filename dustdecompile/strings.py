"""C-string harvest from initialized sections."""

from __future__ import annotations

import re
from dataclasses import dataclass

from pe import PeImage

_ASCII = re.compile(rb"[\x20-\x7e]{4,}")


@dataclass(frozen=True)
class ExtractedString:
    file_offset: int
    text: str


def extract_strings(image: PeImage, *, min_len: int = 4) -> list[ExtractedString]:
    out: list[ExtractedString] = []
    seen: set[int] = set()
    for start, size in image.initialized_ranges():
        blob = image.data[start : start + size]
        for match in _ASCII.finditer(blob):
            if len(match.group()) < min_len:
                continue
            off = start + match.start()
            if off in seen:
                continue
            seen.add(off)
            out.append(ExtractedString(file_offset=off, text=match.group().decode("ascii")))
    return out


def interesting_plugin_names(strings: list[ExtractedString], exports: tuple[str, ...]) -> list[str]:
    """Lowercase identifiers that are not Win32 imports/exports — plugin verbs."""
    skip = {name.lower() for name in exports}
    skip.update(
        {
            "getenvironmentstrings",
            "getcommandlinea",
            "getversion",
            "exitprocess",
            "virtualfree",
            "virtualalloc",
            "getmodulefilenamea",
            "getacp",
            "getoemcp",
            "getcpinfo",
            "getstdhandle",
            "getfiletype",
            "getstartupinfoa",
            "writefile",
            "getlasterror",
        }
    )
    names: list[str] = []
    seen: set[str] = set()
    for item in strings:
        text = item.text
        if not text.isidentifier() or not text.islower():
            continue
        if text.lower() in skip or text.startswith("r6"):
            continue
        if not _looks_like_verb(text):
            continue
        if text in seen:
            continue
        seen.add(text)
        names.append(text)
    return names


def _looks_like_verb(text: str) -> bool:
    # Palette crumbs (`ffff`, `ff33`) and filler (`wwwwww`) sit in CHECKERS.DLL.
    if not any(ch in "aeiou" for ch in text):
        return False
    if set(text) <= set("abcdef_"):
        return False
    return True
