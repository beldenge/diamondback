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
- **Buildings are sized from their interior SETs, exteriors follow.**
  Every SET header carries the camera height (`+26`, camZ) and the
  eye height is the same everywhere, so one interior tile measures
  `TILE * 62 / camZ` (62 is the street camZ): the saloon walks 2.8 m
  tiles, the jail 3.5 m, the tiny curiosities shop 2.2 m
  (`interiorTile()` in layout.ts). The walkable grid from
  `transitions.json` plus the furniture strips the stills show around
  it give each room; the lot is fitted to that and the porch, signs
  and windows are placed on the result. Where a SET was filmed with
  its door on the wrong wall for the street it faces (jail, Watson’s,
  Bolivar’s, livery, Sidewinder, the mansion) the plan is turned, not
  mirrored, so the room reads the same on entry.
- Interiors nest **inside** the exterior footprints; upper floors
  stack at `STOREY` with real stairs — the saloon’s rise **west** along
  the south wall from the south-east corner (D6 W in the film) to a
  corridor over the bar with rooms 1–3 facing east and Ruby’s room 4
  across the north end; the hotel’s enclosed stair rises north beside
  the PRIVATE partition to a landing, corridor and your room 3 on the
  street corner. Label zones carry a Y band so an upstairs never
  steals the ground-floor name.
- The mission patio is `_COURT`’s 3×3 ring around the fountain, with
  five-bay arcades of real round arches (`Builder.archWall`, an
  extruded shape) and stepped parapets; the schoolhouse across the
  north has its arched windows in the compound’s outer wall and the
  padre’s cell under the bell tower has its window on the west wall.
- The Yunni underground is in (`underground.ts`): click the courtyard
  fountain and it slides aside, opening a stone stair down to
  the sundial room (the film’s `_HUB` — its walkable cross surrounds
  the unwalkable centre, which is the dial). Its arms lead to the
  trial rooms per the film SETs — east `_SNAKE` (the great head),
  south `_TBIRD` (teal walls, glowing icon), west `_FLUTE` — with a
  timber `_MINE` off the shaft antechamber. Over the shaft mouth the
  terrain plane falls away (`Player.update` takes a `baseY`).
- Windows on enterable buildings are real openings with clear glass
  (`WINDOWS` in layout.ts feeds both the shells and the interior
  linings via `winGaps`); solid background barns keep painted panes.
- Street-face decoration rule: signs / windows / posters sit outside
  the wall AABB. Shell walls are inset inward so every outer wall face
  lies exactly on the lot edge; decor planes go at `edge ± DECOR_GAP`.
  Inside, `lining()` hangs its wallpaper panel mostly within the shell
  and 1 cm proud of the room’s air face, so wall props (frames,
  shelves, decals at `face ± 0.012`) placed at that face are never
  buried.
- `Builder.build` merges one geometry per material; `mergeGeometries`
  refuses to mix indexed and non-indexed buffers and would drop the
  whole material, so anything extruded (arches, gable ends) is indexed
  with `mergeVertices` first and the merge falls back to loose meshes.
- `wallX`/`wallZ` subtract every gap rectangle from the wall as a 2-D
  cut (the run is sliced at each gap edge and filled around the union
  of holes), so an upstairs window may sit straight over a street door.
  The earlier one-pass splitter walled the saloon doorway shut with
  the sill of the window above it. Every swung door also gets a real
  frame (`doorFrame`: jambs + head filling the cut margin).
- Gable roofs carry closed triangular ends in the wall material, and
  street false fronts are braced from behind, so nothing reads as a
  board standing on a roof.
- The way underground is a wide spiral in the fountain shaft: 24 wedge
  treads (rise 0.29, under the 0.42 step-up) around a centre column,
  each carried by a grid of small AABB colliders so the walker steps
  from wedge to wedge; the ring wall opens south at the bottom into the
  antechamber, and the fountain plinth slides aside to expose the mouth.
- The saloon street door opens into a vestibule: a short return wall
  with an arch holding the louvred cafe half-doors (`CafeDoors`), which
  swing as the walker passes.
- Rooms that cannot be entered still get a real-looking painted door
  (`P.fakeDoor`: panels, frame, knob, optional number plate) rather
  than a bare slab.
- Wagons, buckboards and the cage cart carry their running gear
  grounded: iron axles on the wheel centres, bolsters up to the bed, and
  tongues or shafts that start at the axle and rest on the ground.
- Dressing comes only from the film stills: no temperance posters, one
  ox skull per gate, nothing inside the range but the booth and tank.
- `ambient.ts` adds sparse life: at night a meteor streaks across the
  dome every 3-8 s, spawned inside the view so it is actually seen
  (two crossed additive strips, fog off), and every
  25-60 s a tumbleweed (a ball of twig hoops) bounces down one of the
  street lanes. Neither collides with the walker.
- Shady Acres is fenced with real slatted pickets and its stones carry
  lettered epitaphs (slate, granite, board and cross) — the film’s
  “Lester Moore, four slugs from a .44” included.

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
| `geometry.ts` | `Builder`: merged boxes/cylinders/decals/arched walls + collision AABBs |
| `props.ts` | Street props (fences, headstones, lamps, wagons…) and furniture (beds, counters, shelves, stairs with rails, pictures…) |
| `town.ts` | Outdoor Diamondback, block by filmed block; real windows with muntins/arches/bars |
| `interiors.ts` | Interior door registry, `lining`/partition helpers, assembly |
| `rooms-west.ts` | Saloon (both floors + backlot), jail, bank lobby, doctor |
| `rooms-east.ts` | Stage office, Watson’s, Bolivar’s, Curiosities, hotel (both floors), livery |
| `rooms-far.ts` | The Rattler, Sidewinder’s, the mission (patio, school, padre), the mansion |
| `doorsim.ts` | `SwingDoor` + the `Clickable` contract |
| `underground.ts` | The Yunni underground + the sliding `FountainSecret` |
| `ambient.ts` | Night meteors and street tumbleweeds |
| `player.ts` | FPS body: slide collision, step-up, gravity, jump |
| `sky.ts` | Day/night dome, sun/moon, stars, fog |
| `hud.ts` | Place label, crosshair, door prompt, pause overlay |
| `game.ts` | Orchestration, input, raycast clicks, quit-to-chooser |

Wired from `src/main.ts` (lazy `import("./reimagined/game")`) and
`src/core/mode.ts`. Verification: `npx tsc --noEmit` and
`npx vitest run src/reimagined src/core/mode.test.ts`.
