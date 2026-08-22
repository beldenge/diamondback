# Diamondback — Dust rebuild spec

## 1. Vision & Intent
**Diamondback** is this project: a non-commercial reconstruction of *Dust: A Tale of the Wired West* (CyberFlix, 1995) that runs fully in the browser, plus `dfextract` (a Dust-only DreamFactory extractor). The playable client is Three.js. This is not a remaster of visuals; it is not mrxstudios’ Unreal *Dust Remastered*.

## 2. Non-Goals & Constraints
- This won't be a port of the engine itself, so we will have freedom in *how* it's built.
- We won't upscale visuals or audio at this time.
- This will not be released commercially.
- Interpret extracted DreamFactory **tokens** at runtime (TypeScript VM). Do not hand-port 541 scripts into JSON graphs. Do not port `DF.EXE` C.
- `https://diamondback.town` stays the unlocked town-sandbox walker forever. The full game lives on a different route / URL.
- Do not build save/load in the first VM slice (format is `*.rtd`, still unknown).

## 3. Tech Stack & Principles
- **TypeScript + Vite + Vitest** for the app and unit tests.
- Standard HTML and CSS for game menus (later slices).
- Three.js for all gameplay.
- Save state will eventually live in `localStorage` with export/import. **Deferred** — not in slice 1.
- Original extracted PNG frames and WAV dialogue/SFX may be loaded as-is in the browser client (no upscale). Outdoor town is first rebuilt as original SET stills (tile + facing). A later toggle will free-roam the **same** SET graph (255 units/tile), not a second hand-authored map.

## 4. High-Level Architecture
Hybrid: modern free-roam first-person 3D over the original’s tile/scene + scripted-interaction model.

| System | Role | Slice 1 |
|---|---|---|
| **World** | Authoritative SET graph (tiles, facings, transitions, doors, waypoints). Stills mode walks that graph and blits 512×264 frames. Free-roam later uses the same coordinates. | Outdoor TOWN/NITE stills + street-level interiors (click door, walk in). |
| **Player / input** | Stills: arrow / WASD / click on the 512×264 plate. | Yes |
| **Time / quest** | Discrete clock like the original: `day`, `clock` (time-of-day slot), `phase`. Advances on **sleep or scripted events only**, not a continuous sun timer. Street stills follow the slot (`_TOWN` / `_NITE`). | Yes — clock + day/night stills; sleep/event hook (no stills sleep UI yet); no full quest graph |
| **Entities / NPCs** | Transform, schedule, memory flags, dialogue tree ref, sprite or mesh. | No |
| **Dialogue** | Hand-authored JSON graphs (Speak / Choice / Condition / Action). Character memory persists. First ports: Jones + Help. | No |
| **Inventory** | Pick up, examine, use on world/NPC. Cash is first-class. | No |
| **Minigames / puzzles** | Self-contained scenes (cards, checkers, gunfights, mine). | No |
| **Save / menus** | `localStorage` + export/import; HTML title/pause. | No |

Suggested later `src/` layout (from the developer handbook): `core/`, `world/`, `entities/`, `dialogue/`, `inventory/`, `minigames/`, `puzzles/`, `assets/`, `ui/`, `utils/`.

## 5. Core Data Schemas
To be written as TypeScript interfaces when the code lands. Expected first types:

- **GlobalState** — `day`, `clock`, `phase`, later: inventory, cash, flags, ending path.
- **NPC / Character** — id, placement, schedule, memory, dialogue graph id.
- **DialogueNode** — Speak / Choice / Condition / Action (slice 2).
- **Item**, **QuestFlag**, **PuzzleState** — slice 3+.

Original boot defaults (from extracted `_BOOTFILE`): `day = 1`, `clock = 2`, `phase = 1`.

