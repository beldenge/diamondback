"""Extract Dust .MOV stills, audio, and full-screen reel MP4s."""

from __future__ import annotations

import array
import json
import shutil
import struct
import subprocess
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from audio import AudioError, audio_params, decode_audio_container, write_wav
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
from script import decode_and_write_script
from set import looks_like_script

# MOVPLAY.EXE play loop (VA 0x405E50 / 0x40BCF7 / scene load 0x40B933):
#   tick = timeGetTime() * 3 / 50     # 60 Hz when the 3 matches boot framerate(3)
#   record i is at header + 0x8C2 + i*80, copied with rep movsd ecx=20
#   hold_ticks = max(dword header+0x26, dword record+2)
#   group A (u16 header+0x1A): voice slots; start when rec+32 == 1-based index
#     (0x40C1A0 -> 0x40FB60). Same index again restarts that slot.
#   rec+0x1A bit 0: after start_A, busy-wait mixer channel 0 idle
#     (DF.EXE 0x419300 call 0x4026F0; MOVPLAY 0x40BF6C call 0x40FA00).
#     dog1 recs 2 and 4: hold the close still until that growl finishes,
#     then the next rec stamps A1 again — two full growls, two mouth pairs.
#   group B (u16 header+0x1C): theme playlist; u16 count at +0x34, 1-based
#     indices at +0x83E into the B clips. Sequential, one theme channel.
#     A scene with n_b==0 keeps the previous playlist running (0x40BA06).
#   One 512x264 (or 384) framebuffer. Skip spans keep prior pixels. Scene
#   headers are not images — do not clear prior when skipping them.
#   Each scene header installs a 256-entry palette at +0x3E (MOVPLAY copy
#   loop at 0x40BC9A). Index pixels stay; RGB uses the current scene pal.
# Duplicate each still `hold_ticks` times and encode at TICK_HZ.
# Fallback 14 fps is only for reels whose v1 table does not parse.
TICK_HZ = 60
FRAME_TABLE_OFF = 0x8C2
FRAME_REC_SIZE = 80
FRAME_AUDIO_OFF = 32  # u16, 1-based group-A slot
FRAME_CMD_OFF = 0x24  # u32 offset of DF.EXE in-engine command stream
PLAYLIST_COUNT_OFF = 0x34
PLAYLIST_OFF = 0x83E
# MOVPLAY 0x40B933 links the playlist into a *circular* list: each node
# points at the next, and the last one at playlist entry header+0x8BE.
# That entry is 0 in all 31 Dust reels that have a theme. Six of them run
# out of bed before the picture ends and audibly loop: LUPRE (~59 s),
# LUSS (~30 s), D4AD4N, INTRO, INTRO3, MAIN.
PLAYLIST_WRAP_OFF = 0x8BE
# DF.EXE 0x4196a0: rec+0 is command *count*, not actionframe. Commands
# live in the scene header at rec+0x24. Size jump table at 0x419ca0.
# Type 2 is 16 bytes: Mac rect (top,left,bottom,right) + A-slot at +10
# + dest-frame at +14. 0x40ac60 is point-in-rect; 0x419530 plays the
# slot; 0x419b73 writes dest-frame into the playhead. last=0/1 stay
# (harmonica / MUSIPLAT). last>1 play + jump. Linear extract fires
# last>1 at the *dest* rec's start tick, one cue per (slot, dest).
# Replay wait-stills (grocpots rec 9 last=2 again) do not clang twice.
# Type 3 is 46 bytes: Pascal ".mov" at +14. KIDDIE.MOV click windows
# carry kidwin.mov here; rec+0x16==3 on the last rec of a window plays
# that reel if the type-2 dest was not taken (timeout = Kid wins).
# Type 4 is 48 bytes: same Mac rect + Pascal ".mov" at +16. Click
# pushes a nested play (0x419ba3, depth < 5) — towertop windows play
# bellmoon / bellbarn / belltown.
# Rec+0x16 when cmd count is 0 is an end-kind (0x4199b7). Kind 3
# copies rec+0x30 Pascal into the current movie name (0x419a24) —
# towerup → towertop → towerdn; intro2 → intro3; *end → finalend.
CMD_SIZES = {1: 0x0E, 2: 0x10, 3: 0x2E, 4: 0x30, 5: 0x0E}
REC_END_KIND_OFF = 0x16  # u16; used when rec+0 cmd count is 0
REC_FLAGS_OFF = 0x1A  # u16; bit 0 = wait until group-A mixer idle
WAIT_AUDIO_FLAG = 0x1
REC_NEXT_NAME_OFF = 0x30  # Pascal filename (type-3 chain)
END_KIND_CHAIN = 3
CMD_MOVIE_NAME_OFF = 16  # Pascal inside a type-4 command
CMD_TYPE3_MOVIE_OFF = 14  # Pascal inside a type-3 timeout reel
# INFO/MAIN is an interactive attract reel with hundreds of jump
# hotspots. Do not treat those as auto SFX.
MAX_CMD_AUTO_SFX = 32
REEL_FPS = 14  # legacy fallback; not original

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
    """One MOV clip. start_tick is 60 Hz engine time from MOVPLAY."""

    start_tick: int
    pcm: bytes
    hertz: int
    width: int
    channel: str = ""


