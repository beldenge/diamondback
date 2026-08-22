# File types

All offsets below are into **container data** (no 8-byte id/size prefix).
Integer fields little-endian. Version at `container[0].data + 2` is 1.

## BOOTFILE

No suffix. `WIN31/DUST/BOOTFILE`.

Container 0 is a tiny header. Containers **1…N** are scripts. We write
`Script 1.txt`, `Script 2.txt`, … matching DFET.

The installed dump’s `Script 1.txt` is the game boot: paths, `framerate`,
CD checks, `day` / `clock` globals.

## PUP — puppets

39 files. Dialogue, conversation scripts, face sprites, speech.

### Container 0 — header + dialogue

Version `i32` at +2 must be 1 (Dust has a single stance; Titanic has up
to 64).

Palette at **+58** (256 × 8 bytes).

Dialogue table (DFET: “always starts at 2184” after a 24-byte numeric
prefix):

```
i16 count                         @ 2158
record[count]                     @ 2160
  each record is 312 bytes:
    i32 unknown
    i16 unknown, i16 durationTicks  # 82-byte viseme frames; tick/60 = seconds
    i32 audioLocation             # container index of the WAV
    i32 animLogic                  # container index of the 82-byte viseme track
    i32 unknown, i32 unknown
    Pascal text in a 256-byte field   # @ record+24
    Pascal ident in a 32-byte field   # @ record+280
```

`JENIX.PUP`: 35 lines, first ident `jenix.2` = `They're yours!`.

`animLogic` is not a jaw-frame id. It is a **container of lip-sync
keyframes**: `len / 82` records, `durationTicks` records (the i16 at
record+4). Each record is 82 bytes / 41 i16s: tick at +0 (60 Hz), then
11 layer slots starting at +16 (3×i16 each, first = index into that
face table, `-1` = hide). Last tick / 60 equals the WAV length.
Written as `AUDIO/visemes/<ident>.json` (play mode) and `AUDIO/visemes.json` (full extract blob; do not fetch that in the browser).

### Container 2 — script directory

```
i16 count                         @ 22
record[count]                     @ 24
  each record is 40 bytes:
    i32 container index
    i32 unknown
    Pascal name in a 32-byte field
```

`JENIX.PUP`: `Boot Script`, `day1`, `day2`, `day3`.

### Container 3 — face tables (Dust)

11 tables × (3 × i16 + 64 × i32) starting at **+22**:

`count`, `unknown`, `totalEntries`, then 64 container indices.

Folder names, in order (DFET):

Background, Body, Head, Eyes, Eyebrows, Nose, Jaw, Left, Hands 1,
Right, Hands 2.

Skip a table when `count == 0`. Frames are transparent sprites named
`frame_<containerId>.png`.

`MAYOR.PUP` / `NED.PUP` need the dummy-offset fix in
[container-format.md](container-format.md).

## CST — cast (in-world bodies)

4 unique files: EXTRA (town extras), GANG (named characters), TARGET,
MINE.

```
i32 version                       @ 2   (must be ≤ 4)
palette                           @ 36
i32 actorCount                    @ 0x938
actor refs                        @ 0x93C   # 16 bytes each, first i32 = logic container
```

Each logic container:

```
i32 scriptContainer               @ 0x26
Pascal actor name                 @ 0x2A
i32 setCount                      @ 0x5A
set records                       @ 0x5E
  each set is 32 bytes:
    i32 setInfoContainer          @ 0
    Pascal animation name         @ 16   # walk, stand, …
```

`setInfo` container:

```
i32 frameCount                    @ 0x72
record[frameCount]                @ 0x76   # 44 bytes each, first i32 = frame container
```

Frames are transparent sprites. EXTRA.CST Jenix has one set `stand`
and `frame_195`.

In-world size is not 1:1 on the still except on the camera plane.
`stdscale` / `actorscale` live in `CST/_GANG/Cast.txt` (`stdscale("town")`
= 1450; Leroy at the sign then sets 1100). Play mode notes:
[`src/play/README.md`](../../src/play/README.md). Contact-shadow extract
is in [images.md](images.md).

## SND — sound banks (Dust v1)

See [audio.md](audio.md). Refuse `version != 1`. Combined beds
(`town.snd.wav`) plus named one-shots.

## SET — locations

