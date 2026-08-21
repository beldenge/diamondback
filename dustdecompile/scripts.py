"""Parse dfextract pretty-printed scripts (not the binary tokens).

Used to mine call shapes and to catalog `code name (...)` library/content
procedures. Does not import dfextract.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

_CODE_DEF = re.compile(r"^code\s+([A-Za-z_][\w.]*)\s*\((.*)\)\s*$")
_IDENT_CALL = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(")


@dataclass(frozen=True)
class ProcDef:
    name: str
    params: tuple[str, ...]
    file: str
    line: int


@dataclass(frozen=True)
class CallSite:
    name: str
    args: tuple[str, ...]
    file: str
    line: int
    kind: str  # "opcode" | "user"


@dataclass
class ScriptIndex:
    defs: list[ProcDef] = field(default_factory=list)
    calls: list[CallSite] = field(default_factory=list)
    files_read: int = 0

    def defs_named(self, name: str) -> list[ProcDef]:
        return [d for d in self.defs if d.name == name]

    def calls_named(self, name: str) -> list[CallSite]:
        return [c for c in self.calls if c.name == name]

    def arities(self, name: str) -> list[int]:
        found = sorted({len(c.args) for c in self.calls_named(name)})
        return found

    def examples(self, name: str, limit: int = 3) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for call in self.calls_named(name):
            text = _format_call(call)
            if text in seen:
                continue
            seen.add(text)
            out.append(f"{call.file}:{call.line}  {text}")
            if len(out) >= limit:
                break
        return out


def default_opcode_names(dust_names: set[str], txt_aliases: dict[int, tuple[str, str]]) -> set[str]:
    names = set(dust_names)
    for txt_name, dust_name in txt_aliases.values():
        names.add(txt_name)
        names.add(dust_name)
    names.update(
        {
            "if",
            "else",
            "switch",
            "case",
            "while",
            "for",
            "return",
            "not",
            "true",
            "false",
            "and",
            "or",
        }
    )
    return names


def index_scripts(root: Path, opcode_names: set[str]) -> ScriptIndex:
    idx = ScriptIndex()
    if not root.is_dir():
        return idx
    for path in sorted(root.rglob("*.txt")):
        text = path.read_text(encoding="latin-1", errors="replace")
        rel = _rel(root, path)
        idx.files_read += 1
        idx.defs.extend(_iter_defs(text, rel))
        idx.calls.extend(_iter_calls(text, rel, opcode_names))
    return idx


def call_stats(idx: ScriptIndex) -> dict[str, dict]:
    by_name: dict[str, list[CallSite]] = defaultdict(list)
    for call in idx.calls:
        by_name[call.name].append(call)
    out: dict[str, dict] = {}
    for name, sites in sorted(by_name.items()):
        arities = sorted({len(s.args) for s in sites})
        out[name] = {
            "count": len(sites),
            "kind": sites[0].kind,
            "arities": arities,
            "examples": [
                {"file": s.file, "line": s.line, "text": _format_call(s)}
                for s in _unique_examples(sites, 3)
            ],
        }
    return out


def def_catalog(idx: ScriptIndex) -> list[dict]:
    by_name: dict[str, list[ProcDef]] = defaultdict(list)
    for proc in idx.defs:
        by_name[proc.name].append(proc)
    rows = []
    for name in sorted(by_name, key=str.lower):
        defs = by_name[name]
        rows.append(
            {
                "name": name,
                "count": len(defs),
                "params": list(defs[0].params),
                "defined_in": [f"{d.file}:{d.line}" for d in defs[:8]],
            }
        )
    return rows


def _iter_defs(text: str, rel: str) -> list[ProcDef]:
    defs: list[ProcDef] = []
    for i, raw in enumerate(text.splitlines(), 1):
        line = _strip_comment(raw).strip()
        match = _CODE_DEF.match(line)
        if not match:
            continue
        name, argstr = match.group(1), match.group(2)
        params = tuple(a for a in split_args(argstr) if a)
        defs.append(ProcDef(name=name, params=params, file=rel, line=i))
    return defs


def _iter_calls(text: str, rel: str, opcode_names: set[str]) -> list[CallSite]:
    calls: list[CallSite] = []
    for i, raw in enumerate(text.splitlines(), 1):
        line = _strip_comment(raw)
        if not line.strip() or line.strip().startswith("code "):
            continue
        for name, args in _calls_in_line(line):
            if name == "code":
                continue
            kind = "opcode" if name in opcode_names else "user"
            calls.append(CallSite(name=name, args=tuple(args), file=rel, line=i, kind=kind))
    return calls


def _calls_in_line(line: str) -> list[tuple[str, list[str]]]:
    found: list[tuple[str, list[str]]] = []
    for match in _IDENT_CALL.finditer(line):
        name = match.group(1)
        open_paren = match.end() - 1
        close = _matching_paren(line, open_paren)
        if close is None:
            continue
        args = split_args(line[open_paren + 1 : close])
        found.append((name, args))
    return found


def split_args(s: str) -> list[str]:
    s = s.strip()
    if not s:
        return []
    args: list[str] = []
    cur: list[str] = []
    depth = 0
    in_str = False
    for ch in s:
        if in_str:
            cur.append(ch)
            if ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            cur.append(ch)
        elif ch == "(":
            depth += 1
            cur.append(ch)
        elif ch == ")":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            piece = "".join(cur).strip()
            if piece:
                args.append(piece)
            cur = []
        else:
            cur.append(ch)
    piece = "".join(cur).strip()
    if piece:
        args.append(piece)
    return args


def _matching_paren(s: str, open_idx: int) -> int | None:
    depth = 0
    in_str = False
    for i in range(open_idx, len(s)):
        ch = s[i]
        if in_str:
            if ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
    return None


def _strip_comment(line: str) -> str:
    in_str = False
    for i, ch in enumerate(line):
        if ch == '"':
            in_str = not in_str
        elif not in_str and line.startswith("//", i):
            return line[:i]
    return line


def _format_call(call: CallSite) -> str:
    inner = ", ".join(call.args)
    return f"{call.name} ({inner})" if inner else f"{call.name} ()"


def _unique_examples(sites: list[CallSite], limit: int) -> list[CallSite]:
    seen: set[str] = set()
    out: list[CallSite] = []
    for site in sites:
        key = _format_call(site)
        if key in seen:
            continue
        seen.add(key)
        out.append(site)
        if len(out) >= limit:
            break
    return out


def _rel(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()
