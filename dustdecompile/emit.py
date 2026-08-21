"""Write inventory, opcode tables, and a TypeScript stub."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from binary import kind_of
from inventory import Target
from ne import NeImage
from opcodes import Opcode, name_map, opcode_map
from pe import PeImage

TS_HEADER = """\
/**
 * Dust DreamFactory opcode table, recovered from DF.EXE by dustdecompile.
 * Generated file — do not edit. Re-run `python -m dustdecompile`.
 *
 * These are *names and ids*, not semantics. Verb behaviour still lives in
 * DF.EXE; see dustdecompile/docs/pipeline.md.
 */
"""


def write_all(
    dest: Path,
    *,
    targets: list[Target],
    images: dict[Path, PeImage | NeImage],
    opcodes: list[Opcode],
    plugin_notes: dict[str, Any],
) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    written.append(_write_json(dest / "inventory.json", _inventory_payload(targets, images)))
    written.append(_write_json(dest / "opcodes.json", _opcodes_payload(opcodes)))
    written.append(_write_ts(dest / "opcodes.ts", opcodes))
    written.append(_write_json(dest / "plugins.json", plugin_notes))
    written.append(_write_report(dest / "report.md", targets, images, opcodes, plugin_notes))
    return written


def _write_json(path: Path, payload: Any) -> Path:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def _write_ts(path: Path, opcodes: list[Opcode]) -> Path:
    by_id = opcode_map(opcodes)
    by_name = name_map(opcodes)
    lines = [TS_HEADER.rstrip(), ""]
    lines.append("export const DUST_OPCODE_NAMES: { readonly [id: number]: string } = {")
    for oid in sorted(by_id):
        lines.append(f"  {oid}: {json.dumps(by_id[oid])},")
    lines.append("};")
    lines.append("")
    lines.append("export const DUST_OPCODE_IDS: { readonly [name: string]: number } = {")
    for name in sorted(by_name, key=lambda n: (n.lower(), n)):
        lines.append(f"  {json.dumps(name)}: {by_name[name]},")
    lines.append("};")
    lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _inventory_payload(targets: list[Target], images: dict[Path, PeImage | NeImage]) -> dict[str, Any]:
    rows = []
    for target in targets:
        image = images.get(target.path)
        row: dict[str, Any] = {
            "role": target.role,
            "path": str(target.path),
            "name": target.path.name,
            "size": target.size,
            "sha256": target.sha256,
            "sha1": target.sha1,
            "kind": kind_of(image) if image is not None else None,
        }
        if isinstance(image, PeImage):
            row.update(
                {
                    "linker": image.linker,
                    "timestamp": image.timestamp_iso,
                    "imagebase": hex(image.imagebase),
                    "oep_rva": hex(image.oep_rva),
                    "compiler_hints": list(image.compiler_hints),
                    "sections": [
                        {
                            "name": s.name,
                            "va": hex(s.va),
                            "vsz": s.vsz,
                            "raw": s.raw,
                            "rsz": s.rsz,
                        }
                        for s in image.sections
                    ],
                    "imports": [
                        {"dll": imp.dll, "count": len(imp.names), "names": list(imp.names)}
                        for imp in image.imports
                    ],
                    "exports": [
                        {"name": e.name, "ordinal": e.ordinal, "rva": hex(e.rva)}
                        for e in image.exports
                    ],
                    "export_dll": image.export_dll,
                }
            )
        elif isinstance(image, NeImage):
            row.update(
                {
                    "flags": hex(image.flags),
                    "segment_count": image.segment_count,
                    "target_os": image.target_os,
                    "imported_modules": list(image.imported_modules),
                }
            )
        rows.append(row)
    return {"targets": rows}


def _opcodes_payload(opcodes: list[Opcode]) -> dict[str, Any]:
    return {
        "count": len(opcodes),
        "unique_ids": len({op.id for op in opcodes}),
        "unique_names": len({op.name for op in opcodes}),
        "record": "packed {char* name; u16 id} 6-byte groups, NUL-terminated",
        "opcodes": [
            {
                "id": op.id,
                "name": op.name,
                "file_offset": op.file_offset,
                "name_va": hex(op.name_va),
            }
            for op in opcodes
        ],
    }


def _write_report(
    path: Path,
    targets: list[Target],
    images: dict[Path, PeImage | NeImage],
    opcodes: list[Opcode],
    plugin_notes: dict[str, Any],
) -> Path:
    lines = [
        "# dustdecompile report",
        "",
        "Recovered from the local Dust install. Binaries are not committed.",
        "",
        "## Targets",
        "",
        "| Role | File | Kind | Size | SHA-1 |",
        "|---|---|---|---|---|",
    ]
    for target in targets:
        image = images.get(target.path)
        kind = kind_of(image) if image is not None else "?"
        lines.append(
            f"| {target.role} | `{target.path.name}` | {kind} | {target.size} | `{target.sha1}` |"
        )
    lines += ["", "## Opcodes", ""]
    by_id = opcode_map(opcodes)
    lines.append(
        f"Recovered **{len(opcodes)}** names / **{len(by_id)}** unique ids "
        "from packed 6-byte `{char* name; u16 id}` groups in `DF.EXE` `.data`."
    )
    lines.append("")
    lines.append("Dust-specific names (Titanic 4.0 DFET used different words for some of these ids):")
    lines.append("")
    for name in (
        "makeball",
        "stopball",
        "countballs",
        "pauseball",
        "isball",
        "indextoball",
        "floorscript",
        "sendtofloor",
        "sendtofloorfx",
        "scenefloor",
        "rowcoltoscene",
        "scenebuild",
        "scenerow",
        "scenecol",
        "setwidth",
        "setheight",
        "currentdir",
        "actorhitbox",
        "cacheinfo",
        "findfile",
    ):
        oid = name_map(opcodes).get(name)
        if oid is not None:
            lines.append(f"- `{name}` = {oid}")
    lines += ["", "## Plugins", ""]
    lines.append("```json")
    lines.append(json.dumps(plugin_notes, indent=2))
    lines.append("```")
    lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path
