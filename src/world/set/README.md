# Outdoor stills walker

How the remake plays Dust’s filmed town. Extract layout lives in
[`dfextract/docs/`](../../../dfextract/docs/); this file is the
**playback** book we filled in while getting Diamondback’s streets to
match the original stills. Do not patch `dfextract/out/SET/**`; if a
still or graph is wrong, fix `dfextract/` and re-extract, or this walker.

Dust: Unlocked (`/?mode=unlocked`) and Dust: Resurrected share this
stills walker inside `PlayGame`. Unlocked is a sandbox policy on that
host, not a second implementation. The 3D free-roam, Dust: Reimagined
(`/?mode=reimagined`), is a separate build in
[`src/reimagined/`](../../reimagined/README.md) — it shares nothing
with this walker at runtime. The title chooser lives at `/`.

---

## What the town actually is

Dust’s outdoor Diamondback is a **tile + facing camera graph**, not a
3D mesh. Each legal pose is one filmed 512×264 still. Walking or turning
plays a 6-container filmstrip, then you stand on another pose.

| Fact | Value |
|---|---|
| Grid | 15×15, scenes A1–O15 (225 cells) |
| Filmed / camera tiles | **52** (from `transitions.json`, not `blocked`) |
| Coordinate space | +x east, +y south. **256** units/tile in `DF.EXE` (`tile*256+128`). Not 255. CST/PRP overlay (locked): [`src/play/README.md`](../../play/README.md) § World → still. |
| Facings | 1=N, 2=S, 3=E, 4=W |
| Still size | 512×264 indexed PNG |
| Day / night | Same graph; `_TOWN` vs `_NITE` stills |
| Spawn | Scene **O7** facing **N** (south gate under the sign). Fallback `{x:6,y:14,facing:N}` |

The 225-cell `scenes.json` table is **not** the walkable graph. Many
cells are blocked or never filmed. `cameraTiles` is the set of nodes
that appear as a framelist `from` or `to`. Play-mode `walktostar` (any
actor) uses that SET’s polyline on the from/to star pair (`paths.json`),
not a BFS of these tiles; see [`src/play/README.md`](../../play/README.md).

---

## Filmstrip layout (the snap-back bug)

Each `transitions.json` record is 6 consecutive containers:

```
frame0+0 … +4   low-quality motion
frame0+5        high-quality still of the *from* pose (walks)
```

Playing all six on a walk **snaps you back** to the starting view after
you have already stepped. That is why early builds felt like
“two steps forward, one back.”

**Play five motion frames, then the landing pose’s HQ still.**
`framesToPlay()` returns 5. DF.EXE `0x40dd90` increments the filmstrip
index once per 20 Hz display pump (`0x40e1d2` wait of `framerate (3)`
60 Hz ticks). After index hits 5 it copies dest and sets index `-1`.
Dest HQ is that standing blit, not a sixth timed plate. A walk command
while index `>= 0` is a no-op (`0x40d920`).

Turns also play 5 motion frames. On a turn, `+5` is the HQ of the
**starting** facing; the dest HQ is still looked up separately.

---

## Standing HQ lookup (`hqFrame`)

For pose `(tile, facing)`:

1. If a **walk leaves** this pose, use that walk’s `+5`.
2. Else (dead-end facing, no outgoing walk) use the **clockwise /
   right-turn** from this pose, `+5`. Dust stored the same keyframe
   there.
3. Else any in-place turn’s `+0`.
4. Else `holdFrame`: last frame of a transition that *ends* here
   (LQ dest, not HQ).

**Do not** take HQ from “a turn that ends on this pose.” That slot is
the *other* facing’s from-still. Scene **G11** (alley dead-end) sharpened
to the wrong wall until we switched to rule 2.

Checked G11 HQs (TOWN extract):

| Facing | frame0 | offset |
|---|---|---|
| E | 362 | 5 |
| N | 356 | 5 |
| S | 368 | 5 |
| W | 379 | 5 |