@dataclass(frozen=True)
class ClickHotspot:
    """DF.EXE type-2 / type-4 Mac rect. last>=2 jumps to that 0-based rec."""

    top: int
    left: int
    bottom: int
    right: int
    dest: int
    channel: str = ""
    # Type-4 nested playmovie (towertop windows). Empty = jump/SFX.
    movie: str = ""


@dataclass(frozen=True)
class FrameHold:
    container: int
    hold_ticks: int
    start_tick: int
    # Raw rec+0: DF.EXE command count (MOVPLAY ignores this stream).
    action: int = 0
    # Type-2 slot-0 last=2: inspect still, hold until click (WARNING/BONE).
    wait: bool = False
    # rec+0x1A bit 0: DF.EXE 0x419300 / MOVPLAY 0x40BF6C busy-wait A mixer idle.
    wait_audio: bool = False
    hotspots: tuple[ClickHotspot, ...] = ()
    # Rec+0x16. Kind 3 on a timed click window plays timeout_movie.
    end_kind: int = 0
    timeout_movie: str = ""


@dataclass(frozen=True)
class StillFrame:
    """One composited still with the scene palette MOVPLAY would have loaded."""

    container: int
    image: IndexedImage
    palette: Palette


@dataclass(frozen=True)
class ClipStart:
    """One scheduled play of an audio container (A slot or B playlist)."""

    container: int
    start_tick: int
    channel: str
    duration_ticks: int = 0


@dataclass(frozen=True)
class ReelTimeline:
    """Per-still holds recovered from Dust v1 MOV headers + MOVPLAY."""

    tick_hz: int
    frames: tuple[FrameHold, ...]
    clip_starts: tuple[ClipStart, ...]
    # Rec+0x16==3 Pascal at rec+0x30. playmovie loads this file when
    # the playhead finishes (towerup → towertop.mov).
    next_movie: str = ""
    # header+0x8BE of the head scene: playlist entry the last B node
    # links back to. -1 when the reel has no theme playlist.
    bed_wrap: int = -1

    @property
    def duration_ticks(self) -> int:
        if not self.frames:
            return 0
        last = self.frames[-1]
        return last.start_tick + last.hold_ticks

    def hold_for(self, container: int) -> int:
        for frame in self.frames:
            if frame.container == container:
                return frame.hold_ticks
        return 1


