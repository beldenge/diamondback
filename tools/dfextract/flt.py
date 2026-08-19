"""Extract Dust .FLT puzzle flats: scripts and stills."""

from __future__ import annotations

from pathlib import Path

from container import DFError, DFFile
from image import ImageError, decode_indexed_image, find_palette, write_indexed_png
from pup import EXTRACTOR_BANNER
from script import binary_script_to_text
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
    if write_frames:
        counts["frames"] = _write_frames(df, out_dir)
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
        (out_dir / f"{safe}.txt").write_text(
            EXTRACTOR_BANNER + text, encoding="utf-8", newline="\n"
        )
        written += 1
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
