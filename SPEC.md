# Diamondback — Dust rebuild spec

## 1. Vision & Intent
**Diamondback** is this project: a non-commercial reconstruction of *Dust: A Tale of the Wired West* (CyberFlix, 1995) that runs fully in the browser, plus `dfextract` (a Dust-only DreamFactory extractor). The playable client is Three.js. This is not a remaster of visuals; it is not mrxstudios’ Unreal *Dust Remastered*.

## 2. Non-Goals & Constraints
- This won't be a port of the engine itself, so we will have freedom in *how* it's built.
- We won't upscale visuals or audio at this time.
- This will not be released commercially.
- Do not interpret original DreamFactory scripts at runtime. Hand-port dialogue into our own JSON graphs (starting with 2–3 characters).
- Do not build save/load or HTML game menus in the first implementation slice.

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
| **World** | Authoritative SET graph (tiles, facings, transitions, doors, waypoints). Stills mode walks that graph and blits 512×264 frames. Free-roam later uses the same coordinates. | Outdoor TOWN/NITE stills + street-level interiors (click door, walk in). Graybox at `?mode=free`. |
| **Player / input** | Stills: arrow / WASD / click on the 512×264 plate. Free-roam: pointer-lock look + WASD + raycast. | Yes |
| **Time / quest** | Discrete clock like the original: `day`, `clock` (time-of-day slot), `phase`. Advances on **sleep or scripted events only**, not a continuous sun timer. Lighting follows the current slot. | Yes — clock + lighting; sleep/event hook; no full quest graph |
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
1. **Graybox town + free-roam + event-driven day/night** — shipped as `?mode=free`. Layout is still inferred; not SET-backed.
1b. **Outdoor stills walker** — default `/`. TOWN + NITE from extract; 225-cell table, 52 filmed tiles; spawn O7 north. Street doors: click to open (if the lock says so), walk forward into the interior SET. Same graph is the free-roam toggle’s future source of truth. Playback rules: [`src/world/set/README.md`](src/world/set/README.md).
2. **Puppet system + Jones + Help + memory flags** — hand-ported JSON dialogue; extracted face/body frames + WAV.
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

The remake still **hand-ports** dialogue and does **not** interpret
DreamFactory `.txt` at runtime (§2). The extract is the reference for
that port, plus PNG/WAV the browser may load as-is.

**Layout:** SET grids/waypoints/door scripts live under `out/SET/_TOWN/`
and `_NITE/` (225 scenes, 15×15, 52 filmed tiles). Default stills mode
reads `scenes.json` + `transitions.json` + `FRAMES/{frame0}_{offset}.png`.
Graybox (`?mode=free`) still uses inferred AABBs. Early dumps only had
rows G–O (129 scenes); the extractor now keeps the full A–O table.

## 8. Agent Working Agreements
- Document decisions and pertinent details as we progress (this file, especially §10).
- Unit tests for logic (time, state, later dialogue/inventory). Higher-level (integration / browser) tests come later — do not block slices on them.
- Keep changes scoped to the current slice. Do not add save, menus, or dialogue until that slice.

## 9. Current Status & Next Actions
Default run is the outdoor stills walker on the SET graph (TOWN/NITE).
Graybox is `?mode=free` only.

- `npm test` — unit tests (time, SET graph / HQ lookup, layout, collision)
- `npm run dev` — http://localhost:5173 (needs `dfextract/out/SET/_TOWN` + `_NITE`)
- Spawn: Scene O7 facing north. **N** swaps day/night stills; does not change `day`.
- Sleep exists only in graybox: hotel bed north of the saloon. Clock is discrete; sleep always wakes next morning.
- Debug query: `?clock=1|2|3`. Free-roam also has `?view=street` or `?view=hotel`.
- How strips, HQ, G11, flipbook (~24 fps, no skip, no input queue), loader, and doors work: [`src/world/set/README.md`](src/world/set/README.md).
- Still codec / palette / sizes: [`dfextract/docs/images.md`](dfextract/docs/images.md) (`255` white, cream index 2 skull, negative look, `_TOWN` vs `_NITE`).
- Sandbox: every door is unlocked. Facades live on the north–south road (I7 apoth, H7 saloon/stage, E7 hotel/doctor, …). Click opens (click again closes); walk forward enters.
- Extractor setup: [`dfextract/README.md`](dfextract/README.md). The remake does not run that tool.
- npm package / repo name: `diamondback`.

**Next:** nested interior doors (hotel stairs, rooms), then Jones/Help. Do not inpaint remaining still holes.

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
| 2026-08-18 | Texture loader: max 3 inflight, current strip high-priority. Uncapped prefetch froze input after idle. |
| 2026-08-18 | SET frames are `FRAMES/{frame0}_{offset}.png`. Container IDs overlap (O7→N7 walk and an N7 turn both use 1640). Decode each strip from a clean prior. |
| 2026-08-19 | Remaining skip-holes (O7 north ox skull) stay as extracted. NITE is a different film, not a prior for TOWN. Do not invent filler. |
| 2026-08-19 | Interiors: click Dust `pointin*` door boxes, overlay HOUSE door sprites, walk forward to `gotointerior` / `gototown`. Hand-ported in `doors.ts`. Do not run DF scripts. Nested rooms later. |
| 2026-08-19 | Sandbox: all doors unlocked. Facade poses are I7/H7/E7/F7/L7/D7 on the north–south road, not G-row street views. |
| 2026-08-19 | Opposite facades: L7 jail/chin, E7 hotel/doctor, H7 saloon/stage. Exit onto the enter facing. Close WAV plays on walk-in. |
| 2026-08-19 | Indexed stills force palette 255 to white (DFET/VGA). Stored 255 is (0,0,0); that was the black ox skull. Bone body is index 2 cream. Day-only blue on glass/posters is sky index 116 / unused 0. |
| 2026-08-19 | Stills input: ignore taps while busy (no queue); hold-to-repeat after the step. Extract `/extract` is `no-store`. |
| 2026-08-19 | Flipbook at ~24 fps (was ~12). One frame per interval, never skip; wait if a PNG is not ready. First motion frame paints on the keypress. |
