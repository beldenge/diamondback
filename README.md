# Diamondback

Browser rebuild of *Dust: A Tale of the Wired West*, plus a DreamFactory extractor.

Non-commercial fan reconstruction. Not a port of CyberFlix’s engine C. Playable client is Three.js. Game logic will run extracted DreamFactory tokens in a TypeScript VM. https://diamondback.town is a title chooser: **Dust: Resurrected**, **Dust: Unlocked**, and **The Picture Show**.

Hosted: **https://diamondback.town** (GitHub Pages + CloudFront extract).

## Cheat sheet

Repo root unless a `cd` is shown. Need Node 22+ for the client, Python 3.11+ for the tools, and a Dust tree at `sources/dust.dbgl/` to extract.

### Play locally

Needs `dfextract/out/SET/_TOWN` (and `_NITE` plus interiors you walk into).

```
npm install
npm test
npm run dev
```

Open http://localhost:5173 — title chooser (three cards). Cards switch in-page; they do not reload the document. Vite serves stills from `dfextract/out/` at `/extract/…`.

**Dust: Resurrected** (`/?mode=resurrected`): the VM game (Day 1 night through Day 5 endings). Original dashboard, CST sprites, PUP talking-heads. Skull HUD is the extracted `score` flat (Save / Open / Quit / Credits). Saves live in the browser (`localStorage`) and download a `.rtd` JSON; Open can import that file. `/?mode=resurrected&continue=1` restores the latest slot. Needs a full extract (PUP/CST/FLT/PRP, not just SET stills). Boot skips intros unless `&intro=1`. Playback notes: [`src/play/README.md`](src/play/README.md).

**Dust: Unlocked** (`/?mode=unlocked`): same PlayGame / VM as Resurrected, sandbox policy. Empty of story casts, every door open (`debugging`), minigame NPCs (Leroy at the range, Bolivar at the store, Dell at D7, Kid at G6, saloon blackjack/poker tables), farm animals including horses (not the dog). Bank sign cracks the safe; apoth bottles open compounding. `N` day/night; `?clock=1|2|3`. Afternoon by default so shops and tables are up. Needs the same full extract as Resurrected (PUP/CST/FLT/PRP, not just SET stills).

**The Picture Show** (`/?mode=movies`): extracted `playmovie` reels in the browser (not `movplay.py`). Opening is selected first. `/?mode=movies&reel=intro3` picks another. Not INVEN inspectables or stairs. **Underground** is the Yunni cave payoffs (fountain, skeleton, snake, flute, chest, tumble). **Coming attractions** lists the CD `INFO/` attract reels (Jump Raven, Lunicus, Skull Cracker, Titanic).

| Key / click | Action |
|---|---|
| **← →** or **A / D** | Turn |
| **↑** or **W** | Walk one filmed block |
| **N** | Day ↔ night stills (sandbox only; does not change the day number) |
| Click left / right / top of the picture | Turn or walk |
| Click a door, then walk forward | Open (if allowed) and go inside |
| Click a nearby person (play mode) | Talk (puppet + choices) |
| Click the skull (play mode) | Original menu: Save, Open, Quit, Credits, keys, volume |
| **C** (play mode) | Hide / show the black speech bar (audio keeps going) |

`/?mode=unlocked&clock=1|2|3` — morning / afternoon / night (Unlocked only).

Production-style local build (`preview` still mounts `/extract` from `dfextract/out/`):

```
npm run build
npm run preview
```

### Extract assets

First-time setup (venv, PATH, wipe `out/`): [`dfextract/README.md`](dfextract/README.md). Default dump is scripts + audio + frames + SET Z planes (play needs `FRAMES/z/`). **`--video` is opt-in** (ffmpeg).

```
cd dfextract
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python cli.py
```

macOS / Linux: `source .venv/bin/activate` and `python3`. From repo root you can also `python -m dfextract`.

| Command | What it does |
|---|---|
| `python cli.py` | Full dump → `dfextract/out/` (~minutes, several GB) |
| `python cli.py --scripts --type boot` | Smoke test: `out/BOOT/_BOOTFILE/Script 1.txt` |
| `python cli.py --type set` | SET stills / graphs only (what the town walker needs) |
| `python cli.py --type mov --video` | MOV `movie.mp4` (needs ffmpeg) |
| `python cli.py --jobs 1` | One file at a time |
| `Remove-Item -Recurse -Force .\out` then `python cli.py` | Clean re-extract |

Output is gitignored and **generated**. Never hand-edit `dfextract/out/`
(or `dustdecompile/out/`). Fix `dfextract/` / `dustdecompile/` and
re-run, or fix `src/` if the dump is already faithful. Catalog:
[`dfextract/docs/output-catalog.md`](dfextract/docs/output-catalog.md).

### Movie player (no ffmpeg)

Needs a dump with MOV `FRAMES/` + `timeline.json` (default extract). `pygame-ce` is in `dfextract/requirements.txt`.

```
cd dfextract
python movplay.py out/MOV/_INTRO --scale 2
python movplay.py out/MOV/_DOG1
```

Esc or Q quits, Space pauses. `--scale 1` is native 512×264. `--video` muxes `movie.mp4` if you would rather open that in a normal player.

### Engine decompile

Reads `DF.EXE` / `MOVPLAY.EXE` / plugins. Not used by the browser client.

```
python -m dustdecompile
```

Output: `dustdecompile/out/` (gitignored), including `out/rsrc/cursors/`
from `DF.EXE`. Details: [`dustdecompile/README.md`](dustdecompile/README.md).

### Tests

```
npm test
cd dfextract && python -m unittest discover -s tests -v
cd dustdecompile && python -m unittest discover -s tests -v
```

Python tests need `sources/dust.dbgl/` (and `dfextract/out/` for some decompile cases).

### Hosted site

| Piece | Where |
|---|---|
| JS / HTML | GitHub Pages at **https://diamondback.town** |
| Stills / WAV / SET JSON | CloudFront `https://d3en1dc3mw7cky.cloudfront.net` (S3, uploaded once) |
| CI | `.github/workflows/pages.yml` — `main` pushes that touch `src/`, Vite, or `package.json` |

Repo variable **`VITE_EXTRACT_BASE`** must be the CloudFront origin (no trailing slash). Local `npm run dev` ignores it and keeps using `/extract`.

Pages **Source** must be **GitHub Actions**. Markdown and Python (`dfextract/`, `dustdecompile/`) do not trigger a deploy. **Actions → Deploy Pages → Run workflow** forces one. After a client change, push `main`; you do not re-upload S3 unless the extract itself changed.

If the canvas is blank on the live site: CloudFront CORS (GET/HEAD, `Access-Control-Allow-Origin` `*` or the Pages origin) or a key-prefix mismatch (`SET/…` vs `extract/SET/…`).

## Not in git

Original CD / DOSBox tree, extracted PNG/WAV, and `dfextract` / `dustdecompile` output stay on disk (copyrighted; too large for GitHub). CloudFront serves the extract the hosted chooser needs; the CD stays local.

## Spec

Decisions, slices, and the asset pipeline: [`SPEC.md`](SPEC.md). How the
town stills play (strips, HQ, 20 Hz flipbook, doors):
[`src/world/set/README.md`](src/world/set/README.md). Extract still
codec and palette: [`dfextract/docs/images.md`](dfextract/docs/images.md).
Extractor from scratch: [`dfextract/README.md`](dfextract/README.md).
Engine binaries: [`dustdecompile/docs/findings.md`](dustdecompile/docs/findings.md).
