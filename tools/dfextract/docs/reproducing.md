# Reproducing the extract

**From a machine with no Python:** follow
[the tool README](../README.md#run-from-scratch-clone--extract)
(install Python 3.11+, confirm `sources/dust.dbgl/`, venv, `cli.py`).
This page is the inventory, flags, tests, and expected scale.

## What you need

- Windows, macOS, or Linux
- Python 3.11+ (3.14 was used here) — install steps in the README
- Pillow (`pip install -r tools/dfextract/requirements.txt`)
- The Dust CD / DOSBox install already in this repo:

```
sources/dust.dbgl/dosroot/0/dust/DUSTCD/     # CD data
sources/dust.dbgl/dosroot/0/dust/WIN31/DUST/ # installed BOOTFILE, DF.EXE, LOCAL copies
```

Optional reference trees (not required to run the tool):

- `D:\dev\DFET` — M3tox/DFET source (sibling clone)
- `sources/dust-extract/` — partial DFET 0.89 dump used as a golden corpus

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

From `tools/dfextract/`:

```
pip install -r requirements.txt
python cli.py
```

No flags means **everything**: all types, scripts + audio + frames, from
the Dust tree above. Output defaults to `tools/dfextract/out/`.

Flags only **narrow** the run:

```
python cli.py --scripts
python cli.py --audio --frames
python cli.py --type pup,set
python cli.py --scripts --type pup path\to\JENIX.PUP
python cli.py path\to\DUSTCD -o D:\tmp\dust-out
```

| Argument | Effect |
|---|---|
| *(none)* | All types, all kinds, default Dust roots |
| `--scripts` / `--audio` / `--frames` | Only those kinds (any one of them turns the others off) |
| `--type pup,set,flt,prp,mov,cst,snd,boot` | Only those suffixes |
| paths | Only these files or directories |
| `-o DIR` | Output root |

A file is a Dust container if bytes `32:40` are `LPPALPPA`. Files that
fail that check (the 11 items in `MOVIES/ZUNUSED/`) are skipped, not
treated as hard errors.

Frames that already exist as PNG are not rewritten, so you can resume a
killed run.

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
out/SET/_APOTH/FRAMES/frame_50.png
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

These assume the Dust CD and the DFET dump are present. Golden checks:

- Bolivar PUP scripts match `sources/dust-extract/_BOLIVAR/PUP/*.txt` (banner stripped)
- Bolivar `frame_4.png` pixels match DFET
- EXTRA.CST Jenix script and `stand/frame_195.png` match DFET
- TOWN.SND `anvil.wav` PCM matches DFET
- APOTH.SET grid is the 3×3 from the mrxstudios blog
- NITEFOUN.MOV and APOTH container 45 decode to 512×264 stills

## Expected scale of a full run

A complete `python cli.py` (scripts + audio + frames) produces roughly:

| Artifact | Count (this repo, 2026-08-18) |
|---|---|
| Script `.txt` | ~640 |
| Dialogue CSV | 78 (one per PUP that has lines, plus leftovers) |
| WAV | ~4,300 (PUP speech + SND + MOV clips) |
| PNG | ~30,000+ once SET/MOV stills are included |
| SET JSON | 105 (`scenes` / `waypoints` / `transitions` × 35) |

TOWN.SET and NITE.SET alone write 2,838 walk frames each. INTRO3.MOV
wrote 1,465 frames. Budget disk and time accordingly (the SET/MOV pass
was ~15 minutes here).