## 6. Prioritized Vertical Slices / Epics
1. **Outdoor stills walker** — `/`. TOWN + NITE from extract; 225-cell table, 52 filmed tiles; spawn O7 north. Street doors: click to open (if the lock says so), walk forward into the interior SET. Same graph is a later free-roam mode’s source of truth. Playback rules: [`src/world/set/README.md`](src/world/set/README.md). The inferred graybox (`?mode=free`) was removed.
2. **Script VM + boot + puppets** — interpret extracted tokens; Jones/Help/Jenix are the first play-verify characters, not a hand-port.
3. **Inventory + early Day 1 progression** — bone/dog, lodging, cash path (blackjack later if needed).
4. *(TBD)*

## 7. Content & Asset Pipeline
- Original CD-ROM / DOSBox install: `sources/dust.dbgl/dosroot/0/dust/`
  (`DUSTCD/` + `WIN31/DUST/`). Required to extract. The remake does not
  read these binaries at runtime.
- **Extractor (current):** `dfextract/` — Dust-only Python CLI.
  From-scratch setup (install Python, Pillow, run, wipe `out/`):
  [`dfextract/README.md`](dfextract/README.md).
  After `python cli.py`, assets land in `dfextract/out/`
  (`PUP/`, `SET/`, `CST/`, `SND/`, `FLT/`, `PRP/`, `MOV/`, `BOOT/`).
  What each file is: [`dfextract/docs/output-catalog.md`](dfextract/docs/output-catalog.md).
  What a remake agent still has to invent (opcode meaning, plugins,
  file graph): [`dfextract/docs/reconstruction-gaps.md`](dfextract/docs/reconstruction-gaps.md).
- **Engine decompile (current):** `dustdecompile/` — PE/NE inventory, `DF.EXE` opcode table, plugin surface. Isolated from `src/`. Does not run in the browser. Pipeline: [`dustdecompile/docs/pipeline.md`](dustdecompile/docs/pipeline.md).
- Extracted today (full dump): 39 puppets, 35 SETs (grids, waypoints,
  transitions, stills, scene scripts), 4 CSTs, 40 SND banks, 20 FLT
  puzzles, 14 PRP packs, 247 MOV dests, boot script. SET/`TOWN` layout
  is no longer “binary-only.”
- Static docs: `sources/generated-docs/`
- Mac manual (box + install booklet): `sources/Dust_A_Tale_of_the_Wired_West_Manual_Mac_EN.pdf` — local only, not in git.
- Web: mrxstudios reverse-engineering blogs
- Official Strategy Guide: **not in hand** — scanning/OCR still TBD. Use extracted scripts + walkthroughs until then.
- In-game screenshots; later Blender MCP for meshes from prompts + screenshots.

**Do not commit** the CD/DOSBox tree, extracted media, or `dfextract/out/` (or `out-backup/`). They are copyrighted and too large for GitHub. `.gitignore` already excludes them. Clone + this spec + `dfextract` source is enough to rebuild a dump if you have the game.

A **town-sandbox subset** of the extract (street + interior SETs, house-door PRP, `SND/_UNILIB`) is hosted on CloudFront so https://diamondback.town can play. The CD and the full dump stay local. JS/HTML is GitHub Pages; stills are not in git.

The remake interprets extracted DreamFactory **token JSON** at runtime
(§2). `.txt` dumps stay the human-readable reference (Titanic 4.0
names). PNG/WAV the browser may load as-is.

**Layout:** SET grids/waypoints/door scripts live under `out/SET/_TOWN/`
and `_NITE/` (225 scenes, 15×15, 52 filmed tiles). Default stills mode
reads `scenes.json` + `transitions.json` + `FRAMES/{frame0}_{offset}.png`.
Early dumps only had rows G–O (129 scenes); the extractor now keeps the
full A–O table.

## 8. Agent Working Agreements
- Document decisions and pertinent details as we progress (this file, especially §10).
- Unit tests for logic (time, state, later dialogue/inventory). Higher-level (integration / browser) tests come later — do not block slices on them.
- Keep changes scoped to the current slice. Do not add save, menus, or dialogue until that slice.

