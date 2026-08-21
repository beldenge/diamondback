"""Extract Dust .CST (cast) scripts and sprites.

Layout follows DFET DFcst.h.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

from container import DFError, DFFile
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


def write_cst_frames(df: DFFile, out_dir: Path) -> int:
    from image import ImageError, cst_palette, decode_trans_sprite, sprite_record, write_png

    if not df.containers:
        raise DFError(f"{df.path}: CST has no containers")
    header = df.containers[0].data
    if len(header) < 0x93C:
        raise DFError(f"{df.path}: CST container 0 is too small for an actor table")

    count = struct.unpack_from("<i", header, 0x938)[0]
    palette = cst_palette(header)
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
            folder = out_dir / actor_name / set_name
            for frame_i in range(frame_count):
                rec = 0x76 + frame_i * 44
                if rec + 4 > len(info):
                    break
                frame_id = struct.unpack_from("<i", info, rec)[0]
                if frame_id < 0 or frame_id >= len(df.containers):
                    continue
                try:
                    sprite = decode_trans_sprite(
                        df.containers[frame_id].data, palette
                    )
                except ImageError:
                    continue
                write_png(folder / f"frame_{frame_id}.png", sprite)
                rel = f"{actor_name}/{set_name}/frame_{frame_id}.png"
                poses = actors.setdefault(actor_name, {})
                poses.setdefault(set_name, []).append(
                    sprite_record(
                        sprite,
                        rel,
                        extra={"id": frame_id, "index": frame_i},
                    )
                )
                written += 1
    (out_dir / "sprites.json").write_text(
        json.dumps({"screen": [512, 384], "actors": actors}, indent=2) + "\n",
        encoding="utf-8",
    )
    return written
