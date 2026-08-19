"""Extract Dust .SND audio (engine version 1).

Layout follows DFET DFsnd.h version1 path. Titanic version 4 is ignored.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

from audio import AudioError, decode_audio_container, safe_wav_name, write_wav
from container import DFError, DFFile
from script import pascal_string


@dataclass
class SndClip:
    name: str
    container_index: int
    combined: bool


def extract_snd(df: DFFile) -> tuple[list[tuple[SndClip, bytes, int, int]], list[SndClip]]:
    """Return (decoded clips, failed clips)."""
    if not df.containers:
        raise DFError(f"{df.path}: SND has no containers")
    header = df.containers[0].data
    if len(header) < 186:
        raise DFError(f"{df.path}: SND container 0 is too small")

    version = struct.unpack_from("<i", header, 2)[0]
    if version != 1:
        raise DFError(f"{df.path}: SND version {version} is not Dust (expected 1)")

    count = struct.unpack_from("<i", header, 174)[0]
    chunks_start, chunks_unique, chunks_count = struct.unpack_from("<hhh", header, 24)
    if count < 0 or count > 10_000:
        raise DFError(f"{df.path}: implausible SND clip count {count}")

    decoded: list[tuple[SndClip, bytes, int, int]] = []
    failed: list[SndClip] = []

    cursor = 186
    for index in range(count):
        if chunks_unique and index == chunks_start:
            break
        if cursor >= len(header):
            raise DFError(f"{df.path}: SND name table overruns container 0")
        name = pascal_string(header, cursor)
        cursor += 24
        clip = SndClip(name=name, container_index=index + 1, combined=False)
        _decode_one(df, clip, decoded, failed)

    if chunks_unique:
        combined_name = pascal_string(header, 158)
        clip = SndClip(name=combined_name, container_index=chunks_start, combined=True)
        try:
            pcm, hertz, width = _decode_combined(
                df, chunks_start, chunks_count, header
            )
            decoded.append((clip, pcm, hertz, width))
        except (AudioError, DFError, struct.error) as exc:
            clip.name = f"{combined_name} ({exc})"
            failed.append(clip)

    return decoded, failed


def write_snd_wavs(
    decoded: list[tuple[SndClip, bytes, int, int]], out_dir: Path
) -> list[Path]:
    written: list[Path] = []
    for clip, pcm, hertz, width in decoded:
        path = out_dir / f"{safe_wav_name(clip.name)}.wav"
        write_wav(path, pcm, hertz, width)
        written.append(path)
    return written


def _decode_one(
    df: DFFile,
    clip: SndClip,
    decoded: list[tuple[SndClip, bytes, int, int]],
    failed: list[SndClip],
) -> None:
    if clip.container_index < 0 or clip.container_index >= len(df.containers):
        failed.append(clip)
        return
    try:
        pcm, hertz, width = decode_audio_container(
            df.containers[clip.container_index].data
        )
    except AudioError:
        failed.append(clip)
        return
    decoded.append((clip, pcm, hertz, width))


def _decode_combined(
    df: DFFile, chunks_start: int, chunks_count: int, header: bytes
) -> tuple[bytes, int, int]:
    if 30 + chunks_count * 2 > len(header):
        raise DFError("SND loop playlist overruns container 0")
    playlist = list(struct.unpack_from("<" + "h" * chunks_count, header, 30))

    pieces: list[bytes] = []
    hertz: int | None = None
    width: int | None = None
    for entry in playlist:
        index = chunks_start + entry
        if index < 0 or index >= len(df.containers):
            raise DFError(f"SND loop container {index} out of range")
        pcm, rate, sample_width = decode_audio_container(df.containers[index].data)
        if hertz is None:
            hertz = rate
            width = sample_width
        pieces.append(pcm)

    if not pieces or hertz is None or width is None:
        raise DFError("SND combined track has no chunks")

    # DFET reads hertz from chunksStart+1 when present.
    probe = chunks_start + 1
    if 0 <= probe < len(df.containers) and len(df.containers[probe].data) >= 32:
        alt = struct.unpack_from("<i", df.containers[probe].data, 28)[0]
        if alt > hertz:
            hertz = alt
    return b"".join(pieces), hertz, width