def is_scene_header(data: bytes) -> bool:
    """Dust v1 MOV scene block: palette + 80-byte frame table at 0x8C2."""
    if len(data) < FRAME_TABLE_OFF + FRAME_REC_SIZE:
        return False
    if struct.unpack_from("<I", data, 0)[0] != 0x00010000:
        return False
    if is_audio_container(data):
        return False
    height, width = struct.unpack_from("<hh", data, 34)
    # NITEWARN header is 265×513 (decoded still pads to even for x264).
    return (264 <= height <= 266 or height == 384) and 512 <= width <= 516


def audio_duration_ticks(data: bytes, tick_hz: int = TICK_HZ) -> int:
    """PCM length in engine ticks from the audio container header."""
    try:
        codec, hertz, size = audio_params(data)
    except AudioError:
        return 0
    width = 1 if codec == 1 else 2
    if hertz <= 0 or size <= 0 or width <= 0:
        return 0
    samples = size // width
    return max(0, int(round(samples * tick_hz / hertz)))


def _pascal_mov_name(data: bytes, off: int) -> str:
    """Mac Pascal string that names another MOV (type-4 cmd or rec+0x30)."""
    if off >= len(data):
        return ""
    n = data[off]
    end = off + 1 + n
    if n < 5 or n > 31 or end > len(data):
        return ""
    raw = data[off + 1 : end]
    if not all(32 <= b < 127 for b in raw):
        return ""
    name = raw.decode("ascii")
    if not name.lower().endswith(".mov"):
        return ""
    stem = name[:-4]
    if not stem or not stem.replace("_", "").isalnum():
        return ""
    return name


def _rec_next_movie(rec: bytes) -> str:
    """DF.EXE 0x419a24: cmd count 0 and rec+0x16==3 → play rec+0x30."""
    if len(rec) < REC_NEXT_NAME_OFF + 2:
        return ""
    if struct.unpack_from("<H", rec, 0)[0] != 0:
        return ""
    if struct.unpack_from("<H", rec, REC_END_KIND_OFF)[0] != END_KIND_CHAIN:
        return ""
    return _pascal_mov_name(rec, REC_NEXT_NAME_OFF)


def _frame_commands(
    header: bytes, rec: bytes
) -> list[tuple[int, int, int, tuple[int, int, int, int] | None, str]]:
    """DF.EXE 0x4196a0 stream: (type, A-slot, dest-frame, Mac rect, movie)."""
    if len(rec) < FRAME_CMD_OFF + 4:
        return []
    count = struct.unpack_from("<H", rec, 0)[0]
    if count < 1 or count > 64:
        return []
    pos = struct.unpack_from("<I", rec, FRAME_CMD_OFF)[0]
    out: list[tuple[int, int, int, tuple[int, int, int, int] | None, str]] = []
    for _ in range(count):
        if pos + 2 > len(header):
            break
        raw = struct.unpack_from("<h", header, pos)[0]
        kind = abs(raw)
        size = CMD_SIZES.get(kind)
        if size is None or pos + size > len(header):
            break
        slot = 0
        last = 0
        rect: tuple[int, int, int, int] | None = None
        movie = ""
        if kind in (1, 2) and size >= 12:
            slot = struct.unpack_from("<H", header, pos + 10)[0]
            last = struct.unpack_from("<H", header, pos + size - 2)[0]
        if kind == 2 and size >= 10:
            rect = struct.unpack_from("<hhhh", header, pos + 2)
        if kind == 3:
            movie = _pascal_mov_name(header, pos + CMD_TYPE3_MOVIE_OFF)
        if kind == 4 and size >= 10:
            rect = struct.unpack_from("<hhhh", header, pos + 2)
            movie = _pascal_mov_name(header, pos + CMD_MOVIE_NAME_OFF)
        out.append((kind, slot, last, rect, movie))
        pos += size
    return out


