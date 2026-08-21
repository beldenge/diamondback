# Reconstruction gaps (for agents and humans)

This is **not** an extraction guide. It lists what the dump already
gives you versus what you still have to define, guess, or verify by
playing Dust / reading `DF.EXE`.

Engine-binary findings (opcode table, plugin ABI, working protocols):
[`dustdecompile/docs/findings.md`](../../dustdecompile/docs/findings.md).

If you only read `out/**/*.txt` and invent the rest, the remake will
look plausible and be wrong on branches.

Where files live: [output-catalog.md](output-catalog.md).  
How tokens decode: [scripts.md](scripts.md).

---

## You can trust

| Asset | Use it as |
|---|---|
| `PUP/**/*.txt`, `SET/**/*.txt`, `FLT/**/*.txt`, `PRP/**/*.txt`, `BOOT/**/*.txt` | Authored control flow and call **sequence** |
| `PUP/**/AUDIO/texts.csv` + `*.wav` | Line id → spoken text + audio |
| `SET/**/scenes.json` | Walkable vs blocked tiles, which script is attached |
| `SET/**/waypoints.json` | Named stand / walk-to points (255 units per tile) |
| `SET/**/transitions.json` | Which 6 stills play for a step/turn |
| `SET|MOV|FLT|CST|PUP|PRP` PNGs | What that view / sprite looked like (MOV stills composited; per-scene palette) |
| `MOV/**/movie.mp4` + `timeline.json` | **`--video` only.** MOVPLAY holds, A/B mixer, palettes. Close to original; not a capture. |
| `SND/**/*.wav` | World / UI audio |

Dialogue trees, flag names (`jenixphase`, `day`, `playercash`), and
“if you click the pig, play `apothpig.mov`” **are in the scripts**.
Do not re-invent those by playing the game.

---

## Gaps you must fill

### 1. Engine verb semantics (largest gap)

We printed **names** from DFET’s DreamFactory 4.0 opcode table
(`opcodes.py`, ~351 entries). We did **not** document:

- what each call **does**
- argument types / units / ranges
- return values
- timing (blocking vs fire-and-forget)
- what happens on bad arguments

An agent will parse `puppetbevel ("Yes, here is the money.", 101)` and
may treat `101` as a style, a sound, or a locale. In Dust it is the
**choice id** later returned by `puppetevent`. That kind of mistake is
the default if you only have the name.

**Fill this with:** the opcode handbook at
[`dustdecompile/docs/handbook.md`](../../dustdecompile/docs/handbook.md)
(regenerate with `python -m dustdecompile`). Highest-value verbs first:

| Verb (seen constantly) | What you still have to pin down |
|---|---|
| `puppetspeak` | Blocks until line finishes? Uses wav + mouth frames how? |
| `puppetbevel` / `puppetevent` | Choice UI; how ids are collected and returned (`-1` = dismiss?) |
| `puppetclear` | Clears speech, bevels, or both? |
| `sendtoactor` / `sendtopuppet` / `sendtocast` / `sendtoset` / `sendtostage` / `sendtoshop` | Target namespace (`"JENIX"` vs `"jenix.pup"` vs `"gang"`) |
| `actorowner` / `actorstar` / `actorxyz` / `walktostar` | Units, facing, async walk |
| `spotmovie` / `playmovie` / `opensetfile` | Overlay vs navigate; who owns the movie |
| `mousedown` / `setcursor` / `pointin*` / `pointx` / `pointy` | Screen space vs 512×264 still space |
| `me` / `passcode` / `exitcode` / `error` | Control-flow meaning |
| `@` | String concat (confirmed in dumps); any other use? |
| `plugin` / `pluginfx` | Leaves the script VM (see §3) |
| `path` | Virtual FS (`dust:data:`) vs real folders |
| `savegame` / `opengame` / `dumpglobal` | Filter in `DF.EXE` is `*.rtd`. No save in this install. Layout unknown. |

Anything printed as `cmd_<number>` is an opcode **not** in the 4.0
table. Treat as unknown; do not guess.

