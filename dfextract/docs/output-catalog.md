# Output catalog

Where extracted Dust assets live, what each file **is**, and how to
find the thing you want. Root is `../out/` after
`python cli.py`.

This tree is **generated**. Never patch files here to make the remake
look right. If a decode is wrong, change `dfextract/` and re-extract.
If the dump matches Dust and the remake does not, change `src/`.

Canonical layout:

```
out/<TYPE>/_<STEM>/…
```

`<TYPE>` is `BOOT`, `PUP`, `CST`, `SND`, `SET`, `FLT`, `PRP`, or `MOV`.
`<STEM>` is the source filename without extension, uppercased
(`JENIX.PUP` → `PUP/_JENIX`). That split exists so `TOWN.SET` and
`TOWN.SND` never share a folder.

Ignore leftover top-level `out/_JENIX`, `out/_BOLIVAR`, … from the
first PUP-only runs. Those are stale. Use `out/PUP/_JENIX`.

---

## If you need X, look here

| You want | Path |
|---|---|
| Character dialogue text + line IDs | `PUP/_<NAME>/AUDIO/texts.csv` |
| Character spoken audio | `PUP/_<NAME>/AUDIO/<ident>.wav` |
| Character conversation logic | `PUP/_<NAME>/*.txt` (`day1`, `Boot Script`, …) |
| Character face / mouth sprites | `PUP/_<NAME>/FRAMES/<Part>/frame_<id>.png` plus `FRAMES/sprites.json` (512×384 `x,y,w,h`) |
| In-world body / walk sprites | `CST/_GANG/…` named people; `CST/_EXTRA/…` extras; `CST/_GANG/sprites.json` for placement + frame lists |
| Play HUD chrome | `FLT/_NEW/frame_3.png` (512×384 dashboard). HOUSE `avatar` at (460, 325): `nitefaces` / `dayfaces` from NEW.FLT `mainpanel` `noface` |
| Location map + hotspots | `SET/_<PLACE>/scenes.json` |
| NPC / item stand points | `SET/_<PLACE>/waypoints.json` |
| NPC walk polylines | `SET/_<PLACE>/paths.json` |
| Walk / turn filmstrips | `SET/_<PLACE>/transitions.json` + `FRAMES/<frame0>_<offset>.png` |
| Door / click logic for a tile | `SET/_<PLACE>/Scene A2.txt` (name from `scenes.json`) |
| Town / night outdoor map | `SET/_TOWN`, `SET/_NITE` |
| Puzzle UI + logic | `FLT/_<PUZZLE>/` scripts + `frame_*.png` |
| Inventory / world props, **named** | `PRP/_INVEN/FRAMES/<Item>/<state>/` and `props.json` |
| House / door / random town props | `PRP/_HOUSE/FRAMES/` |
| Cutscene / inspectable stills | `MOV/_<NAME>/FRAMES/frame_<n>.png` |
| Cutscene voice / SFX | `MOV/_<NAME>/AUDIO/clip_<n>.wav` |
| Ambient / one-shot world audio | `SND/_<BANK>/<clip>.wav` |
| Game boot / paths / globals | `BOOT/_BOOTFILE/Script 1.txt` |
| File graph + globals + line ids | `catalog.json` (rebuild: `python cli.py --catalog`) |
| Script token AST (Dust names) | same stem as each `.txt`, `*.json` |
| Cursor bitmaps | `dustdecompile/out/rsrc/cursors/` (not this dump) |

---

## Counts on this tree (2026-08-18, after full dump)

| Folder | Assets | Typical contents |
|---|---|---|
| `BOOT/` | 1 | Boot script |
| `PUP/` | 39 | Scripts, `texts.csv`, speech WAVs, face PNGs |
| `CST/` | 4 | `_EXTRA`, `_GANG`, `_TARGET`, `_MINE` |
| `SND/` | 40 | Named WAVs + looped beds (`town.snd.wav`) |
| `SET/` | 35 | JSON + scripts + walk stills |
| `FLT/` | 20 | Puzzle scripts + HUD/board stills |
| `PRP/` | 14 | `initprop` scripts, `props.json`, named sprites |
| `MOV/` | 247 dests | Stills + optional `AUDIO/` (11 `ZUNUSED` skipped) |

