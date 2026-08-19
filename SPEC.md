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
- Original extracted PNG frames and WAV dialogue/SFX may be loaded as-is in the browser client (no upscale). Town geometry is rebuilt (graybox now, later meshes), not projected from original SET/MOV backgrounds.

## 4. High-Level Architecture
Hybrid: modern free-roam first-person 3D over the original’s tile/scene + scripted-interaction model.

| System | Role | Slice 1 |
|---|---|---|
| **World** | Graybox Diamondback (streets + ~20 building shells). Walkable outdoors. SET grids/waypoints become the later source of truth for doors and spawn points. | Yes — recognizable layout as far as current sources allow |
| **Player / input** | Pointer-lock look + WASD + click-to-interact (raycast). | Yes |
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
1. **Graybox town + free-roam + event-driven day/night** — playable empty Diamondback; lighting tied to `clock`; time advances only via sleep or scripted events.
2. **Puppet system + Jones + Help + memory flags** — hand-ported JSON dialogue; extracted face/body frames + WAV.
3. **Inventory + early Day 1 progression** — bone/dog, lodging, cash path (blackjack later if needed).
4. *(TBD)*

## 7. Content & Asset Pipeline
- Original CD-ROM / DOSBox install: `sources/dust.dbgl/dosroot/0/dust/`
  (`DUSTCD/` + `WIN31/DUST/`). Required to extract. The remake does not
  read these binaries at runtime.
- **Extractor (current):** `tools/dfextract/` — Dust-only Python CLI.
  From-scratch setup (install Python, Pillow, run, wipe `out/`):
  [`tools/dfextract/README.md`](tools/dfextract/README.md).
  After `python cli.py`, assets land in `tools/dfextract/out/`
  (`PUP/`, `SET/`, `CST/`, `SND/`, `FLT/`, `PRP/`, `MOV/`, `BOOT/`).
  What each file is: [`tools/dfextract/docs/output-catalog.md`](tools/dfextract/docs/output-catalog.md).
  What a remake agent still has to invent (opcode meaning, plugins,
  file graph): [`tools/dfextract/docs/reconstruction-gaps.md`](tools/dfextract/docs/reconstruction-gaps.md).
- Extracted today (full dump): 39 puppets, 35 SETs (grids, waypoints,
  transitions, stills, scene scripts), 4 CSTs, 40 SND banks, 20 FLT
  puzzles, 14 PRP packs, 247 MOV dests, boot script. SET/`TOWN` layout
  is no longer “binary-only.”
- Static docs: `sources/generated-docs/`
- Mac manual (box + install booklet): `sources/Dust_A_Tale_of_the_Wired_West_Manual_Mac_EN.pdf` — local only, not in git.
- Web: mrxstudios reverse-engineering blogs
- Official Strategy Guide: **not in hand** — scanning/OCR still TBD. Use extracted scripts + walkthroughs until then.
- In-game screenshots; later Blender MCP for meshes from prompts + screenshots.

**Do not commit** the CD/DOSBox tree, extracted media, or `tools/dfextract/out/` (or `out-backup/`). They are copyrighted and too large for GitHub. `.gitignore` already excludes them. Clone + this spec + `dfextract` source is enough to rebuild a dump if you have the game.

The remake still **hand-ports** dialogue and does **not** interpret
DreamFactory `.txt` at runtime (§2). The extract is the reference for
that port, plus PNG/WAV the browser may load as-is.

**Layout:** SET grids/waypoints/door scripts are extracted under
`out/SET/_TOWN/` (and interiors). Slice 1’s graybox was built from
walkthrough + SET *names* + box art and has **not** been rewired to
those JSON files yet. Use the extract when the graybox is wrong, not
as a prerequisite to scaffolding.

## 8. Agent Working Agreements
- Document decisions and pertinent details as we progress (this file, especially §10).
- Unit tests for logic (time, state, later dialogue/inventory). Higher-level (integration / browser) tests come later — do not block slices on them.
- Keep changes scoped to the current slice. Do not add save, menus, or dialogue until that slice.

## 9. Current Status & Next Actions
Slice 1 is playable: Vite + TypeScript + Three.js + Vitest, graybox Diamondback, free-roam FPS, event-driven clock + lighting.

- `npm test` — unit tests (time, layout, collision, interact)
- `npm run dev` — http://localhost:5173
- Sleep: enter the hotel (north of the saloon, south door) and click the bed. Clock is discrete; sleep always wakes next morning.
- Debug query (not a menu): `?view=street` or `?view=hotel`, and `?clock=1|2|3`.
- Layout in the running app is still inferred (walkthrough + SET names + box-art aerial). `TOWN.SET` is now extracted (`tools/dfextract/out/SET/_TOWN/`) but the graybox does not read it yet.
- Extractor setup: [`tools/dfextract/README.md`](tools/dfextract/README.md). The remake does not run that tool.
- npm package / repo name: `diamondback`. The local folder may still be `dust-threejs` until renamed on disk.

**Next:** slice 2 — puppet system + Jones + Help, hand-ported JSON dialogue.

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
| 2026-08-18 | Dust-only extractor at `tools/dfextract/` is the asset pipeline. |
| 2026-08-18 | Extract covers all playable Dust types including SET/FLT/PRP/MOV v1 (39 PUPs, town/night grids). Remake still hand-ports scripts; see `tools/dfextract/docs/reconstruction-gaps.md`. |
| 2026-08-18 | Graybox still inferred. SET JSON exists for a later layout pass. |
| 2026-08-18 | Project name: **Diamondback**. Extractor stays `dfextract`. GitHub blurb: “Browser rebuild of Dust: A Tale of the Wired West, plus a DreamFactory extractor.” |
| 2026-08-18 | Do not publish original game binaries or extract output. Mac manual stays local. |
| 2026-08-18 | `tools/dfextract/` is the Dust extractor. DFET output is not kept or used as a test oracle. |