O7 north spawn HQ is `1640_5.png`.

---

## Timing and input

| Knob | What we use |
|---|---|
| Motion rate | `STILL_FRAME_SEC = 3/60` (20 Hz). Five motion frames = 250 ms. |
| Hitch policy | Advance **one** frame per interval. Never skip. If a PNG is not ready, hold until it is. |
| Dest HQ | Standing blit after idle. Do not prefetch it on the walk; Dust delayed that sharpen. Last motion plate holds until HQ is ready. |
| Input while busy | Ignore. Dust `0x40d920` returns if the strip is live. After idle, a held key is Dust `keyrepeat`. |
| Dead / unfilmed move | No-op (no transition in the graph). |

On keydown the first motion frame paints immediately if it is already
decoded. While you stand, we prefetch **depth-1** neighbor **motion**
plates (left / right / forward, and matching Z) at low priority — one
tap ahead. Standing HQ is idle-only. Starting a walk/turn promotes
**that strip** (high). Dest depth-1 motion is also high, queued *after* the
current five. Color stills use `stillGate` (max 8, 2 reserved). Z and
sprites use `bitsGate` (max 3) so they cannot flood `Image.decode`.
`Image.decode` cannot be aborted once started. If a PNG is missing
when the clock wants it, **wait** — do not skip. Entering a building
drops the last Z plane so town occlusion is never held onto a shop still.
A **colour still is only ever a texture** — nothing reads its pixels
back in JS — so it decodes with
`createImageBitmap(blob, { imageOrientation: "flipY" })` and the texture
takes `flipY = false`. That keeps the decode off the main thread, keeps
512×264×4 bytes per still *off* the JS heap, and lets eviction `close()`
the bitmap the moment it is dropped. WebGL's `UNPACK_FLIP_Y_WEBGL` does
not apply to an `ImageBitmap`, which is why the flip is asked for at
creation; verified byte-identical against the canvas path for a SET
still and a CST sprite. Do **not** pass `colorSpaceConversion: "none"` —
*that* is what turns indexed SET PNGs black in Firefox. A one-time probe
checks the flip actually happened and falls back to the `ImageData` path
if it did not.

**Z planes and sprites** still need their pixels in JS, so they go
through one shared software 2D canvas and `getImageData`.

The texture cache evicts after 256 stills and will not drop the retained
current/next strip. That is not the film: `TOWN.SET` is ~60 MB of 8-bit
deltas; the PNG dump is ~115 MB; keeping every town still as RGBA would
be ~1.7 GB — the town is 3155 stills, so the cache is ~8 % of it and a
long walk is *expected* to re-decode.

**Z planes are LRU, 512 deep (~69 MB of plain `Uint8Array`).** Deeper
than the colour cache on purpose: a plane is a quarter the size of the
still it pairs with, and re-deriving one costs a PNG decode plus a
throwaway 540 KB `ImageData`. They used to be trimmed to the current
strip plus its neighbours on *every step*, so pacing one street
re-decoded half of them.

**Prefetch is the head of the list, not the whole neighbourhood.**
`neighborStillUrls` is plate-major, so its first six entries are plate 0
then plate 1 of each of the (at most three) moves available from the
pose being landed on — what a tap needs immediately. The rest of the
chosen strip is fetched when the tap happens and has a 50 ms slot per
plate to arrive. Warming all five plates of all three moves instead
meant ~15 decodes per step of which at most 5 were ever shown: it
tripled the traffic and evicted the cache out from under stills that
were still wanted. Measured over a 231-move tour of all 52 camera
tiles, dropping to the head of the list cut decodes ~30 %, evictions
~31 %, heap 267 → 169 MB and the worst move 607 → 352 ms, with 3 held
frames in 4614 (0.07 %) and plate 0 warm at 100 % of taps.

