"""Extract Dust .CST (cast) scripts and sprites.

Layout follows DFET DFcst.h.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

from container import DFError, DFFile, read_df_file
from script import (
    binary_script_to_text,
    decode_and_write_script,
    pascal_string,
    tokenize_script,
    write_script_files,
)
from set import looks_like_script


@dataclass
class CastActor:
    name: str
    logic_container: int
    script_container: int
    set_count: int
    script: str
    tokens: list


def extract_cst(df: DFFile) -> list[CastActor]:
    if not df.containers:
        raise DFError(f"{df.path}: CST has no containers")
    header = df.containers[0].data
    if len(header) < 0x93C:
        raise DFError(f"{df.path}: CST container 0 is too small for an actor table")

    version = struct.unpack_from("<i", header, 2)[0]
    if version > 4:
        raise DFError(f"{df.path}: CST version {version} is newer than Dust")

    count = struct.unpack_from("<i", header, 0x938)[0]
    if count < 0 or count > 10_000:
        raise DFError(f"{df.path}: implausible CST actor count {count}")

    actors: list[CastActor] = []
    cursor = 0x93C
    for _ in range(count):
        if cursor + 4 > len(header):
            raise DFError(f"{df.path}: CST actor table overruns container 0")
        logic_index = struct.unpack_from("<i", header, cursor)[0]
        cursor += 16
        if logic_index < 0 or logic_index >= len(df.containers):
            raise DFError(f"{df.path}: actor logic container {logic_index} out of range")
        logic = df.containers[logic_index].data
        if len(logic) < 0x5E:
            raise DFError(f"{df.path}: actor logic container {logic_index} too small")
        script_index = struct.unpack_from("<i", logic, 0x26)[0]
        name = pascal_string(logic, 0x2A)
        set_count = struct.unpack_from("<i", logic, 0x5A)[0]
        if script_index < 0 or script_index >= len(df.containers):
            raise DFError(f"{df.path}: actor {name!r} script container {script_index} out of range")
        data = df.containers[script_index].data
        text = binary_script_to_text(data)
        if len(text) <= 1:
            continue
        actors.append(
            CastActor(
                name=name,
                logic_container=logic_index,
                script_container=script_index,
                set_count=set_count,
                script=text,
                tokens=tokenize_script(data),
            )
        )
    return actors


def write_cst_scripts(
    actors: list[CastActor], out_dir: Path, df: DFFile | None = None
) -> list[Path]:
    written: list[Path] = []
    for actor in actors:
        folder = out_dir / actor.name
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / "Script.txt"
        write_script_files(path, actor.script, actor.tokens)
        written.append(path)
    if df is not None:
        used = {actor.script_container for actor in actors}
        extra = 0
        for index, container in enumerate(df.containers):
            if index in used or not looks_like_script(container.data):
                continue
            name = "Cast.txt" if extra == 0 else f"Cast_{index}.txt"
            if decode_and_write_script(out_dir / name, container.data):
                written.append(out_dir / name)
                extra += 1
    return written


def detect_contact_shadows(
    df: DFFile, palette, frame_ids: list[int]
) -> frozenset[int]:
    """Palette indices that are a foot-blob, not boots or clothes.

    Stand frames put the photographed shadow in the bottom quarter. A
    dark maroon index (8 ≤ max(rgb) ≤ 50) with ≥80% of its pixels there
    is that matte (GANG 131 = 25,17,17 on Leroy/Jones/…). Skip unused
    black — Help's **legs** are pal 0 (unused 0xFFFF, SET VGA black);
    the robe is other greens. Do not apply this to PUP faces.
    """
    from collections import Counter

    from image import (
        CONTACT_SHADOW_MAX,
        CONTACT_SHADOW_MIN,
        ImageError,
        decode_trans_indices,
    )

    total: Counter[int] = Counter()
    bottom: Counter[int] = Counter()
    for frame_id in frame_ids:
        if frame_id < 0 or frame_id >= len(df.containers):
            continue
        try:
            width, height, _x, _y, indices = decode_trans_indices(
                df.containers[frame_id].data
            )
        except ImageError:
            continue
        cut = (height * 3) // 4
        for y in range(height):
            row = y * width
            for x in range(width):
                index = indices[row + x]
                if index == 255:
                    continue
                total[index] += 1
                if y >= cut:
                    bottom[index] += 1
    shadows: set[int] = set()
    for index, count in total.items():
        if count < 40:
            continue
        if bottom[index] / count < 0.8:
            continue
        red, green, blue = palette.colors[index]
        luma = max(red, green, blue)
        if luma > CONTACT_SHADOW_MAX or luma < CONTACT_SHADOW_MIN:
            continue
        shadows.add(index)
    return frozenset(shadows)


def cst_frame_facing(info: bytes, frame_i: int) -> tuple[int, int, int] | None:
    """setInfo 44-byte record: container id, +8 pose, +0x28 deg (DF.EXE 0x4154c0)."""
    rec = 0x76 + frame_i * 44
    if rec + 42 > len(info):
        return None
    frame_id = struct.unpack_from("<i", info, rec)[0]
    pose = struct.unpack_from("<h", info, rec + 8)[0]
    deg = struct.unpack_from("<h", info, rec + 40)[0] & 0xFF
    return frame_id, pose, deg


def companion_set_path(cst_path: Path) -> Path | None:
    """TARGET.CST sits next to TARGET.SET. Sprites index-blit with that still pal."""
    for ext in (".SET", ".set"):
        candidate = cst_path.with_suffix(ext)
        if candidate.is_file():
            return candidate
    return None


def cst_palette_misses_sprites(df: DFFile, palette) -> bool:
    """True when opaque sprite indices are unused slots in the CST ColorPalette."""
    from image import ImageError, decode_trans_indices

    unused = 0
    total = 0
    for container in df.containers[1:40]:
        try:
            _h, _w, _y, _x, indices = decode_trans_indices(container.data)
        except (ImageError, ValueError, struct.error):
            continue
        for index in indices:
            if index == 255:
                continue
            total += 1
            if index >= len(palette.colors) or palette.colors[index] == (0, 0, 0):
                unused += 1
        if total >= 2000:
            break
    return total > 50 and unused / total > 0.7


def cst_frame_palette(df: DFFile, cst_path: Path | None = None):
    from image import cst_palette, find_palette

    palette = cst_palette(df.containers[0].data)
    path = cst_path or df.path
    set_path = companion_set_path(path) if path else None
    if not set_path or not cst_palette_misses_sprites(df, palette):
        return palette
    sibling = read_df_file(set_path)
    if not sibling.containers:
        return palette
    # Index-blit onto the SET still: VGA index 0 is black (crow bodies,
    # Help's legs). Default find_palette unused-white washed those to
    # blank. Used SET slots stay the still colors (bottles, plates).
    set_pal = find_palette(sibling.containers[0].data, unused_rgb=(0, 0, 0))
    return set_pal if set_pal else palette


def write_cst_frames(df: DFFile, out_dir: Path) -> int:
    from image import ImageError, decode_trans_sprite, sprite_record, write_png

    if not df.containers:
        raise DFError(f"{df.path}: CST has no containers")
    header = df.containers[0].data
    if len(header) < 0x93C:
        raise DFError(f"{df.path}: CST container 0 is too small for an actor table")

    count = struct.unpack_from("<i", header, 0x938)[0]
    palette = cst_frame_palette(df)
    written = 0
    actors: dict[str, dict[str, list]] = {}
    cursor = 0x93C
    for _ in range(count):
        logic_index = struct.unpack_from("<i", header, cursor)[0]
        cursor += 16
        if logic_index < 0 or logic_index >= len(df.containers):
            continue
        logic = df.containers[logic_index].data
        if len(logic) < 0x5E:
            continue
        actor_name = pascal_string(logic, 0x2A)
        set_count = struct.unpack_from("<i", logic, 0x5A)[0]
        set_cursor = 0x5E
        poses: list[tuple[str, list[int], list[tuple[int, int, int]]]] = []
        stand_ids: list[int] = []
        for _set in range(set_count):
            if set_cursor + 32 > len(logic):
                break
            set_info = struct.unpack_from("<i", logic, set_cursor)[0]
            set_name = pascal_string(logic, set_cursor + 16)
            set_cursor += 32
            if set_info < 0 or set_info >= len(df.containers):
                continue
            info = df.containers[set_info].data
            if len(info) < 0x76:
                continue
            frame_count = struct.unpack_from("<i", info, 0x72)[0]
            frame_ids: list[int] = []
            frame_meta: list[tuple[int, int, int]] = []
            for frame_i in range(frame_count):
                rec = 0x76 + frame_i * 44
                if rec + 4 > len(info):
                    break
                facing = cst_frame_facing(info, frame_i)
                frame_id = facing[0] if facing else struct.unpack_from("<i", info, rec)[0]
                if 0 <= frame_id < len(df.containers):
                    frame_ids.append(frame_id)
                    if facing:
                        frame_meta.append(facing)
            if not frame_ids:
                continue
            poses.append((set_name, frame_ids, frame_meta))
            if set_name.lower() == "stand":
                stand_ids = frame_ids[:2]
        shadows = detect_contact_shadows(df, palette, stand_ids)
        for set_name, frame_ids, frame_meta in poses:
            folder = out_dir / actor_name / set_name
            meta_by_id = {fid: (pose, deg) for fid, pose, deg in frame_meta}
            for frame_i, frame_id in enumerate(frame_ids):
                try:
                    sprite = decode_trans_sprite(
                        df.containers[frame_id].data, palette, shadows
                    )
                except ImageError:
                    continue
                write_png(folder / f"frame_{frame_id}.png", sprite)
                rel = f"{actor_name}/{set_name}/frame_{frame_id}.png"
                extra: dict = {"id": frame_id, "index": frame_i}
                if frame_id in meta_by_id:
                    extra["pose"] = meta_by_id[frame_id][0]
                    extra["deg"] = meta_by_id[frame_id][1]
                bag = actors.setdefault(actor_name, {})
                bag.setdefault(set_name, []).append(
                    sprite_record(sprite, rel, extra=extra)
                )
                written += 1
    (out_dir / "sprites.json").write_text(
        json.dumps({"screen": [512, 384], "actors": actors}, indent=2) + "\n",
        encoding="utf-8",
    )
    write_cst_timing(df, out_dir)
    return written


def extract_cst_timing(df: DFFile) -> dict[str, dict[str, list[int]]]:
    """CST setInfo +0x2e pose table, length at +0x70 (DF.EXE 0x4154c0)."""
    if not df.containers:
        return {}
    header = df.containers[0].data
    if len(header) < 0x93C:
        return {}
    count = struct.unpack_from("<i", header, 0x938)[0]
    out: dict[str, dict[str, list[int]]] = {}
    cursor = 0x93C
    for _ in range(count):
        if cursor + 4 > len(header):
            break
        logic_index = struct.unpack_from("<i", header, cursor)[0]
        cursor += 16
        if logic_index < 0 or logic_index >= len(df.containers):
            continue
        logic = df.containers[logic_index].data
        if len(logic) < 0x5E:
            continue
        actor_name = pascal_string(logic, 0x2A)
        set_count = struct.unpack_from("<i", logic, 0x5A)[0]
        set_cursor = 0x5E
        poses: dict[str, list[int]] = {}
        for _set in range(set_count):
            if set_cursor + 32 > len(logic):
                break
            set_info = struct.unpack_from("<i", logic, set_cursor)[0]
            set_name = pascal_string(logic, set_cursor + 16)
            set_cursor += 32
            if set_info < 0 or set_info >= len(df.containers):
                continue
            info = df.containers[set_info].data
            if len(info) < 0x72:
                continue
            seq = struct.unpack_from("<h", info, 0x70)[0]
            if seq < 1 or seq > 256:
                continue
            table = [struct.unpack_from("<h", info, 0x2E + i * 2)[0] for i in range(seq)]
            poses[set_name] = table
        if poses:
            out[actor_name] = poses
    return out


def write_cst_timing(df: DFFile, out_dir: Path) -> int:
    timing = extract_cst_timing(df)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "timing.json").write_text(
        json.dumps(timing, indent=2) + "\n", encoding="utf-8"
    )
    return sum(len(v) for v in timing.values())
