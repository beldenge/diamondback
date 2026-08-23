"""Extract Dust .FLT puzzle flats: scripts and stills."""

from __future__ import annotations

import json
import struct
from pathlib import Path

from container import DFError, DFFile
from image import ImageError, decode_indexed_image, find_palette, write_indexed_png
from script import binary_script_to_text, decode_and_write_script, pascal_string
from set import looks_like_script


def write_flt_extract(
    df: DFFile,
    out_dir: Path,
    *,
    write_scripts: bool = True,
    write_frames: bool = False,
) -> dict[str, int]:
    if not df.containers:
        raise DFError(f"{df.path}: FLT has no containers")
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    if write_scripts:
        counts["scripts"] = _write_scripts(df, out_dir)
        flats = write_flt_flats(df, out_dir)
        if flats:
            counts["flats"] = len(flats)
    if write_frames:
        counts["frames"] = _write_frames(df, out_dir)
    return {key: value for key, value in counts.items() if value}


def parse_flt_flats(header: bytes) -> dict:
    """Named flats at the end of container 0: count, then script/still/buttons + Pascal name."""
    if len(header) < 48:
        return {}
    for count_at in range(len(header) - 4, 16, -4):
        count = struct.unpack_from("<i", header, count_at)[0]
        if count < 1 or count > 32:
            continue
        rec = count_at + 4
        if rec + count * 28 != len(header):
            continue
        stage = pascal_string(header, count_at - 16) if count_at >= 16 else ""
        flats = []
        for _ in range(count):
            script, still, buttons = struct.unpack_from("<iii", header, rec)
            name = pascal_string(header, rec + 12)
            rec += 28
            flats.append(
                {
                    "name": name,
                    "script": script,
                    "still": still,
                    "buttons": buttons,
                }
            )
        return {"stage": stage, "flats": flats}
    return {}


def write_flt_flats(df: DFFile, out_dir: Path) -> list[dict]:
    payload = parse_flt_flats(df.containers[0].data)
    flats = payload.get("flats") or []
    if not flats:
        return []
    for flat in flats:
        script_id = int(flat["script"])
        if 0 <= script_id < len(df.containers) and looks_like_script(
            df.containers[script_id].data
        ):
            text = binary_script_to_text(df.containers[script_id].data)
            first = text.split("\n", 1)[0].strip()
            proc = first.replace("code ", "").replace("()", "").strip()
            safe = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in proc)
            flat["file"] = f"{safe}_{script_id}.json"
        else:
            flat["file"] = f"script_{script_id}.json"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "flats.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    return flats


def _write_scripts(df: DFFile, out_dir: Path) -> int:
    written = 0
    first_plain: set[str] = set()
    for index, container in enumerate(df.containers[1:], start=1):
        if not looks_like_script(container.data):
            continue
        text = binary_script_to_text(container.data)
        if len(text) <= 1:
            continue
        first = text.split("\n", 1)[0].strip()
        name = first.replace("code ", "").replace("()", "").strip() or f"script_{index}"
        safe = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in name)
        if decode_and_write_script(out_dir / f"{safe}_{index}.txt", container.data):
            written += 1
        if safe not in first_plain:
            first_plain.add(safe)
            decode_and_write_script(out_dir / f"{safe}.txt", container.data)
    return written


def _write_frames(df: DFFile, out_dir: Path) -> int:
    palette = find_palette(df.containers[0].data)
    if palette is None:
        return 0
    written = 0
    for index, container in enumerate(df.containers):
        if len(container.data) < 1000:
            continue
        dest = out_dir / f"frame_{index}.png"
        try:
            image = decode_indexed_image(container.data)
        except ImageError:
            continue
        write_indexed_png(dest, image, palette)
        written += 1
    return written
