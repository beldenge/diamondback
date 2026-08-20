"""Extract Dust .MOV stills, audio, and full-screen reel MP4s."""

from __future__ import annotations

import array
import shutil
import struct
import subprocess
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from audio import AudioError, decode_audio_container, write_wav
from container import DFError, DFFile
from image import (
    ImageError,
    IndexedImage,
    Palette,
    decode_indexed_image,
    find_palette,
    still_rgb24,
    write_indexed_png,
)
from pup import EXTRACTOR_BANNER
from script import binary_script_to_text
from set import looks_like_script

# INTRO + INTRO2 + INTRO3 = 2467 stills. Timed back-to-back at ~2:58
# (178 s) → 13.86 fps. Use 14. Not the outdoor walker's ~24 fps, and
# not boot's `framerate (3)` (unknown units).
#
# Audio lives in the same container stream as stills. A clip at index N
# starts when that many stills have already played (clips with no still
# between them overlap). Mux those cues into movie.mp4; sidecar WAVs
# stay under AUDIO/ when --audio is on.
REEL_FPS = 14

# playmovie / doamovie stems, plus INTRO3 / FINALEND (unreferenced
# extras that are still full-screen reels). INFO/* is also a reel
# (folder rule in is_reel_movie). INVEN and spotmovie dests are not.
REEL_STEMS = frozenset(
    {
        "armclose",
        "armopen",
        "boxfinal",
        "chestapp",
        "cureopen",
        "d1nd2m",
        "d2ad2n",
        "d2md2a",
        "d2nd3m",
        "d3ad3n",
        "d3md3a",
        "d3nd4m",
        "d4ad4n",
        "d4nd5m",
        "deserend",
        "diec1",
        "dieh1",
        "dieh2",
        "dieh3",
        "dies1",
        "dies2",
        "dies3",
        "finalend",
        "help",
        "hexopen",
        "histopen",
        "hotbed",
        "hotdn",
        "hotup",
        "intro",
        "intro2",
        "intro3",
        "kiddie",
        "marieend",
        "maybed",
        "maydn",
        "maygate",
        "mayorend",
        "mayup",
        "nitegate",
        "openfoun",
        "paper1",
        "paper2",
        "paper3",
        "paper4",
        "safebox",
        "saldn",
        "salup",
        "skeleton",
        "steps",
        "trottend",
        "vault",
        "yunniend",
        "yunnopen",
    }
)


@dataclass(frozen=True)
class AudioCue:
    """One MOV clip and the still-count at which it starts."""

    start_stills: int
    pcm: bytes
    hertz: int
    width: int


def is_audio_container(data: bytes) -> bool:
    if len(data) < 48:
        return False
    if struct.unpack_from("<i", data, 0)[0] != 0x00010000:
        return False
    hertz = struct.unpack_from("<i", data, 28)[0]
    return 8000 <= hertz <= 48000


def is_reel_movie(path: Path) -> bool:
    """True for full-screen cutscenes / intros / day-change / death reels.

    Not SET walks, not PUP/CST, not INVEN inspectables, not spotmovie
    overlays. INFO/ on the CD is attract-mode preview reels.
    """
    parts = [part.upper() for part in path.parts]
    if "ZUNUSED" in parts:
        return False
    if path.parent.name.upper() == "INVEN":
        return False
    if path.parent.name.upper() == "INFO":
        return True
    return path.stem.lower() in REEL_STEMS