### 2. Cross-file wiring (scripts assume the engine)

Scripts name other files and objects. The dump does **not** include a
resolved graph.

Examples you must join yourself:

- `"jenix.5"` → `PUP/_JENIX/AUDIO/texts.csv` + `jenix.5.wav`
- `runpuppet ("jenix.pup")` → `PUP/_JENIX/`
- `sendtostage (spotmovie ("apothpig.mov"))` → `MOV/_APOTHPIG/`
- `actorstar (…, "town.extra" @ …)` → CST extra + SET waypoint / star
- `Scene A2` in `scenes.json` → `Scene A2.txt` **only if** that tile
  had a real `code` container (blocked tiles often have none)

**Fill this with:** a small index (or code) that maps those strings to
`out/` paths. Do not invent missing files.

### 3. Native plugins (not in script)

`WIN31/DUST/PLUGINS/CHECKERS.DLL` exists. Scripts call:

```
plugin ("writestats", "gblw")                          # boot
move = pluginfx ("checkmove", mainboard, count, 0)     # checkers
```

Checkers (and possibly fight / saloon / scorpion) **rules may live in
the DLL**, not in FLT/PRP text. The scripts only show when the plugin
is invoked and which strings/boards are passed.

**Fill this with:** play, or disassemble the DLL. Do not reconstruct
legal checkers moves from `playcheckers.txt` alone.

### 4. Presentation the scripts never describe

| Missing | Why it matters |
|---|---|
| How a 6-frame SET transition is **timed** / blended | Outdoor walker: 5 motion @ ~24 fps, then dest HQ immediately. Dust delayed HQ ~500 ms. Exact `DF.EXE` tick not proven. See [`src/world/set/README.md`](../../src/world/set/README.md). |
| MOV reel playback (rate + audio cues) | Holds, A/B mixer, framebuffer, palettes recovered from `MOVPLAY` (see §4a). B playlist wrap after last entry is the leftover. |
| How stills are **stored at runtime** | Dump is paletted PNG (old RGBA dump was ~115 MB town). Dust’s SET is ~60 MB of 8-bit deltas into one 135 KB buffer. Do not assume 1.7 GB (all frames as RGBA textures). HTTP-per-PNG + 80-texture LRU is what the walker does now. |
| Z-buffers | **Decoded.** Trailing RLE after SET color stills. Offsets are from the Z table start (first offset = `height*2`). `python cli.py --z` writes `FRAMES/z/*.png`. Default dump does not write them. |
| MOV click-row masks (mostly empty `0x28` fills) | Inspectable cursor polish only — see session notes |
| Face `animLogic` | **Proven.** Container of 82-byte / 60 Hz keyframes (`durationTicks` long). Slot 0 = Jaw/Head/Eyes/… table index (`-1` hide). Dump: `AUDIO/visemes.json`. Last tick/60 matches the WAV. |
| UI chrome (bevel art, inventory layout) | **Main play HUD** is `FLT/_NEW/frame_3.png` (512×384, white top = world hole, leather bar + map + portrait in the bottom 120). HOUSE.PRP has `avatar` (day/nite faces), `inven day` / `inven time`, `map day` / `map time`, bevels. Sprite `pos_x`/`pos_y` are in `sprites.json`. **Cursors** from `DF.EXE`: `dustdecompile --rsrc` → `dustdecompile/out/rsrc/cursors/{touch,arrow,goleft,goright,gostrait,watch}.cur`. |
| Day/night: `_TOWN` vs `_NITE` pairing | Same 225-cell / 52-camera graph; remake swaps still folders on **N**. Day-change movies (`D2MD2A`, …) not wired. |
| Camera / FOV / 512×264 vs 512×384 | Scripts use raw `pointx` numbers. Outdoor stills are 512×264. |

**Fill this with:** assets + play. Scripts tell you *that* a walk
happens, not the frame rate.

### 4a. MOV playback (holds + mixer recovered from `MOVPLAY.EXE`)