def parse_reel_timeline(df: DFFile) -> ReelTimeline | None:
    """Read v1 scene headers. None if this MOV has no Dust frame table."""
    if len(df.containers) < 2:
        return None
    header = df.containers[0].data
    version = struct.unpack_from("<i", header, 2)[0] if len(header) >= 6 else 0
    if version != 1 or not is_scene_header(header):
        return None
    scenes = [0]
    for index, container in enumerate(df.containers[1:], start=1):
        if is_scene_header(container.data):
            scenes.append(index)
    frames: list[FrameHold] = []
    clip_starts: list[ClipStart] = []
    next_movie = ""
    # Group-A starts: (container, tick, dur, channel, scene, from_cmd)
    a_events: list[tuple[int, int, int, str, int, bool]] = []
    cmd_raw = 0
    tick = 0
    bed_wrap = -1
    ncont = len(df.containers)
    for scene_i, scene_index in enumerate(scenes):
        data = df.containers[scene_index].data
        count = struct.unpack_from("<H", data, 24)[0]
        default = struct.unpack_from("<I", data, 0x26)[0]
        n_a = struct.unpack_from("<H", data, 26)[0]
        n_b = struct.unpack_from("<H", data, 28)[0]
        if scene_i == 0 and len(data) >= PLAYLIST_WRAP_OFF + 4:
            if struct.unpack_from("<h", data, PLAYLIST_COUNT_OFF)[0] > 0:
                bed_wrap = struct.unpack_from("<i", data, PLAYLIST_WRAP_OFF)[0]
        next_scene = scenes[scene_i + 1] if scene_i + 1 < len(scenes) else ncont
        audios: list[int] = []
        for index in range(scene_index + 1, next_scene):
            if is_audio_container(df.containers[index].data):
                audios.append(index)
        a_clips = audios[:n_a]
        b_clips = audios[n_a : n_a + n_b]
        if n_b > 0 and b_clips:
            # New theme table replaces the old playlist (MOVPLAY frees B
            # at 0x40BA26 when header+0x1C != 0). Drop not-yet-started beds.
            clip_starts[:] = [
                clip
                for clip in clip_starts
                if not (clip.channel == "B" and clip.start_tick >= tick)
            ]
            n_c = struct.unpack_from("<H", data, PLAYLIST_COUNT_OFF)[0]
            seq: list[int] = []
            if n_c > 0 and PLAYLIST_OFF + n_c * 2 <= len(data):
                order = struct.unpack_from(f"<{n_c}H", data, PLAYLIST_OFF)
                for slot in order:
                    if 1 <= slot <= len(b_clips):
                        seq.append(b_clips[slot - 1])
            if not seq:
                seq = list(b_clips)
            bed = tick
            for index in seq:
                dur = audio_duration_ticks(df.containers[index].data)
                clip_starts.append(ClipStart(index, bed, "B", dur))
                bed += dur
        need = count * FRAME_REC_SIZE
        if FRAME_TABLE_OFF + need > len(data):
            return None
        # Type-2 last>1: (container, dest rec, dur, channel, scene).
        scene_cmd: list[tuple[int, int, int, str, int]] = []
        for rec_i in range(count):
            rec = data[
                FRAME_TABLE_OFF + rec_i * FRAME_REC_SIZE : FRAME_TABLE_OFF
                + (rec_i + 1) * FRAME_REC_SIZE
            ]
            extra = struct.unpack_from("<I", rec, 2)[0]
            local = struct.unpack_from("<H", rec, 28)[0]
            action = struct.unpack_from("<H", rec, 0)[0]
            hold = extra if extra > default else default
            if hold <= 0:
                hold = default if default > 0 else 1
            slot = struct.unpack_from("<H", rec, FRAME_AUDIO_OFF)[0]
            if 1 <= slot <= len(a_clips):
                cont = a_clips[slot - 1]
                a_events.append(
                    (
                        cont,
                        tick,
                        audio_duration_ticks(df.containers[cont].data),
                        f"A{slot}",
                        scene_index,
                        False,
                    )
                )
            wait = False
            flags = struct.unpack_from("<H", rec, REC_FLAGS_OFF)[0]
            wait_audio = bool(flags & WAIT_AUDIO_FLAG)
            spots: list[ClickHotspot] = []
            timeout_movie = ""
            end_kind = struct.unpack_from("<H", rec, REC_END_KIND_OFF)[0]
            for kind, cmd_slot, last, rect, movie in _frame_commands(data, rec):
                # Inspect still: the rec's only command is a slot-0 click
                # region that jumps the playhead (WARNING/BONE/BELLMOON).
                # `last` is the dest rec (0x419b73), not a magic 2 —
                # BELLBARN jumps to 3, JAILMAP/HIDEPLAT page through 4→5.
                # With one command there is no type-3 timeout, so the reel
                # can only advance on the click. Do not pause on a dest
                # among several hotspots (INFO/MAIN, KEYS, grocpots) or on
                # last 0/1, which stay on the still (harmonica/MUSIPLAT).
                if (
                    action == 1
                    and kind == 2
                    and cmd_slot == 0
                    and last > 1
                ):
                    wait = True
                # Type 5: click pops a nested play (belltown from towertop).
                if kind == 5:
                    wait = True
                # last 0/1 stay on this still (click-to-play). last>1 is
                # play + jump to that 0-based rec (0x419b73). Collect here;
                # resolve to dest-frame ticks after this scene's holds.
                if kind in (1, 2) and 1 <= cmd_slot <= len(a_clips) and last > 1:
                    cont = a_clips[cmd_slot - 1]
                    scene_cmd.append(
                        (
                            cont,
                            last,
                            audio_duration_ticks(df.containers[cont].data),
                            f"A{cmd_slot}",
                            scene_index,
                        )
                    )
                if kind == 2 and rect is not None and last >= 2:
                    top, left, bottom, right = rect
                    # Slot is 1-based into this scene's group A. SAFEBOX's
                    # take-stone click stores 65516 here — not a mixer
                    # channel. Naming that A65516 made play treat a
                    # playhead jump as a bell ring (segment then wait).
                    channel = (
                        f"A{cmd_slot}" if 1 <= cmd_slot <= len(a_clips) else ""
                    )
                    spots.append(
                        ClickHotspot(top, left, bottom, right, last, channel)
                    )
                if kind == 4 and rect is not None and movie:
                    top, left, bottom, right = rect
                    spots.append(
                        ClickHotspot(top, left, bottom, right, 0, "", movie)
                    )
                if kind == 3 and movie:
                    timeout_movie = movie
            # Several dests on one rec (bells/pots) sit until click.
            # One dest on a 3-tick run (kiddie hand/gun/Kid) is a timed
            # window: keep hotspots, do not pause the playhead.
            if spots and not wait:
                wait = len(spots) > 1
            frames.append(
                FrameHold(
                    container=scene_index + local,
                    hold_ticks=hold,
                    start_tick=tick,
                    action=action,
                    wait=wait,
                    wait_audio=wait_audio,
                    hotspots=tuple(spots),
                    end_kind=end_kind,
                    timeout_movie=(
                        timeout_movie if end_kind == END_KIND_CHAIN else ""
                    ),
                )
            )
            chained = _rec_next_movie(rec)
            if chained:
                next_movie = chained
            tick += hold
        cmd_raw += len(scene_cmd)
        scene_frames = frames[-count:] if count > 0 else []
        seen_cmd: set[tuple[str, int]] = set()
        resolved: list[tuple[int, int, int, str, int, bool]] = []
        for cont, dest_i, dur, channel, scene in scene_cmd:
            dest = dest_i
            if dest < 0:
                dest = 0
            if scene_frames and dest >= len(scene_frames):
                dest = len(scene_frames) - 1
            key = (channel, dest)
            if key in seen_cmd:
                continue
            seen_cmd.add(key)
            start = scene_frames[dest].start_tick if scene_frames else tick
            resolved.append((cont, start, dur, channel, scene, True))
        resolved.sort(key=lambda item: (item[1], item[3]))
        a_events.extend(resolved)
    if cmd_raw > MAX_CMD_AUTO_SFX:
        a_events = [event for event in a_events if not event[5]]
        frames = [
            FrameHold(
                container=frame.container,
                hold_ticks=frame.hold_ticks,
                start_tick=frame.start_tick,
                action=frame.action,
                wait=frame.wait and not frame.hotspots,
                wait_audio=frame.wait_audio,
                hotspots=(),
                end_kind=frame.end_kind,
                timeout_movie=frame.timeout_movie,
            )
            for frame in frames
        ]
    # A new scene can fire rec+32 while the previous scene's line is still
    # going (INTRO clip 325 vs 423). MOVPLAY's voice start is that frame;
    # stacking the two makes the first unintelligible. Hold the new scene's
    # line until the previous scene's *original* end — do not chain delays,
    # and do not change same-scene retriggers (INTRO2 A2).
    for index, (cont, start, dur, channel, scene, _from_cmd) in enumerate(a_events):
        held = start
        for _c, prev_start, prev_dur, _ch, prev_scene, _prev_cmd in a_events[:index]:
            if prev_scene == scene or prev_start > start:
                continue
            prev_end = prev_start + prev_dur
            if held < prev_end:
                held = prev_end
        clip_starts.append(ClipStart(cont, held, channel, dur))
    if not frames:
        return None
    return ReelTimeline(
        tick_hz=TICK_HZ,
        frames=tuple(frames),
        clip_starts=tuple(clip_starts),
        next_movie=next_movie,
        bed_wrap=bed_wrap,
    )


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
    want_stills = write_frames or write_video
    stills: list[StillFrame] | None = None
    cues: list[AudioCue] = []
    palette: Palette | None = None
    if want_stills:
        palette = find_palette(df.containers[0].data)
        if palette is not None:
            stills, cues = _collect_reel(df, decode_audio=write_video)
    if write_frames and stills is not None:
        counts["frames"] = _write_frames(stills, out_dir)
    timeline = parse_reel_timeline(df)
    if timeline is not None:
        _write_timeline(timeline, out_dir)
        counts["timeline"] = 1
    if write_video and stills:
        counts["video"] = _write_video(stills, cues, out_dir, timeline=timeline)
    if write_audio:
        counts["audio"] = _write_audio(df, out_dir)
    return {key: value for key, value in counts.items() if value}


