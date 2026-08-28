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

# Reader chrome 8-bit-blits onto the companion FLT still, not a town SET.
# `_colorize_trans` chroma-max over every DATA SET ties on TOWN and
# inverts the leather (`yunnibord` (88,80,62) vs `yunnopen.mov` (41,0,0)).
HOUSE_GROUP_FLT = {
    "yunnibord": "YUNNI",
    "histbord": "HIST",
    "pagebord": "PAGES",
    "diarybord": "DIARY",
    "curebord": "CURE",
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
        groups = write_prp_groups(df, out_dir)
        if groups:
            counts["groups"] = len(groups)
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


def parse_prp_groups(df: DFFile) -> list[dict]:
    """Group table: name plus ObjectGroup +38 script container (HOUSE blackjack 498)."""
    header = df.containers[0].data
    if len(header) < 2364:
        return []
    group_count = struct.unpack_from("<i", header, 2360)[0]
    if group_count < 0 or group_count > 10_000:
        return []
    groups: list[dict] = []
    cursor = 2364
    for _ in range(group_count):
        if cursor + 4 > len(header):
            break
        logic_id = struct.unpack_from("<i", header, cursor)[0]
        cursor += 16
        if logic_id < 0 or logic_id >= len(df.containers):
            continue
        logic = df.containers[logic_id].data
        if len(logic) < 42:
            continue
        name = _safe_name(pascal_string(logic, 42))
        script = logic_id
        if len(logic) >= 42:
            ptr = struct.unpack_from("<i", logic, 38)[0]
            if 0 <= ptr < len(df.containers):
                script = ptr
        groups.append({"name": name, "logic": logic_id, "script": script})
    return groups


def write_prp_groups(df: DFFile, out_dir: Path) -> list[dict]:
    groups = parse_prp_groups(df)
    if not groups:
        return []
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "groups.json").write_text(
        json.dumps(groups, indent=2) + "\n", encoding="utf-8"
    )
    return groups


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


def _palette_from_header(
    path: Path, unused_rgb: tuple[int, int, int] = (0, 0, 0)
) -> Palette | None:
    """Read only container 0 so we do not load whole SET files for a palette.

    Companion still pals expand unused 0xFFFF as VGA index 0 (black).
    Default ``find_palette`` unused-white is the door/gun/skeleton
    white-spot dump: pal 0 is reserved, not photographed cream.
    """
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
    return find_palette(data, unused_rgb=unused_rgb)


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


def _companion_set_palette(prp_path: Path) -> Palette | None:
    """Same-stem sibling SET (HUB.PRP → HUB.SET).

    World props index-blit with that still pal. Unused VGA 0 is black.
    """
    parent = prp_path.parent
    stem = prp_path.stem
    for name in (f"{stem}.SET", f"{stem.upper()}.SET", f"{stem.lower()}.set"):
        path = parent / name
        if not path.is_file():
            continue
        try:
            pal = _palette_from_header(path, unused_rgb=(0, 0, 0))
        except (OSError, struct.error, ImageError):
            continue
        if pal is not None:
            return pal
    return None


def _companion_flt_palette(prp_path: Path) -> Palette | None:
    """Same-stem sibling FLT (SALGAMES.PRP → SALGAMES.FLT).

    Dust 8-bit-blits those props into the FLT still; the PRP ColorPalette
    is often unused-white and must not be used to expand the indices.
    """
    parent = prp_path.parent
    stem = prp_path.stem
    for name in (f"{stem}.FLT", f"{stem.upper()}.FLT", f"{stem.lower()}.flt"):
        path = parent / name
        if not path.is_file():
            continue
        try:
            pal = _palette_from_header(path)
        except (OSError, struct.error, ImageError):
            continue
        if pal is not None:
            return pal
    return None