Sprite and Z decodes mark the actor overlay dirty; `tick` repaints it
once. Painting inside each decode callback (and inside each of the
three `refreshActors` a single `advanceActors` fires) ran the whole
projection-and-blit pass several times per frame.

A tap during the strip is dropped (`0x40d920`). After idle, Dust
`keyrepeat` fires if the key is still down. Play mode uses the same
walker/prefetch as the sandbox.

Locally, Vite serves extract files at `/extract/…` →
`../../../dfextract/out/…` with `Cache-Control: no-cache` + ETag so a
re-dump shows up on reload (no `?v=` cache-buster). The client fetch
uses `no-cache` in dev and the HTTP cache when hosted. Hosted Pages
builds prefix the same relative paths with `VITE_EXTRACT_BASE`
(CloudFront). See `extract.ts`.

---

## Decode / dump (why frames looked corrupted)

Codec, palette, and sizes: [`dfextract/docs/images.md`](../../../dfextract/docs/images.md).
Short version of what we hit while walking the town:

Indexed stills are a **delta framebuffer**. Skip spans leave the prior
pixels. Two extract mistakes produced black / speckled walk frames:

1. **One PNG per container id.** Adjacent strips share ids. The O7→N7
   walk starts at container **1640**, which is also an N7 turn’s last
   frame. Decoding once in framelist order overwrote the walk’s first
   frame with the turn decode (wrong prior).
2. **Shared prior across strips.** Each 6-frame strip must start from a
   clean buffer.

Fix: decode each strip alone; write `FRAMES/{frame0}_{offset}.png`
(never `frame_{id}.png` for SET). Re-dump **both** `_TOWN` and `_NITE`
after that change — it is not an O7-only patch.

**Negative `look`.** Mode 3 copies `dst - look`. `look` can be negative
(read *ahead* into not-yet-overwritten prior-frame rows). Skipping those
writes painted sky-blue speckles on the L7 sheriff wall during the
west→north turn (strip 2866). Copy-ahead is global, not L7-only.

**Palette 255 / cream 2.** DFET’s BMP writer forces index 0 black and
255 white. Dust stores 255 as `(0,0,0)`. Using the stored value made
the ox skull a black hole (O7 north HQ `1640_5`, also O8 / N7 south).
The bone body is index **2** `(217,193,156)`, not dirt. Night uses real
grays and does not use 255. `_NITE` is a second filming, not a prior
for `_TOWN`.

### Remaining holes (do not invent pixels)

Skip-on-fresh-prior stays black. Day-sky index **116** `(102,127,193)`
in glass/posters, and index **0** dither in some saloon windows, are in
the film. Right-edge garbage stripe is a known codec limit. Do not
inpaint or remap those to invented tans/whites.

---

## Controls (stills mode)

- **← / →** or **A / D** — turn
- **↑** or **W** — walk one filmed block
- **N** — swap day ↔ night stills. Street is `_TOWN` ↔ `_NITE`. Inside the
  mission, court is `_COURT` ↔ `_NITECOUR` and school is `_SCHOOL` ↔
  `_NITESCHO` (the two interiors Dust filmed twice). Does **not** advance
  `day`. Padre / hotel / shops have no night SET — clock still flips so
  walking out lands on night street.
- **Swipe** (touch/pen): across turns, up walks. Down is not a back
  step. Sideways **drags the picture**, the way every photo panorama
  does — pull the still right and the street slides right, which means
  you turned *left*. Matching the finger to the turn reads as backwards,
  because the picture visibly moves the wrong way. Up stays a push, not
  a drag: it is a step forward and there is no filmed back step to drag
  toward. A swipe may start **anywhere on the page**, not just on the
  stage: the 512×384 letterbox leaves most of a portrait phone as bars,
  and dead glass is worse than a slightly loose hitbox. Mouse clicks on
  the still do **not** walk — Dust used chrome outside 0–512, and remake
  22%/48% bands stole scene hotspots.
