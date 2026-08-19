# Reconstruction gaps (for agents and humans)

This is **not** an extraction guide. It lists what the dump already
gives you versus what you still have to define, guess, or verify by
playing Dust / reading `DF.EXE`.

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
| `SET|MOV|FLT|CST|PUP|PRP` PNGs | What that view / sprite looked like |
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

**Fill this with:** an opcode handbook (even incomplete), derived from
`DF.EXE`, play, and the call sites. Highest-value verbs first:

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
| `savegame` / `opengame` / `dumpglobal` | Save format we have not specified |

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
| How a 6-frame SET transition is **timed** / blended | Outdoor walker is filled: 5 motion @ ~12 fps, then dest HQ immediately. Dust delayed HQ ~500 ms. Exact `DF.EXE` tick not proven. See [`src/world/set/README.md`](../../src/world/set/README.md). |
| Z-buffers (parsed, not written) | Sprite occlusion against stills |
| MOV click-row masks (mostly empty `0x28` fills) | Inspectable cursor polish only — see session notes |
| Face `animLogic` (integer on each PUP line, not exported) | Mouth / viseme sync |
| UI chrome (bevel art, inventory layout, cursors) | `setcursor ("touch")` does not include the bitmap |
| Day/night: `_TOWN` vs `_NITE` pairing | Same 225-cell / 52-camera graph; remake swaps still folders on **N**. Day-change movies (`D2MD2A`, …) not wired. |
| Camera / FOV / 512×264 vs 512×384 | Scripts use raw `pointx` numbers. Outdoor stills are 512×264. |

**Fill this with:** assets + play. Scripts tell you *that* a walk
happens, not the frame rate.

### 5. Types, `me`, and values

- Integers in the dump are unsigned in the decoder; `-1` is the `minus`
  token plus `1` (we pretty-print `(-1)`).
- Strings vs bare names: `"jenix.5"` vs `jenixphase` vs `me`.
- `true` / `false` / `me` / `target` are opcodes, not variables.
- Globals persist; we have not listed the full global set or save
  layout. `savegame` / `opengame` exist in the opcode list.

**Fill this with:** a pass over all `global` declarations plus a save
from the original game if you need bit-identical state.

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
2. Load scripts as **data** (control flow + call names + literals).  
3. Resolve `"….wav"` / `"….mov"` / `"….pup"` / scene names via the
   catalog. Fail loudly on misses.  
4. Keep an **opcode book** you update when a verb’s meaning is proven.
   Do not invent.  
5. Treat `plugin` / `pluginfx` as FFI, not as script.  
6. Play-verify: Jenix money, one interior door, checkers, one death,
   day change. Those hit the common gaps.

The extract is enough to rebuild Dust **if** you fill the verb book,
the file graph, and the plugins. It is not enough if you only “understand
the code” from the `.txt` files.