def _flt_palettes_near(prp_path: Path) -> dict[str, Palette]:
    """Load *.FLT ColorPalettes next to the PRP and in sibling folders.

    HOUSE.PRP lives in DATA/; YUNNI.FLT / HIST.FLT / PAGES.FLT are in
    INVEN/, CURE.FLT in DRUGS/, DIARY.FLT in DATA/.
    """
    cache: dict[str, Palette] = {}
    folders: list[Path] = []
    parent = prp_path.parent
    if parent.is_dir():
        folders.append(parent)
        grand = parent.parent
        if grand.is_dir():
            folders.extend(sorted(path for path in grand.iterdir() if path.is_dir()))
    seen: set[str] = set()
    for folder in folders:
        try:
            marker = str(folder.resolve())
        except OSError:
            marker = str(folder)
        if marker in seen:
            continue
        seen.add(marker)
        for path in sorted(folder.glob("*.FLT")):
            try:
                pal = _palette_from_header(path)
            except (OSError, struct.error, ImageError):
                continue
            if pal is not None:
                cache.setdefault(path.stem.upper(), pal)
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
    """Opaque pixels that are not unused fill (black or white)."""
    rgba = sprite.rgba
    n = 0
    for i in range(0, len(rgba), 4):
        if not rgba[i + 3]:
            continue
        rgb = (rgba[i], rgba[i + 1], rgba[i + 2])
        if rgb != (0, 0, 0) and rgb != (255, 255, 255):
            n += 1
    return n


def _colorize_trans(
    data: bytes,
    house_pal: Palette,
    preferred: Palette | None,
    set_pals: list[Palette],
):
    """Expand 8-bit sprites with the still they blit onto.

    PRP ColorPalette is often unused (HOUSE black, SALGAMES white). Dust
    indexes the current SET/FLT palette. Prefer the companion still pal
    with the most chromatic opaque pixels.
    """
    width, height, pos_x, pos_y, indices, written = decode_trans_indices(data)
    own = colorize_sprite(
        width, height, pos_x, pos_y, indices, house_pal, written=written
    )
    ordered: list[Palette] = []
    if preferred is not None:
        ordered.append(preferred)
    ordered.extend(set_pals)
    if not ordered:
        return own
    opaque = sum(1 for flag in written if flag) or 1
    best = own
    best_chroma = _chroma_count(own)
    seen: set[int] = {id(house_pal)}
    for pal in ordered:
        marker = id(pal)
        if marker in seen:
            continue
        seen.add(marker)
        sprite = colorize_sprite(
            width, height, pos_x, pos_y, indices, pal, written=written
        )
        chroma = _chroma_count(sprite)
        # Preferred still-pal wins a chroma tie: pal 0 unused-white vs
        # VGA black does not change chroma (both are fill) but white is
        # the door-frame / skeleton-speck dump.
        better = chroma > best_chroma or (
            pal is preferred and chroma >= best_chroma
        )
        if better:
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
    # 8-bit blit onto a SET/FLT still uses that still's palette. VGA
    # index 0 is black (skip holes, Help's legs, crow bodies). Expanding
    # unused 0xFFFF as white (DF.EXE 0x423e59 sar 8) painted pal-0
    # door frames, gun leather, and hub skeletons as salt. Codec skip
    # (unwritten 255) stays transparent. Companion FLT/SET pals fill
    # the real indices (SALGAMES cards, HOUSE doors, HUB skeletons).
    palette = find_palette(df.containers[0].data, unused_rgb=(0, 0, 0))
    if palette is None:
        return 0
    house = df.path.stem.upper() == "HOUSE"
    set_by_stem = _sibling_set_palettes(df.path) if house else {}
    set_pals = list(set_by_stem.values())
    flt_pal = _companion_flt_palette(df.path)
    companion_set = None if house else _companion_set_palette(df.path)
    if flt_pal is not None:
        set_pals = [flt_pal, *set_pals]
    elif companion_set is not None:
        set_pals = [companion_set, *set_pals]
    flt_by_stem = _flt_palettes_near(df.path) if house else {}
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
        flt_stem = HOUSE_GROUP_FLT.get(item.group.lower())
        companion = flt_by_stem.get(flt_stem) if flt_stem else None
        if companion is not None:
            # Lock to the FLT pal. HOUSE unused-black + SET chroma-max
            # inverts reader leather (TOWN.SET wins the tie).
            frame_pal, preferred, extras = companion, None, []
        else:
            stem = DOOR_VIEW_SET.get(item.state.lower()) or HOUSE_GROUP_SET.get(
                item.group.lower()
            )
            frame_pal = palette
            preferred = (
                set_by_stem.get(stem)
                if stem
                else (flt_pal or companion_set)
            )
            extras = set_pals
        meta = _write_one_frame(
            df, item.container, dest, frame_pal, preferred, extras
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