## 9. Current Status & Next Actions
Default run is the outdoor stills walker on the SET graph (TOWN/NITE).

- `npm test` — unit tests (time, SET graph / HQ lookup, doors)
- `npm run dev` — http://localhost:5173 (needs `dfextract/out/SET/_TOWN` + `_NITE`)
- Hosted: https://diamondback.town (Pages). Stills from CloudFront via `VITE_EXTRACT_BASE`. Local `/extract` is unchanged.
- Command cheat sheet: [`README.md`](README.md).
- Spawn: Scene O7 facing north. **N** swaps day/night stills; does not change `day`.
- Sleep has no stills UI yet (hotel bed later). Clock is discrete; `sleep()` still wakes next morning.
- Debug query: `?clock=1|2|3`.
- How strips, HQ, G11, flipbook (~24 fps, no skip, no input queue), loader, and doors work: [`src/world/set/README.md`](src/world/set/README.md).
- CST/PRP world→still (X, Y, scale, Z, pans) is **locked**: [`src/play/README.md`](src/play/README.md) § World → still. Do not revive 1/z Y/scale/Z or frozen/screen-lerped pans.
- Still codec / palette / sizes: [`dfextract/docs/images.md`](dfextract/docs/images.md) (`255` white, cream index 2 skull, negative look, `_TOWN` vs `_NITE`).
- Sandbox: every door is unlocked. Facades live on the north–south road (I7 apoth, H7 saloon/stage, E7 hotel/doctor, …) plus H4 paper, G1 caretaker, F10 livery, I10 mayor. Click opens (click again closes); walk forward enters. Nested: mission classroom, Rodham inner office, saloon/hotel/mansion rooms.
- Extractor setup: [`dfextract/README.md`](dfextract/README.md). The remake does not run that tool.
- npm package / repo name: `diamondback`.

**Next:** Play mode at `/?mode=play` runs extracted `boot()` / `advanceday()` for Day 1 night (Leroy, dog, Help, Jones, hotel/saloon casts, jug/bone, night FX, shooting stars, locked shops, spot-movies). Widen remaining interiors (blackjack, rooms, Dell fight, sleep). Town walker at `/` (diamondback.town) stays the sandbox. Do not inpaint remaining still holes.

## 10. Decision Log

