"""Index an existing dfextract dump: file graph, line ids, globals.

Does not re-decode containers. Run after `python cli.py --scripts` (or a
full dump). Output: `<out>/catalog.json`.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

TYPE_SUFFIX = {
    "BOOT": "",
    "PUP": ".pup",
    "SET": ".set",
    "FLT": ".flt",
    "PRP": ".prp",
    "MOV": ".mov",
    "CST": ".cst",
    "SND": ".snd",
}

GLOBAL_RE = re.compile(r"^\s*global\s+(.+)$", re.M)


def write_catalog(out_dir: Path) -> dict[str, Any]:
    payload = build_catalog(out_dir)
    dest = out_dir / "catalog.json"
    dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def build_catalog(out_dir: Path) -> dict[str, Any]:
    files: dict[str, dict[str, Any]] = {}
    line_ids: dict[str, str] = {}
    globals_found: Counter[str] = Counter()
    scripts: list[str] = []

    if not out_dir.is_dir():
        return {
            "files": {},
            "line_ids": {},
            "globals": [],
            "scripts": [],
        }

    for type_dir in TYPE_SUFFIX:
        root = out_dir / type_dir
        if not root.is_dir():
            continue
        for folder in sorted(p for p in root.iterdir() if p.is_dir()):
            game_name = _folder_to_game_name(type_dir, folder.name)
            rel = f"{type_dir}/{folder.name}"
            entry: dict[str, Any] = {"type": type_dir, "dir": rel}
            csv_path = folder / "AUDIO" / "texts.csv"
            if csv_path.is_file():
                n_lines = 0
                with csv_path.open(encoding="utf-8", newline="") as handle:
                    reader = csv.DictReader(handle)
                    for row in reader:
                        ident = (row.get("Identifier") or "").strip()
                        if not ident:
                            continue
                        n_lines += 1
                        wav = f"{rel}/AUDIO/{ident}.wav"
                        line_ids[ident] = wav
                entry["dialogue"] = n_lines
            txts = sorted(folder.rglob("*.txt"))
            entry["scripts"] = len(txts)
            for txt in txts:
                rel_txt = txt.relative_to(out_dir).as_posix()
                scripts.append(rel_txt)
                text = txt.read_text(encoding="utf-8", errors="replace")
                for match in GLOBAL_RE.finditer(text):
                    chunk = match.group(1).split("//")[0]
                    for part in chunk.split(","):
                        ident = part.strip()
                        if ident:
                            globals_found[ident] += 1
            files[game_name] = entry

    return {
        "files": files,
        "line_ids": line_ids,
        "globals": [
            {"name": name, "declarations": count}
            for name, count in globals_found.most_common()
        ],
        "scripts": scripts,
    }


def _folder_to_game_name(type_dir: str, folder: str) -> str:
    stem = folder[1:] if folder.startswith("_") else folder
    stem = stem.lower()
    if type_dir == "BOOT":
        return "bootfile"
    suffix = TYPE_SUFFIX[type_dir]
    return stem + suffix
