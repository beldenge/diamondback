# Dust: A Tale of the Wired West

## Developer Handbook for In-Browser Rebuild with Three.js

This document is a practical technical reference for teams intending to recreate the 1995 CyberFlix adventure game *Dust: A Tale of the Wired West* as a modern browser-based experience using Three.js (and supporting web technologies). It synthesizes reverse-engineering findings, original engine analysis, gameplay systems, asset requirements, and recommended architecture. It is written for developers familiar with WebGL / Three.js, JavaScript/TypeScript, and game state management.

**Scope:** Architecture, core systems (navigation, dialogue, NPCs, inventory, time, puzzles, combat, minigames), asset pipeline, original file formats & RE tools, performance considerations, legal notes, and key external links. Not a full design document for every quest; use the official strategy guide + walkthroughs for exhaustive content data.

| | |
|---|---|
| **Original Engine** | CyberFlix DreamFactory (proprietary authoring + runtime) |
| **Core Challenge** | Real-time 3D town + independent NPCs with conversation memory + extensive branching dialogue + hybrid adventure/action |
| **Recommended Stack** | Three.js (r160+), TypeScript, Vite, Zustand/Redux or custom ECS, Howler.js / Three.Audio, Ink or custom dialogue graphs |
| **Key RE Resources** | mrxstudios blogs, DFET tool, DreamCatcher project, US Patent 5,729,669 |
| **Existing Fan Work** | mrxstudios Unreal Engine 5 remaster (ongoing); coordinate / respect non-commercial intent |

Compiled by Grok collaborative team (Grok lead + Harper, Benjamin, Lucas). Primary technical sources: mrxstudios reverse-engineering blogs, GitHub DFET & DreamCatcher, Cyberflix production notes, US Patent 5729669, community walkthroughs & strategy guide, VGHF archives.

Compiled August 2026.

---

## 1. Recommended High-Level Architecture

Treat the rebuild as a hybrid: free-roam first-person 3D exploration (modern player expectation) layered over the original tile/scene + scripted interaction model. Avoid pure node-based Myst style if possible; continuous movement feels better in 2026 browsers.

### Core Layers

- **Rendering (Three.js):** Scene graph for town geometry, sky/day-night, lights, character billboards or skinned meshes, particle FX for dust/gunsmoke. Use instancing for repeated props. Occlusion culling + LOD for performance.
- **World / Spatial:** Collision meshes derived from original SET grid + modern navmesh or simple AABB/capsule controller. Waypoints from original data become spawn/path points.
- **Entity / NPC System:** Each character has transform, schedule (day/night behaviors), memory state (conversation history flags), current animation state, dialogue tree reference.
- **Dialogue & Logic Engine:** Graph or tree of nodes (speak, choice, condition on global/local flags, inventory checks, trigger events). Original scripts map cleanly to this.
- **Game State / Quest / Time:** Global store holding day number, time-of-day, player inventory, cash, quest flags, character relationship/memory bits, ending path. Advance day on sleep or key events.
- **Input:** Pointer-lock FP look + WASD + click-to-interact (or raycast). Mobile: virtual sticks + tap.
- **Audio:** Spatial 3D for SFX, music beds per area/time, dialogue voice (Howler or native Audio + Web Audio spatialization).
- **UI Overlay:** HTML/CSS or Three.js CSS2D/3D for inventory, dialogue choices, HUD (cash, day, health if needed), save/load.

### Suggested Project Structure (Vite + TS)

```
src/
  core/        # Game loop, state machine, time system
  world/       # Town loading, collision, waypoints, day-night
  entities/    # Player, NPCs, props, cyberpuppet / avatar managers
  dialogue/    # Graph runner, Ink or custom JSON trees, memory flags
  inventory/   # Items, usage rules, combinable objects
  minigames/   # Poker, blackjack, checkers, shooting range, gunfights
  puzzles/     # Mine dials, flute, dagger, mask, crest logic
  assets/      # Loaders for models, sprites, audio, dialogue data
  ui/          # React/Vue or pure DOM overlays
  utils/       # Math, save serialization, RE data parsers
public/
  assets/      # Compressed textures, glTF, audio, dialogue JSON
```