def find_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def write_mov_extract(
    df: DFFile,
    out_dir: Path,
    *,
    write_scripts: bool = True,
    write_frames: bool = False,
    write_audio: bool = False,
    write_video: bool = False,
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
    want_stills = write_frames or (write_video and is_reel_movie(df.path))
    stills: list[tuple[int, IndexedImage]] | None = None
    cues: list[AudioCue] = []
    palette: Palette | None = None
    if want_stills:
        palette = find_palette(df.containers[0].data)
        if palette is not None:
            stills, cues = _collect_reel(df, decode_audio=write_video)
    if write_frames and stills is not None and palette is not None:
        counts["frames"] = _write_frames(stills, palette, out_dir)
    if write_video and is_reel_movie(df.path) and stills and palette is not None:
        counts["video"] = _write_video(stills, palette, cues, out_dir)
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


def _iter_stills(df: DFFile) -> Iterator[tuple[int, IndexedImage]]:
    stills, _cues = _collect_reel(df, decode_audio=False)
    yield from stills


def _collect_reel(
    df: DFFile, *, decode_audio: bool
) -> tuple[list[tuple[int, IndexedImage]], list[AudioCue]]:
    stills: list[tuple[int, IndexedImage]] = []
    cues: list[AudioCue] = []
    prior: bytes | None = None
    for index, container in enumerate(df.containers[1:], start=1):
        if is_audio_container(container.data):
            if decode_audio:
                try:
                    pcm, hertz, width = decode_audio_container(container.data)
                except AudioError:
                    continue
                cues.append(AudioCue(len(stills), pcm, hertz, width))
            continue
        if len(container.data) < 64:
            continue
        try:
            image = decode_indexed_image(container.data, prior)
        except ImageError:
            try:
                image = decode_indexed_image(container.data, None)
            except ImageError:
                prior = None
                continue
        prior = image.pixels
        stills.append((index, image))
    return stills, cues


def pcm_to_floats(pcm: bytes, width: int) -> list[float]:
    if width == 1:
        return [(sample - 128) / 128.0 for sample in pcm]
    if width == 2:
        return [
            struct.unpack_from("<h", pcm, offset)[0] / 32768.0
            for offset in range(0, len(pcm) - 1, 2)
        ]
    raise AudioError(f"unsupported sample width {width}")


def resample_floats(samples: list[float], src_hz: int, dst_hz: int) -> list[float]:
    if src_hz == dst_hz or not samples:
        return samples
    count = max(1, int(round(len(samples) * dst_hz / src_hz)))
    if count == 1:
        return [samples[0]]
    out: list[float] = []
    last = len(samples) - 1
    for index in range(count):
        pos = index * last / (count - 1)
        lo = int(pos)
        frac = pos - lo
        a = samples[lo]
        b = samples[lo + 1] if lo < last else a
        out.append(a + (b - a) * frac)
    return out


def mix_cues(
    cues: list[AudioCue], n_stills: int, fps: int = REEL_FPS
) -> tuple[bytes, int]:
    """Overlap clips onto one 16-bit mono stream. Empty cues → empty PCM."""
    if not cues:
        return b"", 22050
    out_hz = max(cue.hertz for cue in cues)
    video_n = int(round(n_stills / fps * out_hz)) if n_stills else 0
    placed: list[tuple[int, list[float]]] = []
    last = video_n
    for cue in cues:
        samples = resample_floats(pcm_to_floats(cue.pcm, cue.width), cue.hertz, out_hz)
        start = int(round(cue.start_stills / fps * out_hz))
        placed.append((start, samples))
        last = max(last, start + len(samples))
    if last <= 0:
        return b"", out_hz
    mix = array.array("d", [0.0]) * last
    for start, samples in placed:
        for offset, sample in enumerate(samples):
            mix[start + offset] += sample
    peak = 1.0
    for sample in mix:
        mag = sample if sample >= 0 else -sample
        if mag > peak:
            peak = mag
    scale = 1.0 / peak
    pcm = bytearray(last * 2)
    for index, sample in enumerate(mix):
        value = int(round(max(-1.0, min(1.0, sample * scale)) * 32767))
        struct.pack_into("<h", pcm, index * 2, value)
    return bytes(pcm), out_hz


def _write_frames(
    stills: list[tuple[int, IndexedImage]], palette: Palette, out_dir: Path
) -> int:
    frame_dir = out_dir / "FRAMES"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for index, image in stills:
        write_indexed_png(frame_dir / f"frame_{index}.png", image, palette)
    return len(stills)


def _write_video(
    stills: list[tuple[int, IndexedImage]],
    palette: Palette,
    cues: list[AudioCue],
    out_dir: Path,
) -> int:
    ffmpeg = find_ffmpeg()
    if ffmpeg is None:
        raise DFError("ffmpeg not found on PATH (required for --video)")
    first = stills[0][1]
    width, height = first.width, first.height
    for _index, image in stills:
        if image.width != width or image.height != height:
            raise DFError(
                f"reel frame size changed {width}x{height} -> {image.width}x{image.height}"
            )
    dest = out_dir / "movie.mp4"
    mixed_pcm, mixed_hz = mix_cues(cues, len(stills))
    wav_path: Path | None = None
    if mixed_pcm:
        handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        wav_path = Path(handle.name)
        handle.close()
        write_wav(wav_path, mixed_pcm, mixed_hz, 2)
    command = [
        ffmpeg,
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{width}x{height}",
        "-r",
        str(REEL_FPS),
        "-i",
        "pipe:0",
    ]
    if wav_path is not None:
        command.extend(["-i", str(wav_path)])
    command.extend(
        [
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            "-preset",
            "fast",
            "-vf",
            "scale=iw:ih:flags=neighbor",
        ]
    )
    if wav_path is not None:
        command.extend(
            [
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-ac",
                "1",
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
            ]
        )
    else:
        command.append("-an")
    command.extend(["-movflags", "+faststart", str(dest)])
    try:
        try:
            proc = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
        except OSError as exc:
            raise DFError(f"could not start ffmpeg: {exc}") from exc
        assert proc.stdin is not None
        try:
            for _index, image in stills:
                proc.stdin.write(still_rgb24(image, palette))
            proc.stdin.close()
        except BrokenPipeError:
            pass
        stderr = b""
        if proc.stderr is not None:
            stderr = proc.stderr.read()
            proc.stderr.close()
        code = proc.wait()
        if code != 0 or not dest.is_file() or dest.stat().st_size == 0:
            tail = stderr.decode("utf-8", errors="replace")[-800:].strip()
            raise DFError(f"ffmpeg failed (exit {code}): {tail or 'no stderr'}")
        return 1
    finally:
        if wav_path is not None:
            wav_path.unlink(missing_ok=True)


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