def _write_scripts(df: DFFile, out_dir: Path) -> int:
    written = 0
    for index, container in enumerate(df.containers[1:], start=1):
        if not looks_like_script(container.data):
            continue
        if decode_and_write_script(out_dir / f"script_{index}.txt", container.data):
            written += 1
    return written


def _iter_stills(df: DFFile) -> Iterator[StillFrame]:
    stills, _cues = _collect_reel(df, decode_audio=False)
    yield from stills


def bed_wrap_cues(timeline: ReelTimeline) -> list[ClipStart]:
    """Extra B plays once the playlist runs out (MOVPLAY circular list).

    The last node links back to playlist entry `header+0x8BE`, so a reel
    that outlives its playlist keeps looping from there. Six Dust reels do
    (LUPRE, LUSS, D4AD4N, INTRO, INTRO3, MAIN). Linear consumers (`--video`)
    need those repeats spelled out; `clip_starts` stays the literal file.
    """
    if timeline.bed_wrap < 0:
        return []
    beds = sorted(
        (c for c in timeline.clip_starts if c.channel == "B"),
        key=lambda c: c.start_tick,
    )
    if not beds or any(c.duration_ticks <= 0 for c in beds):
        return []
    total = timeline.duration_ticks
    at = max(c.start_tick + c.duration_ticks for c in beds)
    extra: list[ClipStart] = []
    index = min(timeline.bed_wrap, len(beds) - 1)
    while at < total and len(extra) < 512:
        clip = beds[index]
        extra.append(
            ClipStart(
                container=clip.container,
                start_tick=at,
                channel="B",
                duration_ticks=clip.duration_ticks,
            )
        )
        at += clip.duration_ticks
        index = index + 1 if index + 1 < len(beds) else min(
            timeline.bed_wrap, len(beds) - 1
        )
    return extra