## 2. Original DreamFactory Engine & Reverse-Engineering Resources

DreamFactory was a multimedia authoring system with a movie-set metaphor (SetConstruction, PropDepartment, CentralCasting, BlueScreen, etc.). Runtime (`DF.exe`) interpreted script blocks and handled sprite overlay with Z-depth. Characters were “cyberpuppets”: photographs of actors with limited mouth animation, rendered as sprites with Z-order against pre-rendered or 3D backgrounds. A key patent describes the Z-data system for real-time sprite clipping against movie frames.

### Key File Types (Windows version)

- **SET** — Locations / maps: HEADER (color LUT, grid of scenes with accessibility/interact flags, script IDs), SCRIPT blocks (boot + per-scene), WAYPOINTS (item/NPC positions), FRAMELIST + FRAME (compressed images for movement animation frames and orientations).
- **PUP** — Puppets / characters: dialogue lines (ID → text), scripts controlling speech, events, state changes.
- **CST** — Cast (3D character data / sprites + logic).
- **PRP** — Props (sprites / objects placed in world).
- **FLT** — Flat / puzzle logic files.
- **MOV** — Movie / animation / still sequences (no scripts).

### Script System (from mrxstudios RE)

Scripts are blocks containing Logic (8-byte instruction patterns) + Variable Lookup Table (Pascal strings). Flags interpret as: parameter variables, integers, variables, indentation, or keywords looked up from `DF.exe` (`puppetspeak`, `if`, `actorowner`, `puppetbevel`, etc.). Dialogue is referenced by ID from PUP files. Variables include globals such as `playercash`, phase flags per character, inventory-related state. Control flow supports if/endif, switch/case, function calls, assignments. This maps almost 1:1 to a modern dialogue/event graph.

### Essential Reverse-Engineering Links

- **mrxstudios blog** (primary RE source): <https://mrxstudios.home.blog/> — posts on scripts, SET/map layout, locations.
- **DFET** (DreamFactory Extraction Tool) by M3tox: <https://github.com/M3tox/DFET> — extracts scripts, audio, frames; partial Dust support, open source (GPL-3).
- **DreamCatcher** by JamesK89: <https://github.com/JamesK89/DreamCatcher> — RE project targeting Dust runtime (x64dbg + Ghidra + DLL injection).
- **US Patent 5,729,669** (Appleton / Cyberflix): *Method and apparatus for displaying movies using Z-data information* — sprite/Z clipping system.
- **Fan remaster** (mrxstudios UE5): YouTube channel “Dust Remastered”, Discord, blog. Non-commercial; coordinate if overlapping.

## 3. Navigation, Town Layout & Spatial Systems

Original navigation used a grid of “scenes” (tiles) inside SET files. Each scene has a script for interactions/transitions. Player movement between adjacent accessible tiles triggered frame sequences for walking animations (multiple orientations). Waypoints provided precise placement for props and characters. Inaccessible tiles blocked movement. This is closer to a hybrid of node-based + free movement than pure continuous 3D FPS of later games.

**Recommendation for Three.js:** Reconstruct the town as a continuous 3D mesh (or modular kit) with collision. Use the original SET grid as authoritative for walkable areas, door connections, and spawn points. Convert waypoints to Three.js `Vector3` positions. Implement a simple capsule controller + raycast for interaction. For higher fidelity to original feel, support both free-roam and optional “snap to original scene centers” mode. Day/night and lighting should drive material and ambient changes (use Three.js lights + optional post-processing).

Town contains ~20 interiors (Hard Drive Saloon, curiosity shop, mayor’s house, mission, apothecary, livery, hotel, jail, cemetery, stagecoach office, etc.) plus outdoor streets and limited desert periphery. Invisible walls originally prevented leaving the playable area. Recreate collision volumes accordingly. Interactive animals and environmental objects (pie, bone, photos, etc.) are props with usage scripts.

## 4. Characters, Cyberpuppets & Dialogue System

