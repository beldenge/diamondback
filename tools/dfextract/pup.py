"""Extract Dust .PUP scripts and dialogue tables.

Layout follows DFET DFpup.cpp. Dust puppets use engine version 1
(single stance); we do not implement the Titanic multi-stance path.
"""

from __future__ import annotations

import csv
import struct
from dataclasses import dataclass
from pathlib import Path

from container import DFError, DFFile
from script import binary_script_to_text, pascal_string

EXTRACTOR_BANNER = (
    "// Extracted with dfextract — Dust-only Python port of DFET script decoding\n\n"
)


@dataclass
class DialogueLine:
    index: int
    audio_container: int
    anim_logic: int
    ident: str
    text: str


@dataclass
class PupScript:
    name: str
    container_index: int
    text: str


@dataclass
class PupExtract:
    source: Path
    version: int
    scripts: list[PupScript]
    dialogue: list[DialogueLine]


def extract_pup(df: DFFile) -> PupExtract:
    if len(df.containers) < 3:
        raise DFError(f"{df.path}: PUP is missing header/script table containers")

    header = df.containers[0].data
    if len(header) < 2160:
        raise DFError(f"{df.path}: PUP container 0 is too small for a dialogue table")

    version = struct.unpack_from("<i", header, 2)[0]
    dialogue = _read_dialogue(header)
    scripts = _read_scripts(df)
    return PupExtract(
        source=df.path, version=version, scripts=scripts, dialogue=dialogue
    )


PUP_FACE_TABLES = (
    "Background",
    "Body",
    "Head",
    "Eyes",
    "Eyebrows",
    "Nose",
    "Jaw",
    "Left",
    "Hands 1",
    "Right",
    "Hands 2",
)


def write_pup_extract(
    extract: PupExtract,
    out_dir: Path,
    *,
    write_scripts: bool = True,
    write_audio: bool = False,
    write_frames: bool = False,
    df: DFFile | None = None,
) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {"scripts": 0, "dialogue": 0, "audio": 0, "frames": 0}

    if write_scripts:
        for script in extract.scripts:
            path = out_dir / f"{script.name}.txt"
            path.write_text(
                EXTRACTOR_BANNER + script.text, encoding="utf-8", newline="\n"
            )
            counts["scripts"] += 1

        csv_path = out_dir / "AUDIO" / "texts.csv"
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        with csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(["ID", "container", "Identifier", "Text"])
            for line in extract.dialogue:
                writer.writerow(
                    [line.index, line.audio_container, line.ident, line.text]
                )
        counts["dialogue"] = len(extract.dialogue)

    if write_audio:
        if df is None:
            raise DFError("PUP audio extract requires the open DFFile")
        from audio import AudioError, decode_audio_container, safe_wav_name, write_wav

        audio_dir = out_dir / "AUDIO"
        audio_dir.mkdir(parents=True, exist_ok=True)
        seen: set[int] = set()
        for line in extract.dialogue:
            if line.audio_container in seen:
                continue
            if line.audio_container < 0 or line.audio_container >= len(df.containers):
                continue
            seen.add(line.audio_container)
            try:
                pcm, hertz, width = decode_audio_container(
                    df.containers[line.audio_container].data
                )
            except AudioError:
                continue
            write_wav(
                audio_dir / f"{safe_wav_name(line.ident)}.wav", pcm, hertz, width
            )
            counts["audio"] += 1

    if write_frames:
        if df is None:
            raise DFError("PUP frame extract requires the open DFFile")
        counts["frames"] = write_pup_frames(df, out_dir)

    return {key: value for key, value in counts.items() if value}


def write_pup_frames(df: DFFile, out_dir: Path) -> int:
    from image import ImageError, decode_trans_sprite, pup_palette, write_png

    if len(df.containers) < 4:
        raise DFError(f"{df.path}: PUP is missing the frame table (container 3)")
    header = df.containers[0].data
    version = struct.unpack_from("<i", header, 2)[0]
    if version != 1:
        raise DFError(f"{df.path}: PUP version {version} is not Dust")

    table = df.containers[3].data
    if len(table) < 22 + 11 * 262:
        raise DFError(f"{df.path}: PUP container 3 is too small for Dust face tables")

    palette = pup_palette(header)
    written = 0
    cursor = 22
    for name in PUP_FACE_TABLES:
        count, _unk, _total = struct.unpack_from("<hhh", table, cursor)
        locations = struct.unpack_from("<" + "i" * 64, table, cursor + 6)
        cursor += 6 + 256
        if count <= 0:
            continue
        folder = out_dir / "FRAMES" / name
        for index in range(count):
            container_id = locations[index]
            if container_id < 0 or container_id >= len(df.containers):
                continue
            try:
                sprite = decode_trans_sprite(
                    df.containers[container_id].data, palette
                )
            except ImageError:
                continue
            write_png(folder / f"frame_{container_id}.png", sprite)
            written += 1
    return written


def _read_dialogue(header: bytes) -> list[DialogueLine]:
    count = struct.unpack_from("<h", header, 2158)[0]
    if count < 0 or count > 10_000:
        raise DFError(f"implausible dialogue count {count}")

    # Each record is 312 bytes starting at 2160:
    # 24 bytes of ints, 256-byte Pascal text, 32-byte Pascal ident.
    record_size = 312
    start = 2160
    needed = start + count * record_size
    if needed > len(header):
        raise DFError(
            f"dialogue table overruns container 0 ({count} x {record_size} from {start})"
        )

    lines: list[DialogueLine] = []
    for index in range(count):
        rec = start + index * record_size
        _u1, _s1, _s2, audio, anim, _u2, _u3 = struct.unpack_from(
            "<ihhiiii", header, rec
        )
        text = pascal_string(header, rec + 24)
        ident = pascal_string(header, rec + 24 + 256)
        lines.append(
            DialogueLine(
                index=index + 1,
                audio_container=audio,
                anim_logic=anim,
                ident=ident,
                text=text,
            )
        )
    return lines


def _read_scripts(df: DFFile) -> list[PupScript]:
    table = df.containers[2].data
    if len(table) < 24:
        raise DFError(f"{df.path}: PUP container 2 is too small for a script table")

    count = struct.unpack_from("<h", table, 22)[0]
    if count < 0 or count > 1000:
        raise DFError(f"{df.path}: implausible script count {count}")

    scripts: list[PupScript] = []
    cursor = 24
    for _ in range(count):
        if cursor + 40 > len(table):
            raise DFError(f"{df.path}: script table overruns container 2")
        location, _unk = struct.unpack_from("<ii", table, cursor)
        name = pascal_string(table, cursor + 8)
        cursor += 40
        if location < 0 or location >= len(df.containers):
            raise DFError(f"{df.path}: script {name!r} points at container {location}")
        text = binary_script_to_text(df.containers[location].data)
        if len(text) <= 1:
            continue
        scripts.append(
            PupScript(name=name, container_index=location, text=text)
        )
    return scripts