35 files. mrxstudios
[2022-04-25](https://mrxstudios.home.blog/2022/04/25/reverse-engineering-dust-game-locations-and-map-layout/)
plus header pointers we measured on `APOTH.SET`.

### Container 0 header (partial)

```
i32 signature / version           @ 0 / @ 2
i32 framelist chunk count         @ 8     # 28 on APOTH (blog was off by 4)
i16 draw-lens setback             @ 24    # 64 on every Dust SET we dumped
i16 camera Z / height             @ 26    # town/nite 62; target 72; interiors 90–260
i16 framelist container           @ 30    # 44 on APOTH
i16 waypoint container            @ 34    # 43 on APOTH
i16 grid width, height            @ 38    # TOWN 15×15
i16 still width, height           @ 42    # 512×264 outdoor
i16 spawn x, y, facing            @ 48    # TOWN/NITE (6,14,1) = O7 N; 1=N 2=S 3=E 4=W (`0x40eae0`)
i16 default actorzclip            @ 60    # town 32; many interiors 64/128
palette                           @ ~80
```

+24 is the draw-lens setback `DF.EXE` reads at `[0x46094c]` (play:
`CAMERA_SETBACK`). The `mov` that copies SET→BSS is not traced; do not
swap in the patent’s 128. World→still:
[`src/play/README.md`](../../src/play/README.md).

### Scene grid (end of container 0)

Last `count * 32` bytes, where `i32` immediately before that run equals
`count`. A **suffix** of a real table can look like a smaller grid
(TOWN/NITE/TARGET: 129 records for rows G–O). We take the **longest**
well-formed candidate. Each 32-byte scene:

```
i16 x, y
i16 interact      # 1 = hotspot / door
i16 unknown_c
i16 blocked       # 1 = cannot stand here
i16 unknown_e     # often 12 when blocked
Pascal name       @ 12   # 16-byte field
i32 scriptContainer @ 28
```

APOTH is a 3×3: A2/B2/C2 walkable, A2/B2/C2 interactable. Matches the
blog. Tile coordinate space is **256×256** per cell in `DF.EXE`
(`tile * 256 + 128`); waypoint records store absolute u16 xy.

Container **1** is the boot script when it starts with `code`.

### Waypoints

Waypoint container (`header+34`):

```
i32 count                         @ 24
record[count]                     @ 28
  each 50 bytes holds **two** stars:
    slot A @ +0  (26 bytes):
      u16 flags                   @ +0
      u16 x                       @ +2
      u16 y                       @ +4
      u16 unk                     @ +6
      Pascal name                 @ +8   # 18-byte field
    slot B @ +26 (24 bytes):
      same 8-byte header
      Pascal name                 @ +8   # 16-byte field
    i32 path container            @ +0x18  # 0 = no polyline; else SET container
```

+0x18 sits after name A’s 16-byte field (before slot B xyz). Non-zero
is a SET container: `i32 count` @0, `i32` total length @4, then
`count` points at +16 of `{i16 x, y, z, seg}` (8 bytes). `DF.EXE`
`0x424000` loads that polyline for named `walktostar` (any actor);
reverse when going B→A. Extract: `SET/_<PLACE>/paths.json` (empty list
if the SET has no pairs).

Empty slot B has Pascal length 0. Small maps (APOTH) leave every B
empty. TOWN/NITE pack pairs: `town.leroy2` / `town.leroy1` (1740, 3536)
with path container **262**, `town.blood1` / `town.blood2`, and so on.
Do not invent missing stars — they are in slot B.

APOTH: `drugs.watson1` (190,90), `drugs.watson2` (64,82).

### Framelist / transitions

Framelist container (`header+30`), `count * 28` bytes (count also at
header+8). Each record:

```
i16 xFrom, yFrom, dirFrom
i16 xTo,   yTo,   dirTo
i16 duplicate of the six values     # always a copy except HUB maze
i32 frame0                          # first of 6 consecutive frame containers
```

Directions: 1=N, 2=S, 3=E, 4=W.

Each transition is **5 low-res walk frames + 1 higher-quality still**,
containers `frame0 … frame0+5`. Codec: indexed still
([images.md](images.md)). 512×264.

We write `scenes.json`, `waypoints.json`, `transitions.json`, boot +
per-scene scripts, and `FRAMES/<frame0>_<offset>.png` (decode each
6-frame strip from a clean prior; do not share one PNG per container).

TOWN.SET / NITE.SET: 225 scenes (15×15, A1–O15), 52 walkable, 526
transitions, 2838 frames each. TARGET.SET uses the same 225-cell table
with a smaller walkable subset (shooting-range overlay).

## FLT — puzzle “flats”

20 files. No public layout. Empirically:

- Container 0: header + palette + Pascal names near the end
  (`checkers.flt`, `Flat 0`)
- Any later container whose first token is `code` is a script
  (`playcheckers`, `openflat`, `mousedown`, …)
- A large container starting with `384, 512` (or similar) is an
  indexed still — the puzzle backdrop / HUD

We dump every script and every still that decodes. HIST.FLT produced 50
frames (diary / history pages).

## PRP — props

14 files. Same script heuristic as FLT (`initprop` is common). Palette
via `find_palette`.

The object table is the Titanic SHP layout (DFET `DFshp.h`) even though
Dust is version 1:

```
i32 groupCount                    @ 2360
group refs                        @ 2364   # 16 bytes each, first i32 = logic container
```

Each logic container (same as SHP `ObjectGroup`):

```
i32 entryCount-ish / unk          @ 24
i16[5]                            @ 28
i32 scriptContainer               @ 38
Pascal group name                 @ 42     # 48-byte field
i32 entryCount                    @ 90
entries                           @ 94     # 32 bytes each:
    i32 infoContainer
    i32[3] unused
    Pascal state name             @ +16    # 16-byte field
```

`infoContainer` matches CST set-info:

```
i32 frameCount                    @ 114
frame records                     @ 118    # 44 bytes, first i32 = sprite container
```

We write `FRAMES/<Group>/<state>/<ii>_c<container>.png` plus
`props.json`. Leftover containers go to `FRAMES/_unnamed/`.

INVEN examples: `Bone/small`, `Cigar/large`, `BKnife/panel`.
CHECKERS: `me1/normal`, `me1/king`, `him1/king`, `exitclick/click`.

## MOV — movies / inspectables / cutscenes

258 on disk. Dust v1. DFET refuses these.

A file is one or more **scene headers** plus audio and still containers.
Container 0 is always a scene header. Later scene headers are blocks
that start `00 00 01 00`, are not audio, and have 264×512 or 384×512
at +34.

Scene header (proven from `MOVPLAY.EXE`; full writeup
[`dustdecompile/docs/findings.md`](../../dustdecompile/docs/findings.md) §7):

```
u32 signature                     @ 0     # 0x00010000
i32 version                       @ 2     # must be 1
u16 still count                   @ 24    # 0x18
u16 group A count                 @ 26    # 0x1A  voice/SFX slots
u16 group B count                 @ 28    # 0x1C  theme clips
i16 height, width                 @ 34    # 264×512 or 384×512
u32 default hold ticks            @ 0x26
u16 B playlist length             @ 0x34
ColorPalette[256]                 @ 0x3E  # 8 bytes each; MOVPLAY copy @ 0x40BC9A
u16 B playlist[]                  @ 0x83E # 1-based indices into the B clips
80-byte frame records             @ 0x8C2 # count × 80; MOVPLAY rep movsd ecx=20
    u32 extra hold                @ rec+2 # hold = max(default, extra); 0 → default
    u16 still container           @ rec+28 # relative to this scene header’s index
    u16 group-A slot              @ rec+32 # 0 = none; else 1-based, retrigger restarts
```

Tick = `timeGetTime() * 3 / 50` = **60 Hz**. Duplicate each still
`hold` times and encode at 60 fps.

Then each later container is classified:

- audio signature → `AUDIO/clip_<i>.wav` (group A then group B after the header)
- first token `code` → `script_<i>.txt` (rare)
- scene header → skip (not an image; do **not** clear the prior framebuffer)
- otherwise try indexed still → `FRAMES/frame_<i>.png`

Stills are **deltas into one framebuffer**. Skip spans keep whatever
was already there. Each scene installs its **own palette** at `+0x3E`;
PNG/RGB use that palette, not container 0’s.

**Group A** starts when `record+32` matches the slot. Same slot again
restarts that clip (INTRO2 A2). A new scene that would start while the
previous scene’s A line is still playing is **held** until that line’s
original end (INTRO `clip_325` vs `clip_423`). **Group B** is a
sequential playlist; `n_b == 0` keeps the previous bed.

INTRO.MOV: 638 frames, 27 audio clips, **42.15 s**. INTRO2: 354 frames,
**18.60 s**. INTRO3: 1475 frames, **101.30 s**. Three intros ≈ **162 s**
of picture (was 176 s at a flat 14 fps). SALUP stairs **1.73 s**.
`DOG1` / `DOG2` overlays are ~1 s (same table, not `playmovie` reels).

Sidecar WAVs go under `AUDIO/` with `--audio`. `--video` is **opt-in**
(`python cli.py` does not mux). To watch without an mp4:
`python movplay.py out/MOV/_INTRO` (uses `FRAMES/` + `AUDIO/` +
`timeline.json`). With `--video`, every Dust v1 MOV that
has stills gets `movie.mp4` + `timeline.json`: intros, day-change,
spotmovie overlays (`DOG1`, `APOTHPIG`, …), `INFO/` attract reels, and
INVEN inspectables. Mixed 512×384 / 512×264 (TIPRE) is letterboxed;
odd sizes (NITEWARN 516×265) pad to even for x264. Not SET/PUP frames.
`is_reel_movie` is only a label for full-screen `playmovie` stems vs
overlays.

Inventory inspectables (`APPLE.MOV`, `GUN.MOV`, …) are 1–3 stills.

`MOVIES/ZUNUSED/*.MOV` are **not** `LPPALPPA` files. They start
`00 00 01 00` and look like leftover raw blobs. The CLI skips them.

`YUNNIBOX/BOXOPEN.MOV` and `BOXCLOSE.MOV` are real containers whose
stills currently fail the delta-span decoder. `BOXFINAL.MOV` yields one
frame.
