"""Decode DreamFactory script containers to text.

Token layout and pretty-print rules follow DFET DFscript.cpp.
"""

from __future__ import annotations

import struct

from opcodes import SCRIPT_COMMANDS

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
    return data[start:end].decode("latin-1", errors="replace")


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
