# dfextract

Dust-only Python extractor for Cyberflix DreamFactory files.

This is a sidequest tool for the Three.js remake. It is **not** a Titanic
extractor. Script decoding and the PUP container layout are ported from
[M3tox/DFET](https://github.com/M3tox/DFET) (GPL-3.0). Keep this directory
isolated from the remake game code.

**Full writeup** (formats, offsets, inventory):
[`docs/README.md`](docs/README.md).

**Extracted-file map** (what lives under `out/`):
[`docs/output-catalog.md`](docs/output-catalog.md).

**Remake / agent gaps** (what the dump does not explain):
[`docs/reconstruction-gaps.md`](docs/reconstruction-gaps.md).

---

## Run from scratch (clone → extract)

You need a machine with a terminal, this repo, and the Dust game tree
already under `sources/dust.dbgl/` (see below). Nothing else is assumed.

### 1. Install Python 3.11 or newer

**Windows**

1. Download the installer from
   [python.org/downloads](https://www.python.org/downloads/).
2. Run it. On the first screen, check **Add python.exe to PATH**.
3. Choose **Install Now**. Close and reopen the terminal after it finishes.
4. Check that it worked:

```
python --version
```

You want `Python 3.11` or higher. If `python` opens the Microsoft Store
instead of printing a version, either:

- use the launcher: `py -3 --version`, and call `py -3` anywhere this
  README says `python`, or
- Settings → Apps → Advanced app settings → App execution aliases →
  turn off the `python.exe` / `python3.exe` stubs, then try again.

**macOS / Linux**

```
python3 --version
```

If that is missing or older than 3.11: install from
[python.org](https://www.python.org/downloads/), or
`brew install python` (macOS), or your distro’s `python3` + `python3-venv`
+ `python3-pip` packages. Use `python3` anywhere this README says `python`.

### 2. Confirm the game data is here

The tool does not download Dust. A default run looks for:

```
sources/dust.dbgl/dosroot/0/dust/DUSTCD/          # CD data (PUP, SET, MOV, …)
sources/dust.dbgl/dosroot/0/dust/WIN31/DUST/      # installed BOOTFILE, DF.EXE
```

Quick check (from the **repo root**):

```
dir sources\dust.dbgl\dosroot\0\dust\DUSTCD\PUPPETS\JENIX.PUP
dir sources\dust.dbgl\dosroot\0\dust\WIN31\DUST\BOOTFILE
```

On macOS / Linux, `ls` those same paths. If either file is missing, the
extract will fail with `No Dust game data found.` Put a DOSBox / CD copy
of Dust in that layout (or pass the folder as an argument; see Flags).

`sources/dust-extract/` is an old partial DFET dump used only as a test
oracle. You do not need it to extract.

### 3. Install Pillow and run

From the **repo root**:

```
cd tools\dfextract
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python cli.py
```

If `Activate.ps1` is blocked, skip activation and call the venv Python
directly:

```
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe cli.py
```

macOS / Linux (from the repo root):

```
cd tools/dfextract
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python cli.py
```

A venv is optional. `python -m pip install -r requirements.txt` into
your user site-packages also works; the only runtime dependency is
Pillow.

No flags means **everything**: all types, scripts + audio + frames, from
the Dust tree above. Output is `tools/dfextract/out/` (created if needed).

### 4. What a successful run looks like

The first line is on the order of:

```
Extracting scripts, audio, frames from 411 file(s) [boot, cst, flt, mov, prp, pup, set, snd]
Output: …\tools\dfextract\out
```

Then one `OK` line per file. Eleven `MOVIES/ZUNUSED/` files are skipped
(they are not DreamFactory). Exit code `0` is success.

Budget about **15 minutes** and **several GB** for a full run
(~640 scripts, ~4,300 WAVs, ~30,000 PNGs). `TOWN.SET` / `NITE.SET` and
`INTRO3.MOV` dominate.

Smoke test (boot script only, seconds):

```
python cli.py --scripts --type boot
```

Then open `out/BOOT/_BOOTFILE/Script 1.txt`.

---

## Wipe and re-extract

Yes. `out/` is generated. Deleting it and running `python cli.py` again
is the supported way to get a clean dump.

Existing **PNGs are not overwritten**, so a half-finished `out/` will
resume and keep old frames. For a true rebuild, delete first.

From `tools/dfextract/` (PowerShell):

```
Remove-Item -Recurse -Force .\out -ErrorAction SilentlyContinue
python cli.py
```

macOS / Linux: `rm -rf out && python cli.py`.

Safe to delete: `out/`. The remake does not load it.

Do **not** delete `sources/dust.dbgl/` (the game),
`sources/dust-extract/` (test goldens), or the Python files in this
directory.

---

## Flags

CLI only. Flags only **narrow** a default-everything run.

```
python cli.py
python cli.py --scripts
python cli.py --audio --frames
python cli.py --type pup,set
python cli.py --scripts --type pup path\to\JENIX.PUP
python cli.py path\to\DUSTCD -o D:\tmp\dust-out
```

| Argument | Effect |
|---|---|
| *(none)* | All types, all content kinds, from `sources/dust.dbgl` |
| `--scripts` / `--audio` / `--frames` | Only those kinds (any one of them turns the others off) |
| `--type pup,set,flt,prp,mov,cst,snd,boot` | Only those file types |
| paths | Only these files or directories |
| `-o DIR` | Output directory (default: `out/` next to `cli.py`) |

Unimplemented type/kind pairs are skipped and listed at the end.

Output is namespaced by type so `TOWN.SET` and `TOWN.SND` do not collide:

```
out/PUP/_JENIX/day1.txt
out/PUP/_JENIX/AUDIO/jenix.5.wav
out/PUP/_JENIX/FRAMES/Jaw/frame_41.png
out/BOOT/_BOOTFILE/Script 1.txt
out/CST/_EXTRA/Jenix/Script.txt
out/CST/_EXTRA/Jenix/stand/frame_195.png
out/SND/_TOWN/anvil.wav
out/SET/_APOTH/scenes.json
out/SET/_APOTH/Scene A2.txt
out/SET/_APOTH/FRAMES/frame_50.png
out/FLT/_CHECKERS/playcheckers.txt
out/MOV/_HOTLPIC1/FRAMES/frame_1.png
```

What each of those files *is*: [`docs/output-catalog.md`](docs/output-catalog.md).

---

## Tests

Need the Dust tree and `sources/dust-extract/` (DFET goldens):

```
python tests/test_cli.py
python tests/test_pup_scripts.py
python tests/test_known_types.py
python tests/test_frames.py
python tests/test_remaining.py
python tests/test_prp_names.py
```

More detail: [`docs/reproducing.md`](docs/reproducing.md).

---

## Current status

- [x] `LPPALPPA` container reader
- [x] script token decoder
- [x] `.PUP` scripts, dialogue, audio, face frames
- [x] `BOOTFILE` scripts
- [x] `.CST` scripts and actor sprites
- [x] `.SND` audio (Dust v1 ADPCM)
- [x] `.SET` scene grid, waypoints, transitions, scripts; SET/MOV still codec
- [x] `.FLT` puzzle scripts and stills
- [x] `.PRP` prop scripts and **named** sprites (`Bone/small`, …)
- [x] `.MOV` Dust v1 stills / cutscene frames / audio
- [x] Full SET/FLT/PRP/MOV dump
- [x] Previous-frame still decode (Yunni box open/close)
- [ ] Occasional SET/MOV right-edge artifact; `ZUNUSED` is not DF
