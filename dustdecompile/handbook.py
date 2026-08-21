"""Build the agent-facing opcode / library handbook."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from facts import EXTRACT_TXT_ALIASES, HOOKS, LIBRARY, OPCODES
from opcodes import Opcode, name_map, opcode_band, opcode_map
from scripts import (
    ScriptIndex,
    call_stats,
    def_catalog,
    default_opcode_names,
    index_scripts,
)


def build_handbook(
    opcodes: list[Opcode],
    scripts_root: Path | None,
) -> dict[str, Any]:
    dust_names = {op.name for op in opcodes}
    opcode_names = default_opcode_names(dust_names, EXTRACT_TXT_ALIASES)
    idx = (
        index_scripts(scripts_root, opcode_names)
        if scripts_root is not None
        else ScriptIndex()
    )
    stats = call_stats(idx)
    defs = def_catalog(idx)
    by_id = opcode_map(opcodes)
    by_name = name_map(opcodes)

    opcode_entries = []
    for fact in OPCODES:
        name = fact["name"]
        entry = dict(fact)
        entry["band"] = opcode_band(fact["id"]) if fact.get("id") else None
        mined = _merged_stats(name, fact.get("id"), stats)
        entry["call_count"] = mined["count"]
        entry["arities_seen"] = mined["arities"]
        entry["examples"] = mined["examples"]
        opcode_entries.append(entry)

    return {
        "scripts_indexed": idx.files_read,
        "opcode_count": len(opcodes),
        "aliases": [
            {
                "id": oid,
                "extract_txt": txt,
                "dust_exe": dust,
            }
            for oid, (txt, dust) in sorted(EXTRACT_TXT_ALIASES.items())
        ],
        "hooks": [{"name": n, "summary": s} for n, s in HOOKS.items()],
        "library": [
            {"name": n, **body, "defined_in_dump": [d.file + f":{d.line}" for d in idx.defs_named(n)]}
            for n, body in LIBRARY.items()
        ],
        "opcodes": opcode_entries,
        "all_opcodes": [
            {
                "id": op.id,
                "dust_name": op.name,
                "extract_txt_name": EXTRACT_TXT_ALIASES.get(op.id, (op.name, op.name))[0],
                "band": opcode_band(op.id),
                "call_count": _merged_stats(op.name, op.id, stats)["count"],
            }
            for op in opcodes
        ],
        "procedures": defs,
        "dust_name_by_id": {str(i): n for i, n in by_id.items()},
        "id_by_dust_name": by_name,
    }


def render_markdown(data: dict[str, Any]) -> str:
    lines: list[str] = []
    lines += [
        "# Dust engine handbook",
        "",
        "For an agent rebuilding Dust. **Scripts are the storyboard. This file is the rulebook.**",
        "How we got this out of the EXEs (hashes, table layout, vs prior work): "
        "[findings.md](findings.md).",
        "",
        "Confidence tags: `proven-scripts` (control flow in the dump shows it), "
        "`inferred` (high confidence from usage, not proven inside DF.EXE), "
        "`unknown` (do not guess).",
        "",
        f"Indexed **{data['scripts_indexed']}** pretty-printed scripts from `dfextract/out` "
        f"and **{data['opcode_count']}** names from `DF.EXE`.",
        "",
        "## 1. Do not mix Titanic names with Dust names",
        "",
        "`dfextract` still prints DreamFactory 4.0 (Titanic) names. Dust’s own table in "
        "`DF.EXE` differs on these ids. When you read a `.txt` script, translate:",
        "",
        "| Id | Name in `.txt` | Name in `DF.EXE` |",
        "|---|---|---|",
    ]
    for row in data["aliases"]:
        lines.append(f"| {row['id']} | `{row['extract_txt']}` | `{row['dust_exe']}` |")
    lines += [
        "",
        "`currentview` in scripts **is** Dust `currentdir` (id 16011). "
        "`spotmovie` / `gototown` / `gotointerior` are **not** opcodes — they are library procedures in `new.flt`.",
        "",
        "## 2. Engine hooks (procedures Dust calls by name)",
        "",
        "These are `code` blocks, not opcodes. If a SET/PUP/BOOT file defines one, the engine invokes it.",
        "",
    ]
    for hook in data["hooks"]:
        lines.append(f"- `{hook['name']}` — {hook['summary']}")
    lines += [
        "",
        "## 3. Game library (`new.flt` / inventory)",
        "",
        "Boot does `openstagefile (\"new.flt\")`. SET scripts then `sendtostage (spotmovie (…))` etc.",
        "",
    ]
    for lib in data["library"]:
        lines.append(f"### `{lib['name']}`")
        lines.append("")
        lines.append(lib.get("summary", ""))
        if lib.get("args"):
            lines.append("")
            lines.append(f"- **Args:** {lib['args']}")
        if lib.get("returns"):
            lines.append(f"- **Returns:** {lib['returns']}")
        lines.append(f"- **Defined in:** {lib.get('defined_in', '')}")
        if lib.get("defined_in_dump"):
            lines.append(f"- **Dump:** {', '.join(lib['defined_in_dump'][:4])}")
        for note in lib.get("notes") or []:
            lines.append(f"- {note}")
        lines.append("")
    lines += [
        "## 4. High-value opcodes",
        "",
        "Id bands (observed): `4xxx` language, `8xxx` operator, `12xxx` command, "
        "`16xxx` field get/set, `20xxx` function (returns a value), `24xxx` transition.",
        "",
    ]
    for op in data["opcodes"]:
        lines.append(f"### `{op['name']}` ({op.get('id')}, {op.get('band')})")
        lines.append("")
        lines.append(op.get("summary", ""))
        lines.append("")
        lines.append(f"- **Confidence:** {op.get('confidence', 'unknown')}")
        if op.get("args"):
            lines.append(f"- **Args:** {op['args']}")
        if op.get("returns"):
            lines.append(f"- **Returns:** {op['returns']}")
        if op.get("blocking"):
            lines.append(f"- **Blocks:** {op['blocking']}")
        lines.append(f"- **Calls in dump:** {op.get('call_count', 0)}"
                     + (f"  arities {op['arities_seen']}" if op.get("arities_seen") else ""))
        for note in op.get("notes") or []:
            lines.append(f"- {note}")
        for ex in op.get("examples") or []:
            text = ex["text"] if isinstance(ex, dict) else ex
            loc = f"{ex['file']}:{ex['line']}" if isinstance(ex, dict) else ""
            lines.append(f"- Example: `{text}`" + (f"  ({loc})" if loc else ""))
        lines.append("")
    lines += [
        "## 5. Still unknown (do not invent)",
        "",
        "- Exact `framerate (3)` and `delay (n)` units; SET walk fps (~24) is from play, not DF.EXE.",
        "- MOV reel timing / audio cues (see dfextract reconstruction-gaps §4a).",
        "- `walktostar` async vs blocking; `actorxyz` units.",
        "- Save file layout (`savegame` / `opengame`).",
        "- `pluginfx(\"checkmove\", …)` encoding inside CHECKERS.DLL (scripts already parse the returned string).",
        "- UI chrome bitmaps for `cursor (\"touch\")` etc.",
        "- Mouth/`animLogic` visemes on PUP lines.",
        "",
        "## 6. Every Dust opcode",
        "",
        "| Id | Dust name | Name in `.txt` | Band | Calls |",
        "|---|---|---|---|---|",
    ]
    for row in sorted(data["all_opcodes"], key=lambda r: (r["id"], r["dust_name"])):
        txt = row["extract_txt_name"]
        same = "" if txt == row["dust_name"] else txt
        lines.append(
            f"| {row['id']} | `{row['dust_name']}` | {same or '—'} | {row['band']} | {row['call_count']} |"
        )
    lines += [
        "",
        "## 7. User procedures in the dump",
        "",
        "Every `code name (` we parsed. Duplicates are the same hook on many files "
        "(e.g. `runyoself` on each PUP, `setupactor` on each CST).",
        "",
        "| Name | # | Params | First definitions |",
        "|---|---|---|---|",
    ]
    for proc in data["procedures"]:
        params = ", ".join(proc["params"])
        where = ", ".join(f"`{p}`" for p in proc["defined_in"][:3])
        lines.append(f"| `{proc['name']}` | {proc['count']} | {params} | {where} |")
    lines.append("")
    return "\n".join(lines)


def write_handbook(dest: Path, data: dict[str, Any]) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    json_path = dest / "handbook.json"
    md_path = dest / "handbook.md"
    json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(data), encoding="utf-8")
    return [json_path, md_path]


def _txt_name(oid: int | None) -> str:
    if oid is None:
        return ""
    pair = EXTRACT_TXT_ALIASES.get(oid)
    return pair[0] if pair else ""


def _merged_stats(name: str, oid: int | None, stats: dict[str, dict]) -> dict:
    names = [name]
    txt = _txt_name(oid)
    if txt and txt not in names:
        names.append(txt)
    count = 0
    arities: set[int] = set()
    examples: list[dict] = []
    seen: set[str] = set()
    for key in names:
        row = stats.get(key)
        if not row:
            continue
        count += row["count"]
        arities.update(row.get("arities") or [])
        for ex in row.get("examples") or []:
            text = ex["text"] if isinstance(ex, dict) else str(ex)
            if text in seen:
                continue
            seen.add(text)
            examples.append(ex)
            if len(examples) >= 3:
                break
    return {"count": count, "arities": sorted(arities), "examples": examples}
