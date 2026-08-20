"""Extract Dust .MOV stills and animation frames (engine version 1)."""

from __future__ import annotations

import struct
from pathlib import Path

from audio import AudioError, decode_audio_container, write_wav
from container import DFError, DFFile
from image import ImageError, decode_indexed_image, find_palette, write_indexed_png
from pup import EXTRACTOR_BANNER
from script import binary_script_to_text
from set import looks_like_script


def is_audio_container(data: bytes) -> bool:
    if len(data) < 48:
        return False
    if struct.unpack_from("<i", data, 0)[0] != 0x00010000:
        return False
    hertz = struct.unpack_from("<i", data, 28)[0]
    return 8000 <= hertz <= 48000


def write_mov_extract(
    df: DFFile,
    out_dir: Path,
    *,
    write_scripts: bool = True,
    write_frames: bool = False,
    write_audio: bool = False,
) -> dict[str, int]:
    if not df.containers:
        raise DFError(f"{df.path}: MOV has no containers")
    header = df.containers[0].data
    version = struct.unpack_from("<i", header, 2)[0] if len(header) >= 6 else 0
    if version != 1:
        raise DFError(f"{df.path}: MOV version {version} is not Dust")
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    if write_scripts:
        counts["scripts"] = _write_scripts(df, out_dir)
    if write_frames:
        counts["frames"] = _write_frames(df, out_dir)
    if write_audio:
        counts["audio"] = _write_audio(df, out_dir)
    return {key: value for key, value in counts.items() if value}


def _write_scripts(df: DFFile, out_dir: Path) -> int:
    written = 0
    for index, container in enumerate(df.containers[1:], start=1):
        if not looks_like_script(container.data):
            continue
        text = binary_script_to_text(container.data)
        if len(text) <= 1:
            continue
        (out_dir / f"script_{index}.txt").write_text(
            EXTRACTOR_BANNER + text, encoding="utf-8", newline="\n"
        )
        written += 1
    return written


def _write_frames(df: DFFile, out_dir: Path) -> int:
    palette = find_palette(df.containers[0].data)
    if palette is None:
        return 0
    written = 0
    frame_dir = out_dir / "FRAMES"
    frame_dir.mkdir(parents=True, exist_ok=True)
    prior: bytes | None = None
    for index, container in enumerate(df.containers[1:], start=1):
        if is_audio_container(container.data) or len(container.data) < 64:
            continue
        dest = frame_dir / f"frame_{index}.png"
        try:
            image = decode_indexed_image(container.data, prior)
        except ImageError:
            try:
                image = decode_indexed_image(container.data, None)
            except ImageError:
                prior = None
                continue
        write_indexed_png(dest, image, palette)
        prior = image.pixels
        written += 1
    return written


def _write_audio(df: DFFile, out_dir: Path) -> int:
    written = 0
    audio_dir = out_dir / "AUDIO"
    for index, container in enumerate(df.containers[1:], start=1):
        if not is_audio_container(container.data):
            continue
        dest = audio_dir / f"clip_{index}.wav"
        try:
            pcm, hertz, width = decode_audio_container(container.data)
        except AudioError:
            continue
        write_wav(dest, pcm, hertz, width)
        written += 1
    return written
