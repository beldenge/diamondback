# Dust: Reimagined

A separate 3D free-roam of Diamondback. Pointer-lock FPS, empty town,
clickable swing doors, `N` day/night. **URL-only**: `/?mode=reimagined`.
No card on the title chooser; no aliases (`renewed`, `free`, … land on
the chooser). Isolated from Dust: Resurrected / Unlocked / The Picture
Show — no VM, no SET walker, no stills HUD, no NPCs, no items, and no
extract fetches at runtime.

Spawn is the south gate: SET tile **O7**, a few metres south of the
hanging DIAMONDBACK sign, facing **north** into Main Street. The HUD
place label reads “South gate”. A missing query never spawns at the
world origin (`Number(null) === 0` is guarded in `spawn.ts`).

---

## How the town was built

Everything was derived by walking the film **scene by scene**: for each
of the 52 filmed poses in `dfextract/out/SET/_TOWN` (HQ stills +
turn frames) and each interior SET’s spawn stills, the 3D view from
that tile/facing was compared and the geometry fixed until it matched.
No SET stills are pasted onto walls — materials are tiling Dust-palette
canvases (wood / adobe / brick / dirt / palisade / olive / blackwood)
inferred from the film; stills are a shape, occupancy and material-kind
guide only. `dfextract/out/**` is never edited.

- The filmed outdoor graph is the **52 camera tiles** of
  `_TOWN/transitions.json` (carried as data in `coords.ts`), not the
  225-cell blocked table. Street camera tiles are walkable poses;
  buildings sit **off** the street on facade lots (`layout.ts`).
- Interiors are sized from each interior SET’s walkable camera tiles
  and nest **inside** the exterior footprints; upper floors stack at
  `STOREY` with real stairs (label zones carry a Y band so an upstairs
  never steals the ground-floor name).
- The Yunni underground / cave / courtyard pit is deliberately absent:
  the mission courtyard has a three-tier fountain and **no hole**.
- Street-face decoration rule: signs / windows / posters sit outside
  the wall AABB. Shell walls are inset inward so every outer wall face
  lies exactly on the lot edge; decor planes go at `edge ± DECOR_GAP`.

Street doors follow the authoritative pose list in
`src/world/set/doors.ts` (Watson I7 E, Bolivar J7 E, saloon H7 W with
the J4 E back door, stage H7 E, hotel E7 E, doctor E7 W, bank F7 W,
jail L7 W, curiosities L7 E, mission D7 N, Rattler H4 W, Sidewinder
G1 S, livery F10 E, mayor gate I10 E). `layout.test.ts` pins the table.

## World space

Three.js Y-up; +X east, +Z south (SET +y). `TILE = 8` world units per
Dust tile (the original used 256/tile). Scene names: letter =
`chr(65+y)`, number = `x+1` (G7 = (6,6), O7 = (6,14)). Yaw 0 looks
north (−Z); positive yaw turns left; movement uses
`wishXZ` (forward = (−sin yaw, −cos yaw)) so WASD always matches the
camera.

## Controls

Click for pointer-lock look; WASD / arrows move; Shift sprints; Space
jumps; `N` swaps day/night (dim lights, night sky, warm windows);
click a door to swing it open. Esc releases the look; Esc again
returns to the title chooser. Collision is AABB with slide and a
step-up for boardwalks and stairs — never sticky. Fog stays light
enough to see the mission from the gate, as the film does.

### Debug query params (used only when actually present)

`scene=G7`, `tx`/`ty` (tile), `facing=N|S|E|W`, `x`/`z`/`y` (world),
and `still=1` (no click-to-enter shade, input without pointer lock —
for pose screenshots against the film stills). A dev handle
`window.reimagined` exposes the running game.

## Code map

| File | Role |
|---|---|
| `coords.ts` | Tile/world space, the 52 camera tiles + 55 walk edges, yaw math |
| `spawn.ts` | Query → spawn pose; origin-guarded defaults |
| `layout.ts` | Pure town plan: lots, gate/palisade, door registry, label zones |
| `palette.ts` / `textures.ts` | Dust palette + procedural canvas materials |
| `materials.ts` | Lazy material registry (day/night window variants) |
| `geometry.ts` | `Builder`: merged boxes/cylinders/decals + collision AABBs |
| `props.ts` | Barrels, cacti, fences, lamps, windmill, water tower, well, … |
| `town.ts` | Outdoor Diamondback, block by filmed block |
| `interiors.ts` | All interiors + upper floors + interior door specs |
| `doorsim.ts` | `SwingDoor` (click-to-swing, collision while closed) |
| `player.ts` | FPS body: slide collision, step-up, gravity, jump |
| `sky.ts` | Day/night dome, sun/moon, stars, fog |
| `hud.ts` | Place label, crosshair, door prompt, pause overlay |
| `game.ts` | Orchestration, input, raycast clicks, quit-to-chooser |

Wired from `src/main.ts` (lazy `import("./reimagined/game")`) and
`src/core/mode.ts`. Verification: `npx tsc --noEmit` and
`npx vitest run src/reimagined src/core/mode.test.ts`.
