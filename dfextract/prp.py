"""Extract Dust .PRP props: scripts and named sprites.

Group table matches Titanic SHP (DFET DFshp.h) at container 0 + 2360,
even though Dust is engine version 1.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

from container import DFError, DFFile
from image import (
    ImageError,
    decode_indexed_image,
    decode_trans_sprite,
    find_palette,
    sprite_record,
    write_indexed_png,
    write_png,
)
from cst import extract_cst_timing
from script import binary_script_to_text, decode_and_write_script, pascal_string
from set import looks_like_script


@dataclass
class PropFrame:
    group: str
    state: str
    container: int
    index_in_state: int


def _safe_name(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in name)
    return cleaned.strip() or "unnamed"


def write_prp_extract(
    df: DFFile,
    out_dir: Path,
    *,
    write_scripts: bool = True,
    write_frames: bool = False,
) -> dict[str, int]:
    if not df.containers:
        raise DFError(f"{df.path}: PRP has no containers")
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    if write_scripts:
        counts["scripts"] = _write_scripts(df, out_dir)
    if write_frames:
        counts["frames"] = _write_frames(df, out_dir)
    timing = extract_cst_timing(df)
    if timing:
        (out_dir / "timing.json").write_text(
            json.dumps(timing, indent=2) + "\n", encoding="utf-8"
        )
        counts["timing"] = sum(len(v) for v in timing.values())
    return {key: value for key, value in counts.items() if value}


def _write_scripts(df: DFFile, out_dir: Path) -> int:
    written = 0
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
    return written


def parse_prp_catalog(df: DFFile) -> list[PropFrame]:
    header = df.containers[0].data
    if len(header) < 2364:
        return []
    group_count = struct.unpack_from("<i", header, 2360)[0]
    if group_count < 0 or group_count > 10_000:
        return []
    catalog: list[PropFrame] = []
    cursor = 2364
    for _ in range(group_count):
        if cursor + 4 > len(header):
            break
        logic_id = struct.unpack_from("<i", header, cursor)[0]
        cursor += 16
        if logic_id < 0 or logic_id >= len(df.containers):
            continue
        logic = df.containers[logic_id].data
        if len(logic) < 94:
            continue
        group = _safe_name(pascal_string(logic, 42))
        entry_count = struct.unpack_from("<i", logic, 90)[0]
        entry_at = 94
        for _entry in range(entry_count):
            if entry_at + 32 > len(logic):
                break
            entry_id = struct.unpack_from("<i", logic, entry_at)[0]
            state = _safe_name(pascal_string(logic, entry_at + 16))
            entry_at += 32
            if entry_id < 0 or entry_id >= len(df.containers):
                continue
            info = df.containers[entry_id].data
            if len(info) < 118:
                continue
            frame_count = struct.unpack_from("<i", info, 114)[0]
            for frame_i in range(frame_count):
                rec = 118 + frame_i * 44
                if rec + 4 > len(info):
                    break
                frame_id = struct.unpack_from("<i", info, rec)[0]
                catalog.append(
                    PropFrame(
                        group=group,
                        state=state,
                        container=frame_id,
                        index_in_state=frame_i,
                    )
                )
    return catalog


def _write_one_frame(df: DFFile, container_id: int, dest: Path, palette) -> dict | None:
    if container_id < 0 or container_id >= len(df.containers):
        return None
    data = df.containers[container_id].data
    if len(data) < 16:
        return None
    height, width = struct.unpack_from("<hh", data, 0)
    try:
        if 1 <= height <= 256 and 1 <= width <= 256 and len(data) < 20_000:
            sprite = decode_trans_sprite(data, palette)
            write_png(dest, sprite)
            return sprite_record(sprite, dest.name)
        if len(data) >= 64:
            write_indexed_png(dest, decode_indexed_image(data), palette)
            return {"w": width, "h": height}
    except ImageError:
        return None
    return None


def _write_frames(df: DFFile, out_dir: Path) -> int:
    # Unused ColorPalette is R=G=B=-1 (0xFFFF). High byte is white.
    # CST Help's robe needs unused→black; INVEN HUD holes are that
    # unused slot sampled in the sprite (gun trigger, HELP counters).
    unused = (255, 255, 255) if df.path.stem.upper() == "INVEN" else (0, 0, 0)
    palette = find_palette(df.containers[0].data, unused_rgb=unused)
    if palette is None:
        return 0
    catalog = parse_prp_catalog(df)
    written = 0
    named: set[int] = set()
    manifest = []
    for item in catalog:
        dest = (
            out_dir
            / "FRAMES"
            / item.group
            / item.state
            / f"{item.index_in_state:02d}_c{item.container}.png"
        )
        meta = _write_one_frame(df, item.container, dest, palette)
        if meta is not None:
            written += 1
            named.add(item.container)
            rec = {
                "group": item.group,
                "state": item.state,
                "index": item.index_in_state,
                "container": item.container,
                "path": str(dest.relative_to(out_dir)).replace("\\", "/"),
            }
            rec.update(meta)
            rec["path"] = str(dest.relative_to(out_dir)).replace("\\", "/")
            manifest.append(rec)
    # Anything the table did not name still gets a loose dump.
    for index, container in enumerate(df.containers[1:], start=1):
        if index in named or len(container.data) < 16:
            continue
        dest = out_dir / "FRAMES" / "_unnamed" / f"frame_{index}.png"
        if _write_one_frame(df, index, dest, palette) is not None:
            written += 1
    (out_dir / "props.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    frames_root = out_dir / "FRAMES"
    if catalog:
        for leftover in frames_root.glob("frame_*.png"):
            leftover.unlink()
    return written