There are **no DreamFactory scripts inside** INTRO / INTRO2 / INTRO3.
Boot: `playmovie ("intro.mov")` then `playmovie ("intro2.mov")`. INTRO3
is not named in scripts. Spotmovies (`dog1.mov`, `apothpig.mov`, …) use
the **same** v1 table; `spotmovie` in `new.flt` is just `playmovie` plus
fades.

**Still timing and audio cues are in the file + `MOVPLAY.EXE`, not 14 fps.**
Full writeup:
[`dustdecompile/docs/findings.md`](../../dustdecompile/docs/findings.md) §7.
Layout: [file-types.md](file-types.md) (MOV).

- Tick = `timeGetTime() * 3 / 50` = **60 Hz**.
- 80-byte records at header **+2242**. Hold =
  `max(dword header+0x26, dword record+2)`.
- **Group A** (`u16 +0x1A`): voice slots. Start when `record+32` equals
  the 1-based slot. Retrigger restarts that slot (does not stack).
  A new scene that would overlap the previous scene’s still-playing A
  line is **held** until that line’s original end (INTRO 325 vs 423).
- **Group B** (`u16 +0x1C`): theme playlist at `+0x83E`. Sequential, one
  channel. A later scene with `n_b=0` keeps the bed running.
- Stills are **deltas into one framebuffer**. Scene headers are not
  images. Skip them without clearing prior (INTRO still 461 is a delta
  from the previous scene; clearing prior punched 300 black pixels).
- Each scene header has its own palette at **`+0x3E`**. RGB/PNG must
  use that palette; container 0’s colors make later shots look like
  residuals.
- Three intros: **162 s** of picture. SALUP stairs **1.7 s**. Overlays
  like `DOG1` ~1 s.

`--video` is **opt-in** (`python cli.py` does not mux). With the flag it
writes `timeline.json` plus `movie.mp4` at 60 fps for **every** MOV that
has stills (intros, overlays, inspectables, `INFO/`). Mixed 384/264
(TIPRE) is letterboxed; odd sizes (NITEWARN) pad even for x264. Do not
use constant 14 fps for new muxes.

Leftover: whether the B playlist **wraps** after the last `+0x83E`
entry (`header+0x8BE`). The extract is close, not proven 1-to-1 with a
capture of original `MOVPLAY`.

### 5. Types, `me`, and values

- Integers in the dump are unsigned in the decoder; `-1` is the `minus`
  token plus `1` (we pretty-print `(-1)`).
- Strings vs bare names: `"jenix.5"` vs `jenixphase` vs `me`.
- `true` / `false` / `me` / `target` are opcodes, not variables.
- Globals persist. Declaration names are in `out/catalog.json`
  (`globals`). Save files are `*.rtd`; none in this install.

**Fill this with:** a save from the original game if you need
bit-identical state. Do not invent the `.rtd` layout.

### 6. Extractor holes (do not treat as game content)

- `cmd_NNNN` if it appears
- `MOVIES/ZUNUSED/` — not DreamFactory
- Occasional SET/MOV right-edge artifact
- `FRAMES/_unnamed/` under PRP — table did not name that container
- Stale `out/_JENIX` (no `PUP/` prefix) — ignore
- Titanic-only opcodes in `opcodes.py` that Dust never calls

---

## Suggested agent workflow

1. Read [output-catalog.md](output-catalog.md).  
2. Load scripts as **data**. Prefer `*.json` token streams (Dust names)
   over pretty-printed `.txt` (Titanic 4.0 names).  
3. Resolve `"….wav"` / `"….mov"` / `"….pup"` / scene names via
   `out/catalog.json`. Fail loudly on misses.  
4. Keep an **opcode book** you update when a verb’s meaning is proven.
   Do not invent.  
5. Treat `plugin` / `pluginfx` as FFI, not as script.  
6. Play-verify: Jenix money, one interior door, checkers, one death,
   day change. Those hit the common gaps.

The extract plus `dustdecompile --rsrc` is enough to start a TypeScript
VM. Remaining engine holes (`delay` units, `.rtd` layout, checkers
search, viseme mapping) get filled while implementing verbs, not as a
pre-req to 100% of `DF.EXE`.
