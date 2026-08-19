# Outdoor stills walker

How the remake plays Dust’s filmed town. Extract layout lives in
[`dfextract/docs/`](../../../dfextract/docs/); this file is the
**playback** book we filled in while getting Diamondback’s streets to
match the original stills.

Default URL (`/`) is this walker. Graybox free-roam is `?mode=free` and
still uses the old inferred AABBs — it does **not** read the SET graph.

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
that appear as a framelist `from` or `to`. Doors / interiors / NPCs are
not wired yet.

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
`framesToPlay()` returns 5. Dust originally delayed that HQ reveal
~500 ms (JPEG-style sharpen). We show it **immediately** so the next
input is not blocked on a timer.

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

## Timing, input, and the freeze

| Knob | What we use |
|---|---|
| Motion rate | `STILL_FRAME_SEC = 1/12` (~12 fps). Close to Dust; not proven from `DF.EXE`. |
| Hitch policy | Advance **one** frame per interval. Catch-up would skip the walk. |
| HQ delay | None (original ~500 ms). |
| Input while busy | Queue **one** command. Ignore key-repeat; first keydown starts the step. |
| After a step | Flush the queue, else hold-to-repeat from currently held keys. |
| Dead / unfilmed move | No-op (no transition in the graph). |

If every neighbor strip prefetched at once, the current walk’s next PNG
sat behind dozens of HTTP requests and the walker **froze for seconds
after you were already idle**, then dumped the queued steps. `StillsView`
caps **3 inflight** loads and prefers `high` (current strip / HQ) over
`low` (prefetch). Promote a URL if it was queued low and is now needed.

Vite serves extract files at `/extract/…` → `dfextract/out/…`.

---

## Decode / dump (why frames looked corrupted)

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

### Remaining holes (do not invent pixels)

Some day stills still have black skip-holes. Example: **O7 facing N**,
the ox-skull sign. Night (`_NITE`) films the skull correctly. That is a
**different movie**, not a prior framebuffer for the day still. Feeding
NITE as `prior=` does not resurrect day pixels. Leave the hole. Do not
inpaint or invent filler.

A faint right-edge garbage stripe on some stills is a known codec
limit (`dfextract/docs/images.md`). Same rule: do not post-process.

---

## Controls (stills mode)

- **← / →** or **A / D** — turn
- **↑** or **W** — walk one filmed block
- **N** — swap TOWN ↔ NITE stills. Does **not** advance `day`.
- Click: left 22% turn left, right 22% turn right, top 48% walk.
  Bottom-center is unused (future door / interact).

`?clock=1|2|3` still sets the discrete slot. Night (`3`) loads `_NITE`.

---

## Code map

| File | Role |
|---|---|
| `types.ts` | Dirs, spawn, frame counts, `framesToPlay` |
| `graph.ts` | Load SET JSON, `hqFrame` / `holdFrame` / spawn |
| `walker.ts` | Input → filmed transition |
| `playback.ts` | One-frame-per-tick strip clock |
| `stillsView.ts` | Ortho blit + priority texture queue |
| `graph.test.ts` | Spawn, G11 HQs, 52 camera tiles |

---

## Still open (outdoor)

- Interiors, doors, click scripts
- NPCs / CST overlays / Z-buffers
- Free-roam toggle on **this** SET graph (255 units/tile), not graybox
- Exact original frame timing from `DF.EXE`
- Right-edge codec stripe