35–40 interactive characters. Original presentation: photo-based cyberpuppets with limited facial animation (mouth) synced to audio, overlaid via Z-depth. They have independent schedules, move around town in real time, and possess conversation memory that alters later dialogue and behavior. Scripts call `puppetspeak(dialogueID)`, set actor flags, trigger events, check inventory/cash, etc.

### Three.js options for characters

1. **Fidelity path:** Extract sprite sequences / frames (via DFET or manual), use `THREE.Sprite` or Plane with texture atlas + mouth flipbook + billboarding. Match original Z-ordering where possible.
2. **Modern path:** Replace with 3D humanoids (Ready Player Me, Mixamo, or custom) + lip-sync (Rhubarb Lip Sync, or ML solutions) + simple animation state machine (idle, talk, walk, special). Use LOD and instancing if many on screen.
3. **Hybrid:** Keep photo faces as texture on 3D heads for nostalgia while body is modern.

**Dialogue architecture:** Parse or manually convert original PUP + script logic into a graph format (JSON, Ink, Yarn Spinner, or custom). Nodes:

- **Speak** (text + audio + animation)
- **Choice** (player options that set flags or branch)
- **Condition** (check global flags, inventory, cash, day, previous memory)
- **Action** (give item, change cash, set memory bit, trigger quest event, move NPC)

Each character maintains a memory object (bitflags or key-value) that persists across the game. The 400-page script size means the dialogue data will be substantial — store as separate JSON per character or area, lazy-load.

**Critical early systems:** cash threshold to progress past Day 1 night (blackjack/poker minigame is the reliable path), dog bone, lodging options, obtaining gun/boots/ammo via specific dialogue + item interactions. Character memory must affect available topics and reactions (e.g., after becoming sheriff, after saving Help, after returning artifacts).

## 5. Inventory, Quest Flags, Time Progression & Endings

Inventory is classic adventure: pick up, examine, combine/use on characters or environment. Multiple solutions exist for many problems (e.g., boots from corpse or trade). Cash is a first-class resource (gambling, purchases, bribes). Official strategy guide (Schwartz) contains authoritative item locations, usage, and full document texts — treat it as the content bible alongside walkthroughs.

Time is day-based (Day 1 Evening → Day 5 / final choice). Advance by sleeping or completing key events. NPCs have schedules tied to time of day. Global state machine should track current day, time slot, and a large flag set for quest progress and character memory. Final endings (5 variants) are determined solely by the player’s choice about the treasure at the town entrance on the last morning: ranch with Nate, lead business with Mayor, flee with Marie, give to Sonoma/Yunni, or leave alone. Implement as a simple switch that selects epilogue narrative + stills or short cinematic.

## 6. Minigames, Combat & Puzzles

- **Gambling:** Blackjack and poker (player can choose to cheat — risk detection and consequences). Implement as self-contained scenes with their own state; success funds the early game.
- **Checkers / Slots:** Optional side activities.
- **Shooting range:** Practice for later accuracy; useful for training the gun system.
- **Gunfights / Bounty hunters:** First-person sequences. Waves of enemies appear in the town. Player must aim and shoot (original was relatively simple). Use raycasting or simple hit detection. Death is possible → reload from save. Quick-draw duel with The Kid is a climactic set-piece.
- **Mine puzzles** (key implementation targets): Seasonal dial + moon + sun phase to open corridors; flute note sequence (documented as 3-5-2-4-1 in community); dagger / rotating disc puzzle with neighbor influence (needs careful state machine or solver validation); crest symbol combinations; mask maze following directional cues; final Thunderbird invocation symbols. These are classic adventure logic puzzles — implement with clear state and feedback.

## 7. Asset Pipeline & Content Sources

- Extract original assets where possible with DFET (scripts, audio, frames). Manual ripping from ISOs for remaining visuals. Respect that full commercial redistribution of original assets is not advisable without rights clearance.
- **Town geometry:** Reverse from screenshots, playthrough videos, and SET map data. Build modular low-poly or mid-poly Western buildings. Reference fan remaster showreels for modern interpretation.
- **Characters:** Decide fidelity vs modern. If photo-based, create atlas + animation sequences. If 3D, commission or generate consistent style across ~40 characters.
- **Audio:** Extract music (Scott Scheinbaum — Western / Copland influences) and voice. Dialogue is extensive; plan for streaming or progressive download.
- **UI / documents:** In-game books, newspaper (*The Rattler*), maps — recreate as readable HTML or textured planes.
- Strategy guide + community walkthroughs supply the complete item list, dialogue outcomes, and puzzle solutions needed for content completeness.

