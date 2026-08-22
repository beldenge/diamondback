# Outdoor stills walker

How the remake plays Dust’s filmed town. Extract layout lives in
[`dfextract/docs/`](../../../dfextract/docs/); this file is the
**playback** book we filled in while getting Diamondback’s streets to
match the original stills.

Default URL (`/`) is this walker. There is no free-roam mode yet.

---

## What the town actually is

Dust’s outdoor Diamondback is a **tile + facing camera graph**, not a
3D mesh. Each legal pose is one filmed 512×264 still. Walking or turning
plays a 6-container filmstrip, then you stand on another pose.

| Fact | Value |
|---|---|
| Grid | 15×15, scenes A1–O15 (225 cells) |
| Filmed / camera tiles | **52** (from `transitions.json`, not `blocked`) |
| Coordinate space | +x east, +y south |
| Facings | 1=N, 2=S, 3=E, 4=W |
| Still size | 512×264 indexed PNG |
| Day / night | Same graph; `_TOWN` vs `_NITE` stills |
| Spawn | Scene **O7** facing **N** (south gate under the sign). Fallback `{x:6,y:14,facing:N}` |

The 225-cell `scenes.json` table is **not** the walkable graph. Many
cells are blocked or never filmed. `cameraTiles` is the set of nodes
that appear as a framelist `from` or `to`. Play-mode `walktostar`
(Leroy to the range) BFS those same 52 tiles; see
[`src/play/README.md`](../../play/README.md).

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
`framesToPlay()` returns 5. After the last motion frame we hold ~500 ms
(`HQ_REVEAL_DELAY_SEC`) on that LQ plate, then swap in dest HQ (Dust’s
JPEG-style sharpen). A new walk or turn during the wait cancels the
swap; input is not blocked on the timer.

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
| Motion rate | `STILL_FRAME_SEC = 1/24` (~24 fps). Five motion frames ≈ 210 ms. |
| Hitch policy | Advance **one** frame per interval. Never skip. If a PNG is not ready, hold until it is. |
| HQ delay | `HQ_REVEAL_DELAY_SEC = 0.5`. Last LQ frame stays up; dest HQ after that. A new step cancels it. |
| Input while busy | Ignored **during the strip**. After the strip, input is live (including during the HQ wait). Hold-to-repeat after the step if the key is still down. |
| Dead / unfilmed move | No-op (no transition in the graph). |

On keydown the first motion frame paints immediately if it is already
decoded. While you stand, we prefetch depth-1 neighbors (left / right /
forward strips + their dest HQs). The rest of the current strip loads
in the background. If a PNG is missing when the clock wants it, **wait**
— do not skip. Textures are `ImageBitmap`s; the GPU cache evicts after
80 stills (~42 MB RGBA). That is not the film: `TOWN.SET` is ~60 MB of
8-bit deltas; the PNG dump is ~115 MB; keeping every town still as RGBA
would be ~1.7 GB.

Locally, Vite serves extract files at `/extract/…` →
`../../../dfextract/out/…` with `Cache-Control: no-store` so a re-dump
shows up on reload (no `?v=` cache-buster). Hosted Pages builds prefix
the same relative paths with `VITE_EXTRACT_BASE` (CloudFront). See
`extract.ts`.

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
- **N** — swap TOWN ↔ NITE stills. Does **not** advance `day`.
- Click: left 22% turn left, right 22% turn right, top 48% walk.
  A door hitbox wins over walk/turn.
- **Click a door** — if the lock function says openable, overlay the
  house-prop sprite and play `dooropen*`. Click again to close.
  Locked doors play `knock*` and stay shut (chin / jail on day 1,
  most shops at night, mayor except day-3 night).
- **Walk forward** while that door is open — load the interior SET
  (or `gototown` back to the street tile you left).

`?clock=1|2|3` still sets the discrete slot. Night (`3`) loads `_NITE`
on the street; court uses `_NITECOUR`.

---

## Doors and interiors

Dust does **not** walk you through a 3D doorway. The street still is a
closed door. Click (`pointin*` in 512×264, origin top-left) runs
`setupprop ("apoth")` etc.: one house-prop overlay + owner flag.
`closescene` (leaving the tile) calls `initprop` and hides it.
Forward (`uparrow`) while `propowner ("door")` matches calls
`gotointerior ("apoth.set")` or `gototown ("west")`.

We hand-port that table in `doors.ts`. We do not interpret DreamFactory
scripts at runtime.

Shop **facades** are the east/west views on the north–south road (column 7),
not the G-row “looking down Main Street” stills. Sandbox: every door is
unlocked. Click a door to open it (click again to close). Walk forward
while it is open to go in (plays the matching `doorclose*`). Three tiles
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

Inside the mission, **C3 N** is the classroom (`_SCHOOL`, `_NITESCHO` at night). The classroom’s west door is the padre’s room (`_PADRE`). Dr. Rodham’s inner office is **doctor1 B1 W** → `_DOCTOR2`.

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
Some `setupprop` states have no usable overlay: missing PRP PNGs
(`pharm`, `salout`, …), solid-black extracts (court / school / padre),
or a sprite that does not match the facade (hotel double doors, Rattler
glass, Sidewinder, curiosities). The door still **opens** (state + sound);
we skip the blit.

Stairs (`salup.mov` / `hotup.mov` / `mayup.mov` and the down reels) are
skipped: face the steps and walk forward. Room doors are click-then-walk.
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
| `extract.ts` | `/extract` locally, `VITE_EXTRACT_BASE` when hosted |
| `walker.ts` | Input → filmed transition |
| `playback.ts` | One-frame-per-tick strip clock (no catch-up) |
| `stillsView.ts` | Ortho blit + texture cache (no priority queue) |
| `graph.test.ts` | Spawn, G11 HQs, 52 camera tiles |
| `doors.ts` | Hand-ported hitboxes, locks, SET hops |
| `sfx.ts` | `UNILIB` knock / door WAVs |

---

## Still open (outdoor / interiors)

- NPC knock-doors (Sophie, Mazie, Buick, Laurel, Blood) and sign movies
- NPCs / CST overlays / Z-buffers
- Free-roam later, on **this** SET graph (255 units/tile), not a second inferred map
- Exact original frame timing from `DF.EXE`
- Right-edge codec stripe; Yunni-box MOV decode