- **Click a door** — if the lock function says openable, overlay the
  house-prop sprite and play `dooropen*`. Click again to close.
  Locked doors play `knock*` and stay shut (chin / jail on day 1,
  most shops at night, mayor except day-3 night).
- **Mission bells** — from the street, **E4 north** (looking at the
  mission gable), click the belfry for `bell.mov` / `nitebell.mov`.
  Click each bell to ring it; click the frame to leave. Padre A2 north
  stairs `spotmovie ("towerup.mov")` (no tower SET). That MOV chains to
  `towertop.mov` (click the bell / look out the windows) then
  `towerdn.mov` — scripts never name the last two.
- **Walk forward** while that door is open — load the interior SET
  (or `gototown` back to the street tile you left).

`?clock=1|2|3` still sets the discrete slot. Night (`3`) loads `_NITE`
on the street; walking into the mission uses `_NITECOUR` / `_NITESCHO`.

---

## Doors and interiors

Dust does **not** walk you through a 3D doorway. The street still is a
closed door. Click (`pointin*` in 512×264, origin top-left) runs
`setupprop ("apoth")` etc.: one house-prop overlay + owner flag.
`closescene` (leaving the tile) calls `initprop` and hides it.
Forward (`uparrow`) while `propowner ("door")` matches calls
`gotointerior ("apoth.set")` or `gototown ("west")`. Both Resurrected
and Unlocked run those scripts; the overlay is bound to the still
it opened on — see [`src/play/README.md`](../../play/README.md) § HOUSE
door overlays. Do not blit `salout` / `chin` / `hotout` onto the next
camera.

`doors.ts` is the old hand-port (auto-walk stairs still consult it).
Street doors are SET `mousedown` / `lock*` / `setupprop`. Unlocked sets
`debugging` so every `lock*` returns false.

Shop **facades** are the east/west views on the north–south road (column 7),
not the G-row “looking down Main Street” stills. Click a door to open it
(click the overlay or walk forward to go in). Three tiles
have opposite facades: **L7** jail / curiosities, **E7** hotel / doctor,
**H7** saloon / stage. Stepping out keeps the tile you entered from,
facing **away** from the door (walked through it). On those shared tiles
you therefore look at the other shop.

| Street pose | What you see | Interior |
|---|---|---|
| **I7 E** | Watson’s Apothecary | `_APOTH` |
| **J7 E** | Bolivar’s Dry Goods | `_STORE` |
| **H7 W** | Hard Drive Saloon | `_SALLOWER` |
| **H7 E** | Stagecoach | `_STAGE` |
| **E7 E** | Cactus Bed Hotel | `_HOTLOWER` |
| **E7 W** | Dr. Rodham | `_DOCTOR1` |
| **F7 W** | Bank | `_BANK` |
| **L7 W** | Sheriff | `_JAIL` |
| **L7 E** | Curiosities | `_CHIN` |
| **D7 N** | Mission / court doors | `_COURT` |
| **F10 E** | Livery office | `_LIVERY` |
| **H4 W** | The Rattler (newspaper) | `_PAPER` |
| **G1 S** | Sidewinder undertaker / caretaker | `_UNDERTAK` |
| **I10 E** | Mayor mansion gate | `_MAYHALL` |
| J4 E | Saloon back door | `_SALLOWER` B4 |

Inside the mission, **C3 N** is the classroom (`_SCHOOL`, `_NITESCHO` at night). The classroom’s west door (A2 W) is the padre’s room (`_PADRE`). Original `lockpadre` only opens that overlay at night (`day ≥ 4` and `clock ≥ 3`); the inward sprite (`padre`, not `padreout`) has no day twin. Unlocked can open it in daytime school — the dark photo looks out of place; leave it. Dr. Rodham’s inner office is **doctor1 B1 W** → `_DOCTOR2`.