def _collect_reel(
    df: DFFile, *, decode_audio: bool
) -> tuple[list[StillFrame], list[AudioCue]]:
    stills: list[StillFrame] = []
    cues: list[AudioCue] = []
    timeline = parse_reel_timeline(df)
    schedule: dict[int, list[tuple[int, str]]] = {}
    if timeline is not None:
        for clip in list(timeline.clip_starts) + bed_wrap_cues(timeline):
            schedule.setdefault(clip.container, []).append(
                (clip.start_tick, clip.channel)
            )
    palette = find_palette(df.containers[0].data)
    if palette is None:
        return stills, cues
    prior: bytes | None = None
    for index, container in enumerate(df.containers[1:], start=1):
        if is_audio_container(container.data):
            if decode_audio and index in schedule:
                try:
                    pcm, hertz, width = decode_audio_container(container.data)
                except AudioError:
                    continue
                for start, channel in schedule[index]:
                    cues.append(AudioCue(start, pcm, hertz, width, channel))
            continue
        if is_scene_header(container.data):
            next_pal = find_palette(container.data)
            if next_pal is not None:
                palette = next_pal
            continue
        if len(container.data) < 64:
            continue
        try:
            image = decode_indexed_image(container.data, prior)
        except ImageError:
            try:
                image = decode_indexed_image(container.data, None)
            except ImageError:
                continue
        prior = image.pixels
        stills.append(StillFrame(index, image, palette))
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
    cues: list[AudioCue],
    duration_ticks: int,
    tick_hz: int = TICK_HZ,
) -> tuple[bytes, int]:
    """Mix clips onto one 16-bit mono stream. Empty cues → empty PCM.

    Distinct channels add. A later cue on the same channel cuts the
    earlier one (MOVPLAY restarts that slot; INTRO2 retriggers A2).
    """
    if not cues:
        return b"", 22050
    out_hz = max(cue.hertz for cue in cues)
    video_n = int(round(duration_ticks / tick_hz * out_hz)) if duration_ticks else 0
    by_channel: dict[str, list[tuple[int, list[float]]]] = {}
    unique = 0
    for cue in cues:
        samples = resample_floats(pcm_to_floats(cue.pcm, cue.width), cue.hertz, out_hz)
        start = int(round(cue.start_tick / tick_hz * out_hz))
        channel = cue.channel or f"_{unique}"
        unique += 1
        by_channel.setdefault(channel, []).append((start, samples))
    placed: list[tuple[int, list[float]]] = []
    last = video_n
    for items in by_channel.values():
        items.sort(key=lambda item: item[0])
        for index, (start, samples) in enumerate(items):
            if index + 1 < len(items):
                nxt = items[index + 1][0]
                if nxt <= start:
                    samples = []
                elif nxt < start + len(samples):
                    samples = samples[: nxt - start]
            if not samples:
                continue
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