---

## Per-type file meanings

### `BOOT/_BOOTFILE/`

| File | What it is |
|---|---|
| `Script 1.txt` | DreamFactory boot: search paths, `day` / `clock`, CD checks, startup |

### `PUP/_<CHAR>/`

| File | What it is |
|---|---|
| `Boot Script.txt`, `day1.txt`, `day2.txt`, … | Conversation / AI scripts. Name comes from the PUP script table |
| same names with `.json` | Token AST (Dust opcode names). `.txt` still prints Titanic 4.0 names |
| `AUDIO/texts.csv` | Columns: `ID`, `container`, `Identifier`, `Text`, `animLogic`. `Identifier` is unique **inside this PUP** (`jenix.5`, plus engine slots `idle 1`–`idle 4` in every character). `Text` is the spoken line (idle tags are `blink` / `idlespeak`, not subtitles); `container` is the WAV’s container index; `animLogic` is the per-line viseme/anim integer |
| `AUDIO/visemes/<ident>.json` | Per-line 60 Hz face/hand keyframes for **this** PUP. Play must key `folder/ident` — `idle 1.json` is a different track in `_LEROY` vs `_HELP1`. Do not parse `visemes.json`. |
| `FRAMES/sprites.json` | Layer placement plus `rest` / `restLayers` from **this** PUP’s idle-1 viseme frame |
| `scripts.json` | Script filenames in this PUP (`Boot Script.json`, `day1.json`, …) |
| `AUDIO/<Identifier>.wav` | Speech for that line (8-bit or 16-bit mono PCM) |
| `FRAMES/Background/frame_<id>.png` | Backdrop plate for the talking head |
| `FRAMES/Body`, `Head`, `Eyes`, `Eyebrows`, `Nose`, `Jaw`, `Left`, `Right`, `Hands 1`, `Hands 2` | Face-part sprites. `<id>` is the source container index. Missing folders means that part has `count == 0` |

Puppet folder names (39): `_BLOOD`, `_BOLIVAR`, `_BUICK`, `_COBB`, `_DEAD`, `_DELL1`, `_DELL2`, `_DOC`, `_FEAR`, `_FLIPPO`, `_GUS`, `_HELP1`, `_HELP2`, `_ISAO`, `_JAN`, `_JENIX`, `_JONES`, `_KID`, `_LAUREL`, `_LEROY`, `_MARIE`, `_MAYOR`, `_MEZ`, `_MWIFE`, `_NED`, `_OONA`, `_PETE`, `_QUIST`, `_ROBBER`, `_RUBY`, `_SHAMAN`, `_SIDE`, `_SONOMA`, `_SOPHIE`, `_TELLER`, `_TODD`, `_TROTTER`, `_WATSON`, `_ZEB`.

`_JAN` `_MEZ` `_PETE` `_ZEB` are saloon dealers (`SALGAMES`). `_SHAMAN` is under `UNDER/`. `_KID` is `KID/KID.PUP`.

### `CST/_<CAST>/`