| Date | Decision |
|---|---|
| 2026-08-17 | Not a DreamFactory port. No visual/audio upscale. Non-commercial. |
| 2026-08-17 | Stack: TypeScript + Vite + Vitest. HTML/CSS menus later. Three.js for gameplay. |
| 2026-08-17 | Slice 1 look: graybox Diamondback, somewhat recognizable. SET extract / decompile if layout is insufficient. |
| 2026-08-17 | Movement: modern free-roam FPS (pointer-lock + WASD + click-to-interact). Not original tile/scene walking. |
| 2026-08-17 | Browser client may load extracted PNG/WAV as-is. Town is rebuilt, not original SET/MOV backgrounds. |
| 2026-08-17 | Dialogue: hand-port 2–3 characters to JSON. First pair: Jones + Help. No DF script interpreter. |
| 2026-08-17 | Time: advances on sleep or scripted events only, like the original. Lighting follows the discrete clock. |
| 2026-08-17 | Save/export and menus deferred past slice 1. |
| 2026-08-17 | Tests: unit tests now; higher-level tests later. |
| 2026-08-17 | Strategy guide not available yet. |
| 2026-08-17 | Slice 1 shipped: graybox town from walkthrough/SET names/box art. Clock 1/2/3 = Morning/Afternoon/Night. Sleep → next morning. No SET parse yet. |
| 2026-08-18 | Dust-only extractor at `dfextract/` is the asset pipeline. |
| 2026-08-18 | Extract covers all playable Dust types including SET/FLT/PRP/MOV v1 (39 PUPs, town/night grids). Remake still hand-ports scripts; see `dfextract/docs/reconstruction-gaps.md`. |
| 2026-08-18 | Graybox still inferred. SET JSON exists for a later layout pass. |
| 2026-08-18 | Project name: **Diamondback**. Extractor stays `dfextract`. GitHub blurb: “Browser rebuild of Dust: A Tale of the Wired West, plus a DreamFactory extractor.” |
| 2026-08-18 | Do not publish original game binaries or extract output. Mac manual stays local. |
| 2026-08-18 | `dfextract/` is the Dust extractor. DFET output is not kept or used as a test oracle. |
| 2026-08-18 | Extractor lives at repo-root `dfextract/` (moved off `tools/`). |
| 2026-08-18 | Outdoor world: original SET stills first; later free-roam toggle shares the same SET graph (255 units/tile). This pass is town day + night only; interiors later. |
| 2026-08-18 | SET grid reader takes the longest well-formed table. TOWN/NITE/TARGET are 225 scenes (A–O), not the 129-cell G–O suffix. |
| 2026-08-18 | Default play mode is SET stills (tile + facing). Graybox lives at `?mode=free`. |
| 2026-08-18 | Walk strips: play 5 motion frames, then the *landing* pose HQ. Container `+5` is the *from* HQ on walks — playing it snaps you back. |
| 2026-08-18 | Standing HQ = outgoing walk `+5`, else clockwise/right-turn `+5` (G11 dead-end). A turn that *ends* here is the other facing’s from-still. |
| 2026-08-18 | Town spawn is O7 facing north (south gate). |
| 2026-08-18 | Show landing HQ immediately (Dust delayed ~500 ms). Queue one input while busy; hold-to-repeat after a step. |
| 2026-08-20 | HQ delay restored to 500 ms on the last LQ frame; dest HQ after that. Input is not blocked during the wait — a new step cancels the HQ swap. |
| 2026-08-18 | Texture loader: max 3 inflight, current strip high-priority. Uncapped prefetch froze input after idle. |
| 2026-08-18 | SET frames are `FRAMES/{frame0}_{offset}.png`. Container IDs overlap (O7→N7 walk and an N7 turn both use 1640). Decode each strip from a clean prior. |
| 2026-08-19 | Remaining skip-holes (O7 north ox skull) stay as extracted. NITE is a different film, not a prior for TOWN. Do not invent filler. |
| 2026-08-19 | Interiors: click Dust `pointin*` door boxes, overlay HOUSE door sprites, walk forward to `gotointerior` / `gototown`. Hand-ported in `doors.ts`. Do not run DF scripts. Nested rooms later. |
| 2026-08-19 | Nested rooms: mission C3 N → school / nitescho, school A2 W → padre, doctor1 B1 W → doctor2. Street facades (not script tiles): I10 E mayor gate, H4 W paper (The Rattler), G1 S caretaker (Sidewinder), F10 E livery. Skip `maygate.mov`. |
| 2026-08-20 | Saloon / hotel / mansion inner rooms. Stairs auto-walk (skip `salup`/`hotup`/`mayup` movies). Shared bedrooms return to the caller pose, facing away. |
| 2026-08-20 | Skip door overlays that are black-box extracts (court/school/padre) or the wrong door (hotel, paper, undertak, chin). Open is sound + walk-in. |
| 2026-08-19 | Sandbox: all doors unlocked. Facade poses are I7/H7/E7/F7/L7/D7 on the north–south road, not G-row street views. |
| 2026-08-19 | Opposite facades: L7 jail/chin, E7 hotel/doctor, H7 saloon/stage. Exit onto the enter tile facing away from the door. Close WAV plays on walk-in. |
| 2026-08-19 | Indexed stills force palette 255 to white (DFET/VGA). Stored 255 is (0,0,0); that was the black ox skull. Bone body is index 2 cream. Day-only blue on glass/posters is sky index 116 / unused 0. |
| 2026-08-19 | Stills input: ignore taps while busy (no queue); hold-to-repeat after the step. Extract `/extract` is `no-store`. |
| 2026-08-19 | Flipbook at ~24 fps (was ~12). One frame per interval, never skip; wait if a PNG is not ready. First motion frame paints on the keypress. |
| 2026-08-19 | Removed graybox `?mode=free` (inferred AABBs, pointer-lock, hotel-bed sleep). Play is stills only. Later free-roam will share this SET graph, not a second map. |
| 2026-08-19 | MOV reels (`playmovie` / intros / INFO) can extract to `movie.mp4` at 14 fps (`--video`, needs ffmpeg). SET walks and inspectables stay PNG. Audio not muxed. |
| 2026-08-19 | MOV `--video` mixes overlapping `clip_<n>` WAVs onto the still timeline (start at stills-before / 14 s) into `movie.mp4`. |
| 2026-08-19 | That mux is experimental and wrong on playback (opening beds stacked at 0:00; local fps uneven). Findings: [`dfextract/docs/reconstruction-gaps.md`](dfextract/docs/reconstruction-gaps.md) §4a. |
| 2026-08-19 | `dustdecompile/` started: recover engine structure from `DF.EXE` / `MOVPLAY.EXE` / `CHECKERS.DLL` toward TypeScript. Isolated like `dfextract`. Not a Ghidra→TS transpiler. SPEC §2 (not a DF port / no script interpreter) still stands until we decide otherwise. |
| 2026-08-20 | Opcode/library handbook: Dust vs Titanic names, engine hooks, `new.flt` (`spotmovie`/`gototown` are library not opcodes), high-value verb meanings from scripts. `dustdecompile/docs/handbook.md`. |
| 2026-08-20 | Wrote `dustdecompile/docs/findings.md`: PE/NE hashes, packed 6-byte opcode table recovery, Dust vs Titanic aliases, plugin `PlugProc`/`checkmove`, working dialogue/click/path/travel protocols. |
| 2026-08-20 | MOV timing: MOVPLAY `timeGetTime()*3/50` = 60 Hz; 80-byte frame records at header+0x8C2; hold=max(header+0x26, rec+2). `--video` uses that instead of 14 fps. Three intros ~162 s. |
| 2026-08-20 | MOV mixer from MOVPLAY: group A cued by record+32 (retrigger restarts that slot); group B sequential playlist at header+0x83E (n_b=0 keeps the bed). Stills are deltas into one framebuffer; skip scene headers without clearing prior. |
| 2026-08-20 | MOV scene palettes: each scene header loads 256 colors at +0x3E. `--video` / FRAMES use the current scene palette; container 0’s palette made later INTRO shots look like residuals. |
| 2026-08-20 | MOV extract: `--video` is opt-in (not in a default `python cli.py`). Encodes every MOV with stills (overlays like `DOG1`, inspectables, `INFO/`), not only `playmovie` reels. Cross-scene group-A hold so a new scene does not stack on the previous line (INTRO 325 vs 423). TIPRE 384/264 letterboxed; NITEWARN odd size padded even. |
| 2026-08-20 | Hosted town sandbox: GitHub Pages (https://diamondback.town) for JS; S3 + CloudFront (`d3en1dc3mw7cky.cloudfront.net`) for an allowlisted extract. `VITE_EXTRACT_BASE` is a repository Actions variable. CI does not upload stills. Public unlisted URL is an explicit override of “do not publish extract output” for this subset only. |
| 2026-08-20 | Full game uses a TypeScript Dust-script VM (extracted tokens), not hand-ported JSON. diamondback.town stays walker-only forever. |
| 2026-08-20 | Extract holes closed this pass: PUP `animLogic` in `texts.csv`; script `*.json` AST (Dust names); `out/catalog.json`; SET Z-plane decode (`--z`); `DF.EXE` cursors/menu/strings via `dustdecompile --rsrc`; save filter is `*.rtd`. |
| 2026-08-21 | Play mode uses Dust’s 512×384 stage: SET stills 512×264 on top, `FLT/_NEW/frame_3.png` HUD below (not an overlay). CST `actordeg` 0=south, 8 stand / 64 walk frames. Talk runs `walktopuppet`. PUP layers composite from `FRAMES/sprites.json`; jaw cycles while speech plays. Sprite `pos_x`/`pos_y` dumped. |
| 2026-08-21 | Play speech is Web Audio + `decodePcmWav` (8-bit 11025 Hz). Firefox/Windows ~10s after first `AudioContext.resume()` before output; visemes are wall-clock, not the audio playhead. `<audio>` does not play these WAVs (`currentTime` stays 0). Notes: [`src/play/README.md`](src/play/README.md). |
| 2026-08-21 | Play puppets are generic: all 11 PUP face tables including hands, skip missing parts, per-PUP `sprites.json` / visemes / `scripts.json`. |
| 2026-08-21 | CST foot blobs are contact shadows (GANG index 131 maroon → translucent black). Not studio dirt. Skip unused/black (Help robe index 0); body pixels of the matte stay opaque. |
| 2026-08-22 | `dog1.mov` is a 59-tick overlay. Two A1 cues 100 ms apart stack the same 0.88 s growl; play two sequential passes (one growl each) instead of overlapping. |
| 2026-08-22 | `walktopuppet` locks clicks, keys, and HUD until the script returns (`cursor ("watch")` + blocking `forceupdate`). Dust does not nest mousedown during that walk. |
| 2026-08-22 | Documented remaining `DF.EXE` projector/filmstrip traces in [`dustdecompile/docs/findings.md`](dustdecompile/docs/findings.md) §7a (BSS, dest-rect, engine sprite Z `>> 6`, `0x40eae0` facing 1=N, play vs EXE). |
| 2026-08-22 | Actor Z may pull one SET plane closer for ground under the hotspot (Help). Do not `min` with a foreground wall — that put Leroy through buildings on the range road. |
| 2026-08-22 | SET filmstrip camera traced at DF.EXE `0x40dd90` (walk `index*64`, turn `index*16`). Play still freezes in-place-turn yaw. Engine pinhole Y hid the N7 jug and walked Leroy down the still — play Y stays 1/z / SET Z. |
| 2026-08-22 | Filmstrip sprites: walk `t = index/4`; in-place pans screen-lerp standing 1/z stills (do not freeze frame 0, do not yaw 1/z Y). Draw after the still advances; hold the previous plate while the next PNG loads. |
| 2026-08-22 | Dest HQ is the last plate of the play strip. Pans stretch t across motion+HQ so dest 1/z lands on dest HQ (last turn LQ is a different take). Walks keep last-LQ t=1 (same camera as dest HQ). |
| 2026-08-22 | Play Y and dest size are DF.EXE `0x40dcd0` / `0x415271`: pinhole Y `132−310*(z−62)/forward`, scale `actorscale*field/(1000*forward)` (GANG field 114, INVEN 96). 1/z Y was wrong for same-tile ground — N7 E original jug sits on the HUD (hotspot 279), not mid-fence. Pans yaw `index*16` and reproject. |
| 2026-08-22 | **Supersedes** earlier 08-22 rows that freeze pans, screen-lerp 1/z, or keep 1/z Y/Z. Locked book: [`src/play/README.md`](src/play/README.md) § World → still. Sprite Z is EXE `>> 6` (1/z Z hid the N7 E jug). Screenshots: `N7_east_original.png` / `N7_east_ours.png` / `N7_east_ours_next.png`. |
| 2026-08-22 | CST and PRP share DF.EXE `0x40dcd0` for **X**. Engine Y is the same function; play does not use it for placement. |
| 2026-08-21 | PUP paint order is Body then Head (beard is on the Head). Body-over-Head left a static beard ring that did not turn. |
| 2026-08-21 | Dialog chrome: full-width black speech bar over the still; five `butbevel` slots replace the HUD (not overlays above it). |
| 2026-08-21 | Choice boxes are HOUSE `butbevel` + GDI Arial, not OS buttons. Labels left-aligned. Hole fill is the rim’s `(111,56,38)`. |
| 2026-08-21 | CST town sprites blit from the header hotspot (256, 192), not bbox feet/center. Screen **X** is a pinhole (`256 + 256 * right / forward`); **Y and scale** are `256/(256+forward)`. |
| 2026-08-21 | PUP text is Mac Roman (apostrophe 0xD5). `forceupdate` is the only actor clock during script walks. Town approach faces `currentdeg+128`. |
| 2026-08-21 | CST town sprites: `stdscale(town)=1450`, Leroy sign `actorscale 1100`, 1/z as `256/(256+forward)`. Native ~200px is camera-plane 1:1. Actor layer is the still, under the HUD. |
| 2026-08-21 | SET 50-byte waypoints hold two stars. `town.leroy1` is slot B of `town.leroy2` at (1740, 3536). Do not invent star xyz. |
| 2026-08-21 | Leroy idle/drink/pivot is `leroyidle` via `makeloop`, not a remake fidget. Talk walk faces `playerxyz` (`walktopuppet`). |
| 2026-08-21 | O7 east does not show the south-gate actor (`\|right\| > forward`). 1/z X had planted him on the fence. Near plane **248** keeps the sign hotspot in Z=5 so SET Z does not clip his feet. |
| 2026-08-21 | Named `walktostar` uses the SET 52-tile walk graph (Dust never calls `walkonroad`). Play BFS, then the star; first snap is a walk edge, not N7’s center. Dest `town.leroy2` (2656, 2720) is authored; hop algorithm is remake. |
| 2026-08-21 | Walk is EXE-backed: `actorspeed` units per 60 Hz tick (town 3), CST pose table at setInfo +0x2e (Leroy 16 slots, two ticks/pose), named `walktostar` follows the SET polyline at waypoint +0x18 (leroy1→2 reverses container 262). Not BFS and not `speed*24`. |
| 2026-08-22 | Play first evening is the extracted boot, not a Leroy-only slice. Town script names are column-letter (`scene g15` = filmed O7). `passcode` inherits scene→set / actor→cast only — not stage `mousedown`. Night FX, shootingstar, extra animals, PRP items/doors, and spot-movies run from those scripts. Sandbox unlocked doors stay on `/` only. |
| 2026-08-22 | Walk *rate* is 20 Hz, not 60. `timeGetTime*3/50` is a 60 Hz counter; the frame loop waits `framerate` (boot 3) of those ticks (`0x40e1d2`). `actorspeed` 3 → 60 units/s. Pose table and CST draw share that game frame. |
| 2026-08-22 | Walk contracts apply to every CST actor and SET: `stdspeed` from `stdactor`, polyline from that SET’s `paths.json`, pose table from that cast’s `timing.json`. Play loads GANG + EXTRA at boot; `opencastfile` loads target/mine. |
| 2026-08-21 | Play **C** hides the black speech bar (audio/visemes keep going). |
| 2026-08-21 | CST screen X is DF.EXE `0x40dcd0`: focal **310**, tile **256**, lens set back **64** (SET +24). O7 N Leroy still-x **354** (original midline 353). Do not use 255/tile or focal 256. Y/scale stay 1/z from the feet so Z=5 does not clip. How we found it, three cameras, dead ends: [`src/play/README.md`](src/play/README.md) § World → still. Binary: [`dustdecompile/docs/findings.md`](dustdecompile/docs/findings.md) §7a. |
