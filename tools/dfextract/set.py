"""Extract Dust .SET maps: scripts, scene grid, waypoints, frames.

Layout from mrxstudios (2022) plus header pointers found in APOTH.SET.
"""

from __future__ import annotations

import json
import struct
from dataclasses import asdict, dataclass
from pathlib import Path

from container import DFError, DFFile
from image import ImageError, decode_indexed_image, find_palette, write_indexed_png
from pup import EXTRACTOR_BANNER
from script import binary_script_to_text, pascal_string

DIRS = {1: "N", 2: "S", 3: "E", 4: "W"}


@dataclass
class SetScene:
    x: int
    y: int
    interact: int
    unknown_c: int
    blocked: int
    unknown_e: int
    name: str
    script_container: int


@dataclass
class SetWaypoint:
    x: int
    y: int
    name: str


@dataclass
class SetTransition:
    x_from: int
    y_from: int
    dir_from: int
    x_to: int
    y_to: int
    dir_to: int
    frame0: int


def looks_like_script(data: bytes) -> bool:
    return len(data) >= 8 and struct.unpack_from("<H", data, 0)[0] == 4001


def extract_set_metadata(df: DFFile) -> tuple[list[SetScene], list[SetWaypoint], list[SetTransition]]:
    if not df.containers:
        raise DFError(f"{df.path}: SET has no containers")
    header = df.containers[0].data
    if len(header) < 40:
        raise DFError(f"{df.path}: SET header too small")

    scenes = _read_grid(header)
    framelist_id = struct.unpack_from("<h", header, 30)[0]
    waypoint_id = struct.unpack_from("<h", header, 34)[0]
    waypoints = _read_waypoints(df, waypoint_id)
    transitions = _read_framelist(df, framelist_id)
    return scenes, waypoints, transitions


def write_set_extract(
    df: DFFile,
    out_dir: Path,
    *,
    write_scripts: bool = True,
    write_frames: bool = False,
) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    scenes, waypoints, transitions = extract_set_metadata(df)
    counts = {"scenes": len(scenes), "waypoints": len(waypoints), "transitions": len(transitions)}

    (out_dir / "scenes.json").write_text(
        json.dumps([asdict(s) for s in scenes], indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "waypoints.json").write_text(
        json.dumps([asdict(w) for w in waypoints], indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "transitions.json").write_text(
        json.dumps(
            [
                {
                    **asdict(tr),
                    "dir_from_name": DIRS.get(tr.dir_from, "?"),
                    "dir_to_name": DIRS.get(tr.dir_to, "?"),
                }
                for tr in transitions
            ],
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    if write_scripts:
        counts["scripts"] = _write_set_scripts(df, scenes, out_dir)
    if write_frames:
        counts["frames"] = _write_set_frames(df, transitions, out_dir)
    return {key: value for key, value in counts.items() if value}


def _read_grid(header: bytes) -> list[SetScene]:
    scenes: list[SetScene] = []
    # Grid is at the end: scene_count then count * 32-byte records.
    for count in range(1, 513):
        start = len(header) - count * 32
        if start < 4:
            break
        if struct.unpack_from("<i", header, start - 4)[0] != count:
            continue
        first_len = header[start + 12]
        if not (1 <= first_len <= 15):
            continue
        for index in range(count):
            rec = header[start + index * 32 : start + (index + 1) * 32]
            x, y, inter, unk_c, blocked, unk_e = struct.unpack_from("<hhhhhh", rec, 0)
            scenes.append(
                SetScene(
                    x=x,
                    y=y,
                    interact=inter,
                    unknown_c=unk_c,
                    blocked=blocked,
                    unknown_e=unk_e,
                    name=pascal_string(rec, 12),
                    script_container=struct.unpack_from("<i", rec, 28)[0],
                )
            )
        return scenes
    raise DFError("could not locate SET scene grid")


def _read_waypoints(df: DFFile, container_id: int) -> list[SetWaypoint]:
    if container_id < 0 or container_id >= len(df.containers):
        return []
    data = df.containers[container_id].data
    if len(data) < 28:
        return []
    count = struct.unpack_from("<i", data, 24)[0]
    if count < 0 or count > 10_000:
        return []
    points: list[SetWaypoint] = []
    for index in range(count):
        base = 28 + index * 50
        if base + 26 > len(data):
            break
        x, y = struct.unpack_from("<HH", data, base + 2)
        points.append(SetWaypoint(x=x, y=y, name=pascal_string(data, base + 8)))
    return points


def _read_framelist(df: DFFile, container_id: int) -> list[SetTransition]:
    if container_id < 0 or container_id >= len(df.containers):
        return []
    data = df.containers[container_id].data
    if len(data) < 28 or len(data) % 28:
        return []
    rows: list[SetTransition] = []
    for offset in range(0, len(data), 28):
        vals = struct.unpack_from("<hhhhhhhhhhhhi", data, offset)
        rows.append(
            SetTransition(
                x_from=vals[0],
                y_from=vals[1],
                dir_from=vals[2],
                x_to=vals[3],
                y_to=vals[4],
                dir_to=vals[5],
                frame0=vals[12],
            )
        )
    return rows


def _write_set_scripts(df: DFFile, scenes: list[SetScene], out_dir: Path) -> int:
    written = 0
    if len(df.containers) > 1 and looks_like_script(df.containers[1].data):
        text = binary_script_to_text(df.containers[1].data)
        (out_dir / "Boot Script.txt").write_text(
            EXTRACTOR_BANNER + text, encoding="utf-8", newline="\n"
        )
        written += 1
    for scene in scenes:
        idx = scene.script_container
        if idx < 0 or idx >= len(df.containers):
            continue
        data = df.containers[idx].data
        if not looks_like_script(data):
            continue
        text = binary_script_to_text(data)
        if len(text) <= 1:
            continue
        safe = scene.name.replace("/", "_") or f"scene_{scene.x}_{scene.y}"
        (out_dir / f"{safe}.txt").write_text(
            EXTRACTOR_BANNER + text, encoding="utf-8", newline="\n"
        )
        written += 1
    return written


def _write_set_frames(df: DFFile, transitions: list[SetTransition], out_dir: Path) -> int:
    palette = find_palette(df.containers[0].data)
    if palette is None:
        return 0
    frame_dir = out_dir / "FRAMES"
    written = 0
    seen: set[int] = set()
    prior: bytes | None = None
    prior_size: tuple[int, int] | None = None
    for tr in transitions:
        for offset in range(6):
            frame_id = tr.frame0 + offset
            if frame_id in seen or frame_id < 0 or frame_id >= len(df.containers):
                continue
            seen.add(frame_id)
            data = df.containers[frame_id].data
            if len(data) < 16:
                continue
            dest = frame_dir / f"frame_{frame_id}.png"
            try:
                image = decode_indexed_image(data, prior)
            except ImageError:
                prior = None
                prior_size = None
                continue
            if prior_size != (image.width, image.height):
                # Size change: retry from a clean buffer once.
                if prior is not None:
                    try:
                        image = decode_indexed_image(data, None)
                    except ImageError:
                        prior = None
                        prior_size = None
                        continue
            write_indexed_png(dest, image, palette)
            prior = image.pixels
            prior_size = (image.width, image.height)
            written += 1
    return written
