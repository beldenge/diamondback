"""Decode DreamFactory script containers to text and JSON tokens.

Token layout and pretty-print rules follow DFET DFscript.cpp.
JSON ASTs use Dust DF.EXE names; `.txt` still prints the Titanic 4.0 table.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

from opcodes import SCRIPT_COMMANDS, dust_opcode_name

EXTRACTOR_BANNER = (
    "// Extracted with dfextract — Dust-only Python port of DFET script decoding\n\n"
)

CMD_STRING = 3
CMD_INTEGER = 4
CMD_VARIABLE = 5
CMD_BREAK = 6
CMD_LPAREN = 4018
CMD_RPAREN = 4019
CMD_COMMA = 4020
CMD_MINUS = 8002
CMD_SLASH = 8004


def pascal_string(data: bytes, offset: int) -> str:
    if offset < 0 or offset >= len(data):
        return f"<bad-str-off:{offset}>"
    length = data[offset]
    start = offset + 1
    end = start + length
    if end > len(data):
        return f"<truncated-str-off:{offset}>"
    # Dust was authored on Mac. 0xD5 is a curly apostrophe, not latin-1 Õ.
    return data[start:end].decode("mac_roman", errors="replace")


def binary_script_to_text(data: bytes) -> str:
    """Pretty-print a script container. Empty / terminator-only data returns ''."""
    if len(data) < 8:
        return ""

    parts: list[str] = []
    pos = 0
    while pos + 8 <= len(data):
        cmd, info, unknown = struct.unpack_from("<HIH", data, pos)
        if cmd == 0:
            break
        if unknown:
            parts.append("[UNKNOWN VALUE] ")

        if cmd == CMD_STRING:
            parts.append(f'"{pascal_string(data, pos + info)}" ')
        elif cmd == CMD_INTEGER:
            parts.append(f"{info} ")
        elif cmd == CMD_VARIABLE:
            parts.append(f"{pascal_string(data, pos + info)} ")
        elif cmd == CMD_BREAK:
            _break_line(parts, info)
        else:
            name = SCRIPT_COMMANDS.get(cmd, f"cmd_{cmd}")
            if cmd in (CMD_LPAREN, CMD_MINUS):
                parts.append(name)
            elif cmd == CMD_SLASH and _ends_with_slash_space(parts):
                _replace_trailing_space(parts, "/ ")
            else:
                if cmd in (CMD_RPAREN, CMD_COMMA):
                    _strip_trailing_space(parts)
                parts.append(name)
                parts.append(" ")
        pos += 8

    return "".join(parts)


def tokenize_script(data: bytes) -> list[dict[str, Any]]:
    """8-byte token stream as JSON-friendly dicts. Dust names on opcodes."""
    if len(data) < 8:
        return []
    tokens: list[dict[str, Any]] = []
    pos = 0
    while pos + 8 <= len(data):
        cmd, info, unknown = struct.unpack_from("<HIH", data, pos)
        if cmd == 0:
            break
        tok: dict[str, Any] = {"off": pos, "cmd": cmd, "info": info}
        if unknown:
            tok["unknown"] = unknown
        if cmd == CMD_STRING:
            tok["kind"] = "string"
            tok["value"] = pascal_string(data, pos + info)
        elif cmd == CMD_INTEGER:
            tok["kind"] = "integer"
            tok["value"] = info
        elif cmd == CMD_VARIABLE:
            tok["kind"] = "variable"
            tok["value"] = pascal_string(data, pos + info)
        elif cmd == CMD_BREAK:
            tok["kind"] = "break"
            tok["indent"] = info
        else:
            tok["kind"] = "opcode"
            tok["name"] = dust_opcode_name(cmd)
            printed = SCRIPT_COMMANDS.get(cmd)
            if printed is not None and printed != tok["name"]:
                tok["printed"] = printed
        tokens.append(tok)
        pos += 8
    return tokens


def write_script_files(
    path: Path, text: str, tokens: list[dict[str, Any]] | None = None
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(EXTRACTOR_BANNER + text, encoding="utf-8", newline="\n")
    if tokens is None:
        return
    payload = {"name": path.stem, "tokens": tokens}
    path.with_suffix(".json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def decode_and_write_script(path: Path, data: bytes) -> bool:
    text = binary_script_to_text(data)
    if len(text) <= 1:
        return False
    write_script_files(path, text, tokenize_script(data))
    return True


def _break_line(parts: list[str], indent: int) -> None:
    if parts and parts[-1].endswith(" "):
        parts[-1] = parts[-1][:-1] + "\n"
    else:
        parts.append("\n")
    if indent:
        parts.append("\t" * indent)


def _strip_trailing_space(parts: list[str]) -> None:
    if not parts:
        return
    if parts[-1].endswith(" "):
        parts[-1] = parts[-1][:-1]


def _replace_trailing_space(parts: list[str], replacement: str) -> None:
    if parts and parts[-1].endswith(" "):
        parts[-1] = parts[-1][:-1] + replacement
    else:
        parts.append(replacement)


def _ends_with_slash_space(parts: list[str]) -> bool:
    tail = "".join(parts[-3:])
    return len(tail) >= 2 and tail[-1] == " " and tail[-2] == "/"
