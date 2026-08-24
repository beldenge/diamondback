"""Extract Dust .PRP props: scripts and named sprites.

Group table matches Titanic SHP (DFET DFshp.h) at container 0 + 2360,
even though Dust is engine version 1.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

from container import DFError, DFFile, HEADER_SIZE, MAGIC
from image import (
    ImageError,
    Palette,
    colorize_sprite,
    decode_indexed_image,
    decode_trans_indices,
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


# HOUSE `propview` / group → SET whose ColorPalette the overlay indexes.
# Dust 8-bit-blits these onto the current SET; HOUSE unused slots are black.
DOOR_VIEW_SET = {
    "study": "MAYHALL",
    "dine": "MAYHALL",
    "hall": "MAYSTUDY",
    "hall2": "MAYDINE",
    "room": "MAYUPPER",
    "exit": "MAYROOM",
    "front": "MAYHALL",
    "horse": "LIVERY",
    "rice": "CHIN",
    "lock": "JAIL",
    "shop": "STORE",
    "pharm": "APOTH",
    "car": "STAGE",
    "dollar": "BANK",
    "doc1": "DOCTOR1",
    "doc2": "DOCTOR1",
    "doc3": "DOCTOR2",
    "doc4": "DOCTOR2",
    "buick": "HOTUPPER",
    "laurel": "HOTUPPER",
    "playroom": "HOTUPPER",
    "blood": "HOTUPPER",
    "inside": "HOTROOM",
    "hotout": "HOTLOWER",
    "salout": "SALLOWER",
    "oona": "SALUPPER",
    "sophie": "SALUPPER",
    "ruby": "SALUPPER",
    "salroom": "SALROOM",
    "underout": "UNDERTAK",
    "flipout": "PAPER",
    "padre": "SCHOOL",
    "courtout": "COURT",
    "schoolin": "COURT",
    "schoolout": "SCHOOL",
    "padreout": "PADRE",
    "courtoutnite": "NITECOUR",
    "schoolinnite": "NITECOUR",
    "schooloutnite": "NITESCHO",
    "court": "TOWN",
    "courtinnite": "NITE",
    "nitemayo": "NITE",
}

# World props that are not a door `propview` (card tables, …).
HOUSE_GROUP_SET = {
    "gamblers": "SALLOWER",
    "blackjack": "SALLOWER",
    "table1": "SALLOWER",
}

# HOUSE unused-black above this → 8-bit SET blit, not a HUD sprite.
HOUSE_BLACK_RATIO = 0.5


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


def _palette_from_header(path: Path) -> Palette | None:
    """Read only container 0 so we do not load whole SET files for a palette."""
    with path.open("rb") as fh:
        head = fh.read(HEADER_SIZE)
        if len(head) < 40 or head[32:40] != MAGIC:
            return None
        count = struct.unpack_from("<I", head, 20)[0]
        if count < 1:
            return None
        fh.seek(HEADER_SIZE)
        off0 = struct.unpack("<I", fh.read(4))[0]
        fh.seek(off0)
        _cid, size = struct.unpack("<iI", fh.read(8))
        data = fh.read(size)
    return find_palette(data)


def _sibling_set_palettes(prp_path: Path) -> dict[str, Palette]:
    """Load every sibling SET ColorPalette (container 0 only)."""
    parent = prp_path.parent
    cache: dict[str, Palette] = {}
    if not parent.is_dir():
        return cache
    for path in sorted(parent.glob("*.SET")):
        try:
            pal = _palette_from_header(path)
        except (OSError, struct.error, ImageError):
            continue
        if pal is not None:
            cache[path.stem.upper()] = pal
    return cache


def _black_ratio(indices: bytes, palette: Palette) -> float:
    n = 0
    black = 0
    colors = palette.colors
    ncolors = len(colors)
    for index in indices:
        if index == 255:
            continue
        n += 1
        if index < ncolors and colors[index] == (0, 0, 0):
            black += 1
    return black / n if n else 0.0


def _chroma_count(sprite) -> int:
    rgba = sprite.rgba
    n = 0
    for i in range(0, len(rgba), 4):
        if rgba[i + 3] and (rgba[i], rgba[i + 1], rgba[i + 2]) != (0, 0, 0):
            n += 1
    return n


def _colorize_trans(
    data: bytes,
    house_pal: Palette,
    preferred: Palette | None,
    set_pals: list[Palette],
):
    """HUD sprites keep HOUSE. World overlays are SET-indexed; unused HOUSE slots are black."""
    width, height, pos_x, pos_y, indices = decode_trans_indices(data)
    house_spr = colorize_sprite(width, height, pos_x, pos_y, indices, house_pal)
    if _black_ratio(indices, house_pal) < HOUSE_BLACK_RATIO:
        return house_spr
    opaque = sum(1 for index in indices if index != 255) or 1
    best = house_spr
    best_chroma = _chroma_count(house_spr)
    seen: set[int] = {id(house_pal)}
    ordered: list[Palette] = []
    if preferred is not None:
        ordered.append(preferred)
    ordered.extend(set_pals)
    for pal in ordered:
        marker = id(pal)
        if marker in seen:
            continue
        seen.add(marker)
        sprite = colorize_sprite(width, height, pos_x, pos_y, indices, pal)
        chroma = _chroma_count(sprite)
        if chroma > best_chroma:
            best = sprite
            best_chroma = chroma
            if pal is preferred and chroma >= 0.25 * opaque:
                return best
    return best


def _write_one_frame(
    df: DFFile,
    container_id: int,
    dest: Path,
    palette,
    preferred: Palette | None = None,
    set_pals: list[Palette] | None = None,
) -> dict | None:
    if container_id < 0 or container_id >= len(df.containers):
        return None
    data = df.containers[container_id].data
    if len(data) < 16:
        return None
    height, width = struct.unpack_from("<hh", data, 0)
    # Interior door overlays (salout, rice, …) are trans sprites larger
    # than 256×256 / 20 KB. Decode trans first; indexed stills fail that
    # codec and fall through.
    try:
        sprite = _colorize_trans(data, palette, preferred, set_pals or [])
        write_png(dest, sprite)
        return sprite_record(sprite, dest.name)
    except ImageError:
        pass
    try:
        if len(data) >= 64:
            write_indexed_png(dest, decode_indexed_image(data), palette)
            return {"w": width, "h": height}
    except ImageError:
        return None
    return None


def _write_frames(df: DFFile, out_dir: Path) -> int:
    # DF.EXE 0x423e59: unused 8.8 0xFFFF `sar 8` → white. INVEN HUD
    # items sample pal 0 (HELP letter counters, gun leather flecks).
    # HOUSE/world PRP keep DFET unused→black so index-0 holes stay
    # dark on 8-bit stills (butbevel's hole is codec skip, not pal 0).
    unused = (255, 255, 255) if df.path.stem.upper() == "INVEN" else (0, 0, 0)
    palette = find_palette(df.containers[0].data, unused_rgb=unused)
    if palette is None:
        return 0
    set_by_stem = (
        _sibling_set_palettes(df.path) if df.path.stem.upper() == "HOUSE" else {}
    )
    set_pals = list(set_by_stem.values())
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
        stem = DOOR_VIEW_SET.get(item.state.lower()) or HOUSE_GROUP_SET.get(
            item.group.lower()
        )
        preferred = set_by_stem.get(stem) if stem else None
        meta = _write_one_frame(
            df, item.container, dest, palette, preferred, set_pals
        )
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