| File | What it is |
|---|---|
| `<Actor>/Script.txt` | In-world actor logic (`setupactor`, `mousedown`, schedules). Leroy `setupactor("sign")` does `stdactor` then `actorscale (me, 1100)`. |
| `Cast.txt` | Cast library: `initactors`, `runpuppet`, `walktopuppet`, `stdactor`, `stdscale` (town **1450**, interiors 2400–5800), `hotdist` (town **384**) |
| `timing.json` | CST setInfo +0x2e pose tables per actor per `actorpose` (GANG 8-pose walk = 16 slots; EXTRA pig walk = 4) |
| `sprites.json` | Per-actor stand/walk placement (`x,y,w,h`) on the 512×384 stage, plus CST `pose` (+8) and `deg` (+0x28) |
| `<Actor>/<anim>/frame_<id>.png` | Body sprites. Foot blobs are contact shadows (translucent black), not maroon studio dirt. Black clothing (Help's robe) stays opaque. |

`_EXTRA` = animals / Jenix beggar / bounty / kidgang. `_GANG` = named townspeople. `_TARGET` = shooting-gallery marks. `_MINE` = mine extras.

### `SND/_<BANK>/`

| File | What it is |
|---|---|
| `<clip>.wav` | Named one-shot (`anvil.wav`) |
| `<bank>.snd.wav` or similar | Looped bed stitched from the playlist (e.g. `town.snd.wav`) |

No scripts. Folder stem matches the `.SND` file (`TOWN.SND` → `_TOWN`).

### `SET/_<PLACE>/`

| File | What it is |
|---|---|
| `scenes.json` | Grid tiles. Fields: `x`, `y`, `interact` (hotspot), `blocked`, `unknown_c`, `unknown_e`, `name` (`Scene A2`), `script_container` |
| `waypoints.json` | Stand / walk-to points. Fields: `x`, `y` (absolute; 256 units per tile in `DF.EXE`), `name` (`drugs.watson1`). Both slots of each 50-byte SET record. |
| `paths.json` | Named `walktostar` polylines for **every** SET. Pair `a`/`b` plus `{x,y,z,seg}` hops from waypoint +0x18. Empty `[]` when the SET has no pairs. TOWN/NITE: 12 pairs (Leroy 262, blood 260, …). |
| `transitions.json` | One walk/turn filmstrip. Fields: `x_from`, `y_from`, `dir_from`, `x_to`, `y_to`, `dir_to`, `dir_*_name` (`N/S/E/W`), `frame0` (first of 6 stills) |
| `Boot Script.txt` | Set-level script (cursor defaults, etc.) if present |
| `<Scene name>.txt` | Per-tile script **only if** that container actually holds a `code` script (blocked tiles are often empty) |
| `FRAMES/<frame0>_<offset>.png` | 512×264 walk/turn still. One file per strip slot (`0`…`5`). Container IDs can overlap two strips, so we do **not** share `frame_<id>.png`. On walks, slot `5` is the **from**-pose HQ; the remake plays `0`–`4` then looks up the dest HQ separately ([`src/world/set/README.md`](../../src/world/set/README.md)). |
| `FRAMES/z/<frame0>_<offset>.png` | 8-bit grayscale depth plane for sprite occlusion (default dump). `--z` without `--frames` writes these without rewriting color stills. |

Important sets: `_TOWN` and `_NITE` (same 225-cell / 15×15 outdoor grid,
day/night; 52 walkable tiles), interiors `_APOTH`, `_BANK`, `_STORE`,
`_SALLOWER`, `_JAIL`, … `_HUB` is the underground Yunni maze. `_TARGET`
is the town grid with only the range tiles walkable.

### `FLT/_<PUZZLE>/`

| File | What it is |
|---|---|
| `<fn>.txt` | First script whose opening `code` is `<fn>` (`playcheckers.txt`, NEW `openflat.txt` = **mainpanel**) |
| `<fn>_<container>.txt` | Every script container (NEW has four `openflat`s — 2 mainpanel, 5 map, 8 avatar, 11 score) |
| `flats.json` | Named flats: `script` / `still` / `buttons` container ids, `stillFile`, `hits` (Mac button rects + script file) |
| `frame_<n>.png` | Board / HUD / page still. `<n>` is the source container index |

`_CHECKERS`, `_FIGHT`, `_SCORP`, `_SALGAMES`, `_HIST` (history book pages), `_DIARY`, `_DRUG`, `_HOTPLATE`, …

### `PRP/_<PACK>/`

| File | What it is |
|---|---|
| `props.json` | Manifest: `group`, `state`, `index`, `container`, `path` |
| `groups.json` | PRP group table: `name`, `logic` container, `script` (ObjectGroup +38) |
| `timing.json` | PRP setInfo +0x2e pose tables per group per `propview` (HOUSE `avatar` `nitehattip` is 26 slots) |
| `FRAMES/<Group>/<state>/<ii>_c<container>.png` | Named sprite. `group` = item (`Bone`, `Cigar`). `state` = `small` / `large` / `panel` / `hilite` / `king` / … |
| `FRAMES/_unnamed/frame_<n>.png` | Container the shop table did not name |
| `initprop_<n>.txt`, `setcursor _arg__<n>.txt` | Prop scripts. `<n>` is the container index |

Primary packs: `_INVEN` (carryable items), `_HOUSE` (doors, town dressing), `_CHECKERS` (pieces), `_SALGAMES`, `_SNAKE`, `_TUMBLE`.

### `MOV/_<NAME>/`

| File | What it is |
|---|---|
| `FRAMES/frame_<n>.png` | Cutscene, overlay, or inspectable still. `<n>` is container index (gaps are audio / scene headers). Composited onto the prior framebuffer; PNG `PLTE` is **that scene’s** palette (`+0x3E`). |
| `movie.mp4` | **Only with `--video`** (not a default `python cli.py`). H.264 + AAC at **60 fps**, stills duplicated per MOVPLAY hold. Group A on `record+32` (cross-scene A held so the previous line can finish); group B sequential playlist. Intros, overlays (`DOG1`, …), inspectables, `INFO/` previews. Mixed 384/264 letterboxed; odd sizes padded even. |
| `timeline.json` | When the v1 80-byte table parses and `--video` or `--frames` ran. `tick_hz` 60, per-still `hold_ticks` / `start_tick`, clips with `channel` (`A1`… / `B`). `python movplay.py <this folder>` uses it with `FRAMES/` + `AUDIO/` (no mp4). |
| `AUDIO/clip_<n>.wav` | Voice / SFX in that movie, same index space. Sidecars from `--audio`; `--video` also mixes them into `movie.mp4`. |
| `script_<n>.txt` | Rare; only if a container is a `code` script |

Inventory close-ups are `INVEN/*.MOV` → `_APPLE`, `_GUN`, `_BADGE`, …
Story/cutscene reels live under `MOVIES/` (`_INTRO`, `_INTRO3`,
`_FINALEND`, day-change `D2MD2A`, …). Spotmovie overlays (`_DOG1`,
`_APOTHPIG`, …) are the same layout, shorter. Attract previews are
`INFO/` (`_LUPRE`, `_TIPRE`, …).

`ZUNUSED` movies are **not** here (not `LPPALPPA`).

---

## JSON shapes (copy/paste)

`scenes.json` element:

```json
{
  "x": 1, "y": 0,
  "interact": 1, "unknown_c": 0,
  "blocked": 0, "unknown_e": 0,
  "name": "Scene A2",
  "script_container": 35
}
```

`waypoints.json` element:

```json
{ "x": 190, "y": 90, "name": "drugs.watson1" }
```

TOWN also has the second slot of a pair, e.g. `{ "x": 1740, "y": 3536, "name": "town.leroy1" }` (packed with `town.leroy2`).

`transitions.json` element:

```json
{
  "x_from": 0, "y_from": 1, "dir_from": 1,
  "x_to": 0, "y_to": 1, "dir_to": 3,
  "dir_from_name": "N", "dir_to_name": "E",
  "frame0": 45
}
```

Stills for that turn: `FRAMES/45_0.png` … `45_5.png`.

`props.json` element:

```json
{
  "group": "Bone",
  "state": "small",
  "index": 0,
  "container": 3,
  "path": "FRAMES/Bone/small/00_c3.png"
}
```

`texts.csv` header:

```
ID,container,Identifier,Text
```

---

## Scripts (all `*.txt`)

Every extracted script starts with:

```
// Extracted with dfextract — Dust-only Python port of DFET script decoding
```

Then DreamFactory source (`code`, `if`, `puppetspeak`, …). See
[scripts.md](scripts.md). Dialogue IDs inside scripts (`"jenix.5"`)
join to `AUDIO/texts.csv` and `AUDIO/jenix.5.wav`.
