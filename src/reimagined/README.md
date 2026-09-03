# Dust: Reimagined

A separate 3D free-roam of Diamondback. Pointer-lock FPS, empty town,
clickable swing doors, `N` day/night. Title-chooser card and
`/?mode=reimagined`. No aliases (`renewed`, `free`, … land on the
chooser). Isolated from Dust: Resurrected / Unlocked / The Picture
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
  mirrored, so the room reads the same on entry. The two exceptions
  are the mansion’s study and dining room: their own stills are mirror
  images of the hall’s (the hall fixes both side doors at its west
  end, which only works if those rooms are flipped east–west), so
  they are laid out mirrored — fireplace and the witch painting on the
  street wall, the curtained windows on the partition.
- **Accuracy pass.** Every room, the underground and the night town
  were re-checked against the stills with a film-camera harness: the
  lens sits 2 m behind the tile centre opposite the facing (a quarter
  tile in interiors), eye 1.9375, vertical FOV `2·atan(132/310)`,
  aspect 512/264, so a 1024×528 render overlays the still 1:1 at 2×.
  Interior SET grids are mapped onto our lot-fitted rooms (or their
  walkable spans when a SET stops short of a dais or the stairs). The
  `auditDecor` report (`window.reimagined.decorReport`) must be empty:
  every decal backed within 0.3 m, ≥85 % covered, clear of openings
  and of other decals.
- What the stills fixed: interior lamps are oil lamps on chains and
  brass parlour sconces (no cone shades); offices keep their shades
  down (`P.blind`); the saloon’s street windows hang with drapes and
  the café doors stand between turned posts; the hotel desk is an L
  under a wagon-wheel chandelier; the jail’s single lantern hangs over
  the desk and the barred window is shuttered inside; the hub is an
  11.5 m chamber of pointed arches between metre-deep niches around a
  spider pedestal and a flat stone dial, its tunnels black; the snake
  head is a domed skull over a black mouth; the thunderbird shrine
  stands between black stone columns; the flute cavern is black with
  obelisks. Night keeps the moonlit level low; the saloon’s and
  hotel’s real panes glow through their own glass (`glassLit`, an
  emissive swap on the clear glass — no opaque decals over the
  windows), and the stars stay on at night by the user’s request even
  though the `_NITE` stills show none.
- **Second accuracy pass (2026-09-02).** Every street pose, the night
  set and every interior SET were re-captured and compared at 2× with
  pixel-column profiles (thumbnail reads were off by up to a metre, so
  nothing was moved on a sheet read alone). What that fixed: windows on
  the hotel, Watson's, Curiosities, the bank, jail, stage office,
  Sidewinder's and the saloon sit lower and taller (sills at 0.4–0.8 m
  where the stills put them); the hotel has its third arched pane north
  of the door and two tall arched panes on its south porch (G8 N / G9 N —
  the lobby's curtained windows, not doors); the jail's cell gate hangs
  in the bar wall and the café leaves hinge on their posts; the
  bank is a 4.6 m box behind a 5.6 m Main-street parapet (F4 E) with
  wide-tracked painted letters front, back and side; Curiosities is a
  4.6 m shop under a red hip roof behind a 6.1 m black false front
  (N7 N), its door 1.9 m wide, its porch fascia black with the small red
  name and the red pagoda slope above; the Rattler's porch is 2.9 m
  high with a green panel across its front carrying all the lettering
  (H4 W / G4 S); the saloon's name board stands on the balcony floor
  (H7 W / I7 W); the mission front is 6.55 m with a coping, its lintel on
  4.4 m doors, sun discs at 2.75 m, the MISSION board and the santa marta
  arm on one post at (56.7, 24) (D7 E / D8 N / E7 N); the gate sign hangs
  tilted on chains under the 5.4 m beam; the "Firearms Strickly
  Prohibited" board faces south across the lane's east edge (N7 N /
  N7 E; it is invisible from M7 E); the gate-yard fence is grey boards
  to Curiosities' corner with its rails street-side; the NE barn is pale
  boards under red-brown shingles with an X door and loft door on its
  gable end, the livery runs north to meet it with a dark LIVERY board
  (F10 E / D9 E), the corral rails are 1.75 m; the farm's grey barn and
  farmhouse have dark shingles (K4 S / K4 W); lamp posts are thin dark
  poles with square lanterns and a lamp stands at the Lee/Neely corner
  (F10 S / E10 S); the Shady Acres gate is 4.8 m with a 5.2 m board at
  4 m, its pickets thin and half a metre apart, its slabs 1.3 m; the
  Neely wagon has dark wheels and the coffins by Sidewinder's are the
  film's big tan crates (one stood on end); the mansion grounds lost
  their trees; the pump and trough in the lane north of Neely went
  (E4 S / G4 N film the lane empty); the range booth is a 1.4 m stand.
  Lighting: the day
  hemisphere carries most of the light (north faces read half the sunlit
  tone, not a fifth), the night sits at the stills' near-black levels
  with only the ground-floor saloon and hotel panes lit, and lantern
  glass is dark by day. Interiors: the stage office keeps its shades
  down, the livery office is dark boards, the surgery pale ones, the
  padre's cell grey stone, the saloon's upper corridor grey damask, the
  patio has benches on its north arcade, and the fire bowls underground
  are embers, not lamps.
- Later fixes from walking the town: the saloon stair turns at the
  bottom (three steps south from the room to a low landing in the
  south-east corner, then the long flight west along the south wall,
  with the railed passage over it that `_SALUPPER` A4 E shows); the
  street signs are two boards on the lamp post, each lying along its
  own street and reaching from the post toward the crossing; the range
  rail at Lee’s south end has the gateway K10 S shows and the rail
  closing Neely’s east end has its gate standing open (G11 E shows the
  leaf swung back); the mansion’s street fence has a panel between
  every pair of pillars; the board wall that used to cross Lee at the
  store yard’s line is cut back to the yard (K10 N and J10 S show the
  street running on between the mansion and the range) and the range
  keeps only the rails either side of its banner gate — nothing
  encloses it; the yard cart behind the Rattler is the two-wheel tip
  cart of J4 W; the gate WARNING board sits a metre into the lane on a
  centred post standing behind it, so it clears the gate post from the
  spawn. The saloon’s long flight is `hollow` (thin risers over a soffit
  plank, full-height colliders) so the piano fits under its high end as
  B4 S shows. The plank wall at the south gate stops where O7 E / O8 E
  show its east end and never runs south of the gate line; the rail
  fence by the shed west of the gate is the user-approved one running
  north at x 40. Cart and wagon props place their parts with three.js’s own rotateY
  sense (local +x → (cos θ, −sin θ)); a helper with the opposite sign
  scatters wheels and shafts at any angle that is not a multiple of 90°.
- Interiors nest **inside** the exterior footprints; upper floors
  stack at `STOREY` with real stairs — the saloon’s turn up from the
  room in the south-east corner and rise **west** along the south wall
  (D6 W in the film) to a corridor over the bar with rooms 1–3 facing
  east and Ruby’s room 4 across the north end; the hotel’s enclosed
  stair rises north beside the PRIVATE partition to a landing, corridor
  and your room 3 on the street corner. Label zones carry a Y band so an upstairs never
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
