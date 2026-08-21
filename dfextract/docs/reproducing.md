# Reproducing the extract

**From a machine with no Python:** follow
[the tool README](../README.md#run-from-scratch-clone--extract)
(install Python 3.11+, confirm `sources/dust.dbgl/`, venv, `cli.py`).
This page is the inventory, flags, tests, and expected scale.

## What you need

- Windows, macOS, or Linux
- Python 3.11+ (3.14 was used here) — install steps in the README
- Python deps (`pip install -r dfextract/requirements.txt`: Pillow, pygame-ce)
- The Dust CD / DOSBox install already in this repo:

```
sources/dust.dbgl/dosroot/0/dust/DUSTCD/     # CD data
sources/dust.dbgl/dosroot/0/dust/WIN31/DUST/ # installed BOOTFILE, DF.EXE, LOCAL copies
```

Optional reference (not required to run the tool):

- `D:\dev\DFET` — M3tox/DFET source (sibling clone)

## Inventory we extract

Default scan finds **411** paths. All little-endian. Dust engine version
inside container 0 is **1** (Titanic is 4).

| Type | Count | Where |
|---|---|---|
| BOOTFILE | 1 | `WIN31/DUST/BOOTFILE` |
| PUP | 39 | `DUSTCD/PUPPETS`, `SALGAMES`, `KID`, `UNDER` |
| CST | 4 unique | `EXTRA`, `GANG`, `TARGET`, `MINE` (CD preferred over `LOCAL`) |
| SND | 40 | `DATA`, minigames, `UNDER`, etc. |
| SET | 35 | `DATA` plus a few under minigame folders |
| FLT | 20 | puzzles / minigames |
| PRP | 14 | props / inventory / minigames |
| MOV | 258 | `MOVIES`, `INVEN`, `INFO`, `YUNNIBOX`, `ZUNUSED` |

`LOCAL` copies of the same stem are skipped; the CD copy wins.

## Run it

From `dfextract/`:

```
pip install -r requirements.txt
python cli.py
```

No flags means **scripts + audio + frames** (all types) from the Dust
tree above. **`--video` is opt-in** (ffmpeg) and is not in a default
run. Output defaults to `out/` next to `cli.py`.

Flags only **narrow** the run:

```
python cli.py --scripts
python cli.py --audio --frames
python cli.py --type mov --video
python cli.py --type pup,set
python cli.py --scripts --type pup path\to\JENIX.PUP
python cli.py path\to\DUSTCD -o D:\tmp\dust-out
```

| Argument | Effect |
|---|---|
| *(none)* | All types, scripts + audio + frames. **No** `movie.mp4`. |
| `--scripts` / `--audio` / `--frames` / `--video` | Only those kinds (any one of them turns the others off). `--video` is opt-in and needs `ffmpeg`. |
| `--type pup,set,flt,prp,mov,cst,snd,boot` | Only those suffixes |
| paths | Only these files or directories |
| `-o DIR` | Output root |
| `-j N` / `--jobs N` | Parallel file workers. `0` = auto. `1` = serial. |

A file is a Dust container if bytes `32:40` are `LPPALPPA`. Files that
fail that check (the 11 items in `MOVIES/ZUNUSED/`) are skipped, not
treated as hard errors.

Media is always overwritten (PNG and WAV). Re-run after a decode or
palette change; delete `out/` only if you want a clean tree. `python cli.py
-j 1` forces one file at a time.

## Output layout

Namespaced by type so `TOWN.SET` and `TOWN.SND` do not collide:

```
out/PUP/_JENIX/day1.txt
out/PUP/_JENIX/AUDIO/texts.csv
out/PUP/_JENIX/AUDIO/jenix.5.wav
out/PUP/_JENIX/FRAMES/Jaw/frame_41.png
out/BOOT/_BOOTFILE/Script 1.txt
out/CST/_EXTRA/Jenix/Script.txt
out/CST/_EXTRA/Jenix/stand/frame_195.png
out/SND/_TOWN/anvil.wav
out/SET/_APOTH/scenes.json
out/SET/_APOTH/waypoints.json
out/SET/_APOTH/transitions.json
out/SET/_APOTH/Boot Script.txt
out/SET/_APOTH/Scene A2.txt
out/SET/_APOTH/FRAMES/45_0.png
out/FLT/_CHECKERS/playcheckers.txt
out/FLT/_CHECKERS/frame_3.png
out/PRP/_INVEN/props.json
out/PRP/_INVEN/FRAMES/Bone/small/00_c3.png
out/MOV/_INTRO/FRAMES/frame_40.png
out/MOV/_INTRO/AUDIO/clip_1.wav
```

## Tests

```
python tests/test_cli.py
python tests/test_pup_scripts.py
python tests/test_known_types.py
python tests/test_frames.py
python tests/test_remaining.py
```

These assume the Dust CD tree is present. Checks include:

- Bolivar PUP scripts are `Boot Script`, `DAY1`, `checkers vo`
- Bolivar `FRAMES/Background/frame_4.png` decodes at 512×264
- EXTRA.CST has Jenix `code resetactor ()` and writes `stand/frame_195.png`
- TOWN.SND decodes `anvil` at 22050 Hz
- APOTH.SET grid is the 3×3 from the mrxstudios blog
- TOWN/NITE/TARGET grids are 225 cells (A–O), not the 129-cell G–O suffix
- SET stills are `{frame0}_{offset}.png` (O7→N7 walk and an N7 turn both use 1640)
- Palette 255 is white on stills (O7 skull); L7 west→north wall is not sky
- NITEFOUN.MOV and APOTH container 45 decode to 512×264 stills

## Expected scale of a full run

A complete `python cli.py` (scripts + audio + frames) produces roughly:

| Artifact | Count (this repo, 2026-08-20) |
|---|---|
| Script `.txt` | ~655 |
| Dialogue CSV | 78 (one per PUP that has lines, plus leftovers) |
| WAV | ~4,300 (PUP speech + SND + MOV clips) |
| PNG | ~33,000 (SET + MOV + sprites) |
| SET JSON | 105 (`scenes` / `waypoints` / `transitions` × 35) |
| `movie.mp4` | **0** unless you pass `--video` (**247** then: all `LPPALPPA` MOVs) |

TOWN.SET and NITE.SET write **3,155** stills each (`{frame0}_{offset}.png`).
INTRO3.MOV wrote 1,475 frames. Budget disk accordingly; a full dump is
usually a couple of minutes on a multi-core machine (`--video` adds
under a minute). Why, and what we timed: [performance.md](performance.md).
Each `OK` line prints that file’s extract time; `Done.` is wall-clock.