def _write_timeline(timeline: ReelTimeline, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "tick_hz": timeline.tick_hz,
        "duration_ticks": timeline.duration_ticks,
        "duration_seconds": round(timeline.duration_ticks / timeline.tick_hz, 4),
        "frame_count": len(timeline.frames),
        "frames": [
            {
                "container": f.container,
                "hold_ticks": f.hold_ticks,
                "start_tick": f.start_tick,
                "action": f.action,
                "wait": f.wait,
                **({"wait_audio": True} if f.wait_audio else {}),
                **(
                    {
                        "hotspots": [
                            {
                                "top": spot.top,
                                "left": spot.left,
                                "bottom": spot.bottom,
                                "right": spot.right,
                                "dest": spot.dest,
                                "channel": spot.channel,
                                **({"movie": spot.movie} if spot.movie else {}),
                            }
                            for spot in f.hotspots
                        ]
                    }
                    if f.hotspots
                    else {}
                ),
                **({"end_kind": f.end_kind} if f.end_kind else {}),
                **(
                    {"timeout_movie": f.timeout_movie}
                    if f.timeout_movie
                    else {}
                ),
            }
            for f in timeline.frames
        ],
        "clips": [
            {
                "container": clip.container,
                "start_tick": clip.start_tick,
                "channel": clip.channel,
                **(
                    {"duration_ticks": clip.duration_ticks}
                    if clip.duration_ticks > 0
                    else {}
                ),
            }
            for clip in timeline.clip_starts
        ],
        **({"next": timeline.next_movie} if timeline.next_movie else {}),
        **({"bed_wrap": timeline.bed_wrap} if timeline.bed_wrap >= 0 else {}),
        "source": (
            "MOVPLAY tick=timeGetTime()*3/50; record at header+0x8C2 i*80; "
            "hold=max(header+0x26, rec+2); A cue=rec+32; B playlist at +0x83E; "
            "DF.EXE rec+0 command stream at rec+0x24 (spotmovie SFX at dest-frame last); "
            "type-4 nested .mov; rec+0x16=3 chains rec+0x30; "
            "rec+0x1A bit 0 waits for group-A mixer idle (DF.EXE 0x419300)"
        ),
    }
    (out_dir / "timeline.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def _write_frames(stills: list[StillFrame], out_dir: Path) -> int:
    frame_dir = out_dir / "FRAMES"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for still in stills:
        write_indexed_png(
            frame_dir / f"frame_{still.container}.png", still.image, still.palette
        )
    return len(stills)


def fit_rgb24(image: IndexedImage, palette: Palette, width: int, height: int) -> bytes:
    """Pack a still into a ``width``×``height`` RGB24 canvas (black letterbox).

    Attract reels such as TIPRE switch 512×384 title cards and 512×264
    picture; MOVPLAY's framebuffer is per-scene. One MP4 needs one size.
    """
    src = still_rgb24(image, palette)
    if image.width == width and image.height == height:
        return src
    if image.width > width or image.height > height:
        raise DFError(
            f"reel frame {image.width}x{image.height} larger than canvas {width}x{height}"
        )
    canvas = bytearray(width * height * 3)
    x0 = (width - image.width) // 2
    y0 = (height - image.height) // 2
    src_row = image.width * 3
    for y in range(image.height):
        start = y * src_row
        dest = ((y + y0) * width + x0) * 3
        canvas[dest : dest + src_row] = src[start : start + src_row]
    return bytes(canvas)


def _write_video(
    stills: list[StillFrame],
    cues: list[AudioCue],
    out_dir: Path,
    timeline: ReelTimeline | None = None,
) -> int:
    ffmpeg = find_ffmpeg()
    if ffmpeg is None:
        raise DFError("ffmpeg not found on PATH (required for --video)")
    width = max(still.image.width for still in stills)
    height = max(still.image.height for still in stills)
    # libx264 yuv420p needs even dimensions (NITEWARN is 516×265).
    if width % 2:
        width += 1
    if height % 2:
        height += 1
    dest = out_dir / "movie.mp4"
    if timeline is not None:
        duration_ticks = timeline.duration_ticks
        tick_hz = timeline.tick_hz
        fps = tick_hz
    else:
        duration_ticks = len(stills) * 1
        tick_hz = REEL_FPS
        fps = REEL_FPS
    mixed_pcm, mixed_hz = mix_cues(cues, duration_ticks, tick_hz)
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
        str(fps),
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
            for still in stills:
                rgb = fit_rgb24(still.image, still.palette, width, height)
                copies = (
                    timeline.hold_for(still.container) if timeline is not None else 1
                )
                for _ in range(max(1, copies)):
                    proc.stdin.write(rgb)
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
