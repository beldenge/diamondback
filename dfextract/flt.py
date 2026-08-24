"""Extract Dust .FLT puzzle flats: scripts and stills."""

from __future__ import annotations

import json
import struct
from pathlib import Path

from container import DFError, DFFile
from image import ImageError, decode_indexed_image, find_palette, write_indexed_png
from script import binary_script_to_text, decode_and_write_script, pascal_string
from set import looks_like_script

# FLT comments pretty-print as `//` and tokenize as opcode 8004 (`/`).
# Poker/blackjack flats start with those comments, not `code`.
CMD_CODE = 4001
CMD_SLASH = 8004


def looks_like_flt_script(data: bytes) -> bool:
    """Script container: starts with `code`, or `//` comments then `code`."""
    if looks_like_script(data):
        return True
    if len(data) < 16:
        return False
    if struct.unpack_from("<H", data, 0)[0] != CMD_SLASH:
        return False
    pos = 0
    end = min(len(data), 65_536)
    while pos + 8 <= end:
        cmd = struct.unpack_from("<H", data, pos)[0]
        if cmd == 0:
            return False
        if cmd == CMD_CODE:
            return True
        pos += 8
    return False


def script_proc_name(text: str) -> str:
    """First `code` proc, skipping leading `//` comments."""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("code "):
            return stripped[5:].replace("()", "").strip() or "script"
    return "script"


def safe_script_name(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in name)


def parse_flt_buttons(data: bytes) -> list[dict]:
    """32-byte FLT button records: flags, Mac rect, script, 16-byte Pascal name."""
    if len(data) < 4:
        return []
    count = struct.unpack_from("<i", data, 0)[0]
    if count < 1 or count > 64:
        return []
    hits: list[dict] = []
    rec = 4
    for _ in range(count):
        if rec + 32 > len(data):
            break
        flags = struct.unpack_from("<i", data, rec)[0]
        top, left, bottom, right = struct.unpack_from("<hhhh", data, rec + 4)
        script = struct.unpack_from("<i", data, rec + 12)[0]
        name = pascal_string(data, rec + 16)
        rec += 32
        hits.append(
            {
                "name": name,
                "top": top,
                "left": left,
                "bottom": bottom,
                "right": right,
                "script": script,
                "flags": flags,
            }
        )
    return hits


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
        still_id = int(flat["still"])
        button_id = int(flat["buttons"])
        flat["stillFile"] = f"frame_{still_id}.png"
        if 0 <= script_id < len(df.containers) and looks_like_flt_script(
            df.containers[script_id].data
        ):
            text = binary_script_to_text(df.containers[script_id].data)
            safe = safe_script_name(script_proc_name(text))
            flat["file"] = f"{safe}_{script_id}.json"
        else:
            flat["file"] = f"script_{script_id}.json"
        hits: list[dict] = []
        if 0 <= button_id < len(df.containers):
            hits = parse_flt_buttons(df.containers[button_id].data)
        for hit in hits:
            sid = int(hit["script"])
            if 0 <= sid < len(df.containers) and looks_like_flt_script(
                df.containers[sid].data
            ):
                text = binary_script_to_text(df.containers[sid].data)
                safe = safe_script_name(script_proc_name(text))
                hit["file"] = f"{safe}_{sid}.json"
            else:
                hit["file"] = f"script_{sid}.json"
        flat["hits"] = hits
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "flats.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    return flats


def _write_scripts(df: DFFile, out_dir: Path) -> int:
    written = 0
    first_plain: set[str] = set()
    for index, container in enumerate(df.containers[1:], start=1):
        if not looks_like_flt_script(container.data):
            continue
        text = binary_script_to_text(container.data)
        if len(text) <= 1:
            continue
        safe = safe_script_name(script_proc_name(text))
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