## 8. Performance, Web Specifics & Legal Notes

**Performance:** Original ran on 486 / 8 MB RAM. Modern browsers can handle far more, but many simultaneous NPCs + high-res textures still require care: frustum/occlusion culling, LOD, texture compression (Basis/KTX2), progressive loading of areas and dialogue packs, simple AI (schedule + path to waypoints rather than full pathfinding every frame). Target 60 fps on mid-range hardware; offer quality settings.

**Web specifics:** Pointer Lock for FP look, fallback for mobile. Save system via IndexedDB or localStorage (serialize flags + inventory + position + day). Progressive Web App possible for offline play after asset cache. Accessibility: subtitles (already have text), colorblind options, input remapping.

**Legal / Ethical:** The game is abandonware; rights chain is murky (GTE → Havas → Vivendi → Activision Blizzard → Microsoft). Fan remaster by mrxstudios is explicitly non-commercial and seeks eventual blessing. For any public or commercial rebuild: obtain legal advice, prefer original content recreation over direct asset redistribution, credit CyberFlix / original creators, and consider contacting rights holders or the fan remaster author for coordination. This handbook is for educational / preservation / fan purposes.

## 9. Suggested Implementation Roadmap

1. Extract & catalog assets with DFET + manual tools; map SET grids to a spatial data structure.
2. Prototype free-roam town with basic collision and day-night lighting using placeholder geometry.
3. Implement core state (day, cash, flags) + simple dialogue runner with 2–3 characters.
4. Add inventory + item use + early quests (bone, lodging, cash via blackjack).
5. Build character system (schedules + memory) and expand dialogue coverage.
6. Implement combat/gun system and bounty-hunter waves.
7. Mine area + major puzzles + final choice + endings.
8. Polish audio, UI, performance, mobile support, save system.
9. Content completeness pass against strategy guide + walkthroughs.
10. Testing, accessibility, and optional fidelity modes (original sprite vs modern 3D).

## 10. Key External Links & Resources

### Reverse Engineering & Tools

- mrxstudios RE blogs: <https://mrxstudios.home.blog/> (scripts, SET maps, locations)
- DFET tool: <https://github.com/M3tox/DFET>
- DreamCatcher RE project: <https://github.com/JamesK89/DreamCatcher>
- Patent 5729669: search “US5729669A” or freepatentsonline.com

### Fan Remaster

- Dust Remastered YouTube: <https://www.youtube.com/@dustremastered>
- Time Extension announcement: <https://www.timeextension.com/news/2022/07/fan-remake-of-dust-a-tale-of-the-wired-west-announced>

### Content & Reference

- Official Strategy Guide (Schwartz) — Prima 1995 / Classic Game Books 2019 & 2022 reissues (Amazon)
- Walkthroughs: Walkthrough King, Just Adventure, GameFAQs, Speedrun.com notes
- Previous comprehensive document (this team): historical plot, characters, reception
- Cyberflix Wiki: <https://cyberflix.wiki.gg/>
- VGHF Andrew Nelson papers (scripts, design docs): <https://library.gamehistory.org/>
- Abandonware archives: MyAbandonware, Old-Games, Macintosh Repository (for ISOs + Mac manual)

### Three.js / Web Game References

- Three.js docs & examples (first-person controls, audio, CSS2D)
- Existing open browser FP adventures / towns for architecture inspiration (search GitHub for Three.js first-person adventure)

---

This handbook is intended to accelerate a faithful yet modern recreation. The original remains a remarkable 1995 experiment in interactive narrative and living worlds. Treat the source material and existing fan efforts with respect. Questions or deeper dives into specific systems (e.g., full dialogue graph schema, exact mine puzzle state machines) can be addressed in follow-up documents.

Compiled August 2026 by Grok (lead) with Harper, Benjamin, and Lucas.