| Inside | Pose | Goes to |
|---|---|---|
| Saloon | D6 W (stairs) | `_SALUPPER` |
| Saloon upstairs | A1 N Ruby, A3 E Oona | `_SALROOM` |
| Hotel | D3 N (stairs) | `_HOTUPPER` |
| Hotel upstairs | C4 W (your room) | `_HOTROOM` |
| Mansion hall | C3 W study / C3 E dining / C3 N stairs | `_MAYSTUDY` / `_MAYDINE` / `_MAYUPPER` |
| Mansion upstairs | B1 N bedroom | `_MAYROOM` |

From the south gate: walk **north** up the road to the cross (G7). Shops
are **south** of that (H7, I7, J7 — turn east/west). Hotel / doctor / bank
are **north** of G7 (E7, F7). Jail / curiosities further south (L7).
The Rattler is **H4 west** (from G7 walk west to G4, then south to H4,
look west). Sidewinder’s is **G1 south** (west down G-street to the end,
look south). Mansion gate is **I10 east**. Livery is **F10 east**.

Interior scene tables are often **transposed** vs the framelist. `buildSetGraph`
swaps those names onto filmed cells (225-cell TOWN/NITE/TARGET stay put).

Interior stills use the same 5-motion + dest-HQ walker on that SET’s
graph. Interiors were re-dumped as `{frame0}_{offset}.png` like town.
HOUSE world overlays (doors, card tables, …) are 8-bit into the **current
SET** palette. Extract recolors any sprite that would bake HOUSE
unused-black. Skip a blit only when the sprite is a different door than
the facade still (hotel, chin, paper, undertak). Opening still works
(sound + walk in).

Stairs (`salup.mov` / `hotup.mov` / `mayup.mov` and the down reels) are
skipped: face the steps and walk forward. The mission tower is not that
pattern — Padre A2 north is `spotmovie ("towerup.mov")` with no tower
SET; `playmovie` chains `towertop` / `towerdn`. Room doors are click-then-walk.
Shared bedrooms (`salroom`, `hotroom`, `mayroom`) return to the door you
used. Sophie / Mazie / Buick / Laurel / Blood doors are knock-only in
Dust (no interior SET); they stay closed here.

Not in this pass: NPCs, sign movies, inventory keys. The mayor street
pose is the filmed **I10 E** gate, not unfilmed script tile J9.

`N` inside a building still flips the discrete clock; interior frames
do not swap (except you entered court at night).

---

## Code map

| File | Role |
|---|---|
| `types.ts` | Dirs, spawn, frame counts, `framesToPlay` |
| `graph.ts` | Load SET JSON, `hqFrame` / `holdFrame` / spawn |
| `extract.ts` | `/extract` locally, `VITE_EXTRACT_BASE` when hosted; hosted PNG fetches use the HTTP cache |
| `walker.ts` | Input → filmed transition |
| `playback.ts` | One-frame-per-tick strip clock (no catch-up) |
| `stillsView.ts` | Ortho blit + canvas cache; `pngImageData` scratch for Z/sprites |
| `media.ts` | `stillGate` (8) film; `bitsGate` (3) Z/sprites; current strip then dest depth-1 high |
| `film.ts` | Motion URLs; neighbor prefetch is plate 0 of each move, then plate 1… |
| `graph.test.ts` | Spawn, G11 HQs, 52 camera tiles |
| `doors.ts` | Hand-ported hitboxes, locks, SET hops |
| `sfx.ts` | `UNILIB` knock / door WAVs |

---

## Still open (outdoor / interiors)

- NPC knock-doors (Sophie, Mazie, Buick, Laurel, Blood) and sign movies
- NPCs / CST overlays / Z-buffers
- Free-roam shipped as Dust: Reimagined on this SET graph's 52 camera
  tiles (see [`src/reimagined/`](../../reimagined/README.md)); stills
  playback here stays 2D
- Exact original frame timing from `DF.EXE`
- Right-edge codec stripe; Yunni-box MOV decode
