"""Play an extracted MOV folder the way MOVPLAY.EXE would.

Reads ``timeline.json``, ``FRAMES/frame_<n>.png``, and ``AUDIO/clip_<n>.wav``
from a dfextract dest (e.g. ``out/MOV/_INTRO``). No ffmpeg, no original
``.MOV`` file.

    python movplay.py out/MOV/_DOG1
    python movplay.py out/MOV/_INTRO --scale 2
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from audio import write_wav
from mov import AudioCue, mix_cues


@dataclass(frozen=True)
class DumpFrame:
    container: int
    hold_ticks: int
    start_tick: int
    path: Path


@dataclass(frozen=True)
class MovieDump:
    tick_hz: int
    duration_ticks: int
    frames: tuple[DumpFrame, ...]
    cues: tuple[AudioCue, ...]
    missing_clips: tuple[int, ...]


def load_movie_dump(folder: Path) -> MovieDump:
    folder = folder.resolve()
    timeline_path = folder / "timeline.json"
    frame_dir = folder / "FRAMES"
    if not timeline_path.is_file():
        raise FileNotFoundError(
            f"{folder}: no timeline.json (re-extract with --frames)"
        )
    if not frame_dir.is_dir():
        raise FileNotFoundError(f"{folder}: no FRAMES/")
    payload = json.loads(timeline_path.read_text(encoding="utf-8"))
    tick_hz = int(payload.get("tick_hz") or 60)
    duration = int(payload.get("duration_ticks") or 0)
    frames: list[DumpFrame] = []
    for rec in payload.get("frames") or []:
        container = int(rec["container"])
        path = frame_dir / f"frame_{container}.png"
        if not path.is_file():
            raise FileNotFoundError(path)
        frames.append(
            DumpFrame(
                container=container,
                hold_ticks=int(rec["hold_ticks"]),
                start_tick=int(rec["start_tick"]),
                path=path,
            )
        )
    if not frames:
        raise ValueError(f"{folder}: timeline has no frames")
    if duration <= 0:
        last = frames[-1]
        duration = last.start_tick + last.hold_ticks
    audio_dir = folder / "AUDIO"
    cues: list[AudioCue] = []
    missing: list[int] = []
    for rec in payload.get("clips") or []:
        container = int(rec["container"])
        wav_path = audio_dir / f"clip_{container}.wav"
        if not wav_path.is_file():
            missing.append(container)
            continue
        pcm, hertz, width = _read_wav(wav_path)
        cues.append(
            AudioCue(
                start_tick=int(rec["start_tick"]),
                pcm=pcm,
                hertz=hertz,
                width=width,
                channel=str(rec.get("channel") or ""),
            )
        )
    return MovieDump(
        tick_hz=tick_hz,
        duration_ticks=duration,
        frames=tuple(frames),
        cues=tuple(cues),
        missing_clips=tuple(missing),
    )


def _read_wav(path: Path) -> tuple[bytes, int, int]:
    with wave.open(str(path), "rb") as handle:
        if handle.getnchannels() != 1:
            raise ValueError(f"{path.name}: only mono WAV is supported")
        width = handle.getsampwidth()
        hertz = handle.getframerate()
        pcm = handle.readframes(handle.getnframes())
    return pcm, hertz, width


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="movplay.py",
        description="MOVPLAY for extracted Dust movies (FRAMES + AUDIO + timeline.json).",
    )
    parser.add_argument(
        "folder",
        type=Path,
        help="dfextract dest, e.g. out/MOV/_INTRO or out/MOV/_DOG1",
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=2,
        metavar="N",
        help="Integer window scale (default 2). 1 = native 512×264.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.scale < 1:
        print("--scale must be >= 1", file=sys.stderr)
        return 2
    try:
        dump = load_movie_dump(args.folder)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(exc, file=sys.stderr)
        return 2
    if dump.missing_clips:
        print(
            f"warning: no WAV for clip(s) {', '.join(str(n) for n in dump.missing_clips)}",
            file=sys.stderr,
        )
    try:
        import pygame
    except ImportError:
        print(
            "movplay.py needs pygame-ce (pip install -r requirements.txt)",
            file=sys.stderr,
        )
        return 2
    return _run(pygame, dump, args.folder.name, args.scale)


def _run(pygame, dump: MovieDump, title: str, scale: int) -> int:
    mixed_pcm, mixed_hz = mix_cues(
        list(dump.cues), dump.duration_ticks, dump.tick_hz
    )
    pygame.mixer.pre_init(frequency=mixed_hz or 22050, size=-16, channels=1)
    pygame.init()
    pygame.display.set_caption(f"{title}  (Esc quit, Space pause)")
    raw: list[tuple[int, object]] = []
    max_w = 1
    max_h = 1
    for frame in dump.frames:
        surf = pygame.image.load(str(frame.path))
        max_w = max(max_w, surf.get_width())
        max_h = max(max_h, surf.get_height())
        raw.append((frame.start_tick, surf))
    window = pygame.display.set_mode((max_w * scale, max_h * scale))
    surfaces: list[tuple[int, object]] = []
    for start_tick, surf in raw:
        surf = surf.convert()
        if scale != 1:
            surf = pygame.transform.scale(
                surf, (surf.get_width() * scale, surf.get_height() * scale)
            )
        surfaces.append((start_tick, surf))
    clock = pygame.time.Clock()
    wav_path: Path | None = None
    try:
        if mixed_pcm:
            handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            wav_path = Path(handle.name)
            handle.close()
            write_wav(wav_path, mixed_pcm, mixed_hz, 2)
            pygame.mixer.music.load(str(wav_path))
            pygame.mixer.music.play()
        t0 = pygame.time.get_ticks()
        paused = False
        pause_elapsed = 0
        running = True
        frame_i = 0
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key in (pygame.K_ESCAPE, pygame.K_q):
                        running = False
                    elif event.key == pygame.K_SPACE:
                        if paused:
                            t0 = pygame.time.get_ticks() - pause_elapsed
                            if mixed_pcm:
                                pygame.mixer.music.unpause()
                            paused = False
                        else:
                            pause_elapsed = pygame.time.get_ticks() - t0
                            if mixed_pcm:
                                pygame.mixer.music.pause()
                            paused = True
            if paused:
                clock.tick(30)
                continue
            elapsed_ms = pygame.time.get_ticks() - t0
            tick = elapsed_ms * dump.tick_hz // 1000
            if tick >= dump.duration_ticks:
                break
            while (
                frame_i + 1 < len(surfaces)
                and surfaces[frame_i + 1][0] <= tick
            ):
                frame_i += 1
            surf = surfaces[frame_i][1]
            window.fill((0, 0, 0))
            x = (max_w * scale - surf.get_width()) // 2
            y = (max_h * scale - surf.get_height()) // 2
            window.blit(surf, (x, y))
            pygame.display.flip()
            clock.tick(60)
    finally:
        pygame.mixer.music.stop()
        pygame.quit()
        if wav_path is not None:
            wav_path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
