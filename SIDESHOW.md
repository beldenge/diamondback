# The Sideshow

A container for non-canon joke modes built on Dust's extracted assets.
**Chicken Blaster** is the first attraction, and is **built**.

This describes what exists, not what was planned. Where the two disagree
the code is right and this file is wrong. Several decisions below reversed
earlier ones; the reversals are recorded because the reasons still apply.

Nothing here is a reconstruction of anything. It is a separate app that
happens to borrow the same sprites, sounds, film and street graph. The
engine reconstruction (Resurrected / Unlocked) does not know it exists.

---

## 1. The isolation rule

The constraint the rest of the design answers to.

> **Dust: Resurrected is a faithful reconstruction of DF.EXE. No Sideshow
> feature may add a line, a branch, a flag or an asset load to that path.**

The mechanism, not a promise:

| Layer | Files | Sideshow may |
|---|---|---|
| **Stateless film/geometry** | `src/world/set/**`, `src/play/facing.ts`, `src/play/occlude.ts` | **import freely** — pure functions, no game state |
| **Faithful engine** | `src/play/host.ts`, `game.ts`, `sandbox.ts`, `hud.ts`, `save.ts`, `src/vm/**` | **never import, never modify** |

`src/world/set/**` already imports nothing from `src/play/` — it is a
self-contained stills-walker that `play/` sits on top of. The Sideshow sits
on it the same way: **a sibling of `play/`, not a mode of it**.

**The Sideshow does not run the VM.** Chickens need a position, a walk
cycle and a death, not DreamFactory script interpretation. That is a few
hundred lines of ordinary TypeScript, and skipping the VM is what makes the
isolation cheap rather than aspirational.

Where a constant is genuinely needed from the far side it is **copied with
a citation** — the minimap's grid origin is three numbers out of
`play/hud.ts`, and copying them beat widening the wall for good.

`boundary.test.ts` walks every file under `src/sideshow/**` and fails on an
engine import, then walks `play/` and `vm/` and fails on a sideshow import.
Both directions, every run. Verified after every change: `git diff` shows
no file under `src/play/`, `src/vm/`, `src/world/` or `src/reimagined/` was
touched.

---

## 2. Why a separate mode, not a button in Unlocked

**Unlocked shares `host.ts` and `game.ts` with Resurrected.** Its sandbox
policy lives in a separate file but is *reached* through conditionals
inside the faithful engine. Hanging Chicken Blaster off that spawner means
new branches in the same 5,457-line file Resurrected runs through — the
only option on the table that forces edits into the faithful path.

Unlocked also has a purpose: an empty, fully-open town for exercising the
real engine. Waves of exploding poultry are not that.

### The landing page

One card per joke mode does not scale, so the chooser gains **exactly one
card, permanently**. `The Sideshow` opens a second-level chooser;
attraction twenty costs the landing page nothing. Its subtitle is **"A Tale
of the Weird West."**, one letter off the game's own tagline sitting a few
inches above it.

The card art is **Leroy mid-rile** — `PUP/_LEROY` Body frame 2, gritted
teeth and fists up, which is his "Before I get riled!" pose. A full-body
PUP expression frame carries its own face, so the Head/Eyes/Jaw stack is
switched off when compositing it.

The attraction card is the title, a real Quist line, and **a screenshot of
the mode actually running** — wave 5, the flock most of the way up Main
Street, revolver drawn. **No description.** A card that explains the joke
spends it before the player arrives, and an empty street does not say what
this is.

The landing card is a **wide banner**, half the height of a title card. Its
height comes from the image's own aspect and never from a `max-height` cap:
capping crops the plate to a sliver while the copy floats in the leftover
space, and the two fight.

### Routing

- `/?mode=sideshow` — the chooser
- `/?mode=sideshow&show=blaster` — straight into Chicken Blaster
- `clientMode()` gains one union member; `&show=` is parsed inside
  `src/sideshow/`, so attraction two never touches `core/`.
- **Esc backs out one level**, to the chooser. Leaving an attraction is not
  leaving the Sideshow.

### A latent bug the fifth card exposed

`body.landing` set `overflow: auto` **and** `height: auto` on the root,
making `<html>` its own scroll container sized to its own content — nothing
to scroll internally, and no propagation to the viewport because the
overflow is not `visible`. The page reported `scrollHeight > clientHeight`
and refused to move, by wheel *or* `scrollTop`. Four cards always fit, so
it stayed hidden. Fixed to `overflow: visible`.

### Files

```
src/sideshow/
  index.ts             mode entry + attraction chooser
  boundary.test.ts     the import wall, both directions
  blaster/
    game.ts            loop, render, input, waves
    flock.ts           chicken spawn / speed / drift over the SET graph
    chain.ts           blast propagation over tile adjacency
    waves.ts           wave table, boss schedule, ammo economy
    bosses.ts          the ten-boss roster
    score.ts           score, combo, ammo, run state
    gun.ts             aim band + sweep lookup for the first-person hand
    minimap.ts         panel geometry over the game's own town map
    project.ts         projection and depth without the engine's culls
    sprites.ts         CST/PRP sheets, stills, Z planes -> pixels
    audio.ts           SND/PUP playback on one AudioContext
    projection.test.ts end-to-end against the real extract, no browser
```

`import()`ed, so it code-splits: the four real titles never download it.
Measured at build: `sideshow` 2.4 kB, `blaster` ~31 kB.

---

## 3. Chicken Blaster

You hold Main Street at the south end of the saloon. Chickens come up it
from the town gate, fast. You have a revolver and a finite belt.

### Playfield

The 52 filmed camera tiles of `_TOWN`, walked with the existing
`src/world/set/` walker. No interiors; day stills only.

You start at **I8 facing south** — the tile past the saloon's street door
(`scene h7`). Everything enters at the **south gate, O7**, six tiles away:
the flock and the boss both, wherever you happen to be standing.

*This moved.* The first version started at the mission (D7), eleven tiles
out, which was a long wait at the start of every wave. Holding one end of a
street against something walking up it is a shape; watching it approach for
ten seconds is not.

### The frame is composited by hand

Not `drawImage`. The renderer copies the SET still into a 512x264 buffer,
then blits each sprite with `blitSpriteZ` against that plate's `FRAMES/z`
plane. Measured at wave 12: 30 birds project into the frame, **10 survive
the depth test**.

The colour plate and its Z must swap together (`stillZPairReady`) —
painting a new still while the previous plane is loaded draws everything
through walls for a frame.

The same pass fills a **pick map**, one sprite id per pixel, so a click
resolves to the exact sprite under the crosshair. Overlapping birds and
occlusion both fall out of it free.

**Scenery does not claim pixels.** The gun hand and the fireballs draw but
write their pick ids to a scratch buffer. Letting the hand own its pixels
made the nearest birds unshootable — the click landed on your own revolver.

### Seeing the whole street

Two separate engine limits had to go; fixing only the first looks like it
changed nothing.

1. **The distance cull.** `worldToStill` drops anything past `TILE_SPAN * 6`.
   `project.ts` is that projection with the far test removed, built from
   `facing.ts`'s own exported constants. Near and side culls stay.
2. **The saturating depth.** `exeSpriteZ` buckets `lensForward` into the
   SET's 24 levels and **runs off the end**: at eleven tiles it returns 45
   against a plane of 1..24, so every pixel fails and the sprite vanishes
   anyway. That saturation is *why* the engine culls at six tiles.

   `groundSpriteZ` caps at `Z_SKY` and then defers to the engine's own
   `actorBlitZ`. Sampling the plate justifies the cap: down Main Street the
   Z plane reads 3 at your feet, ~15 mid-street, and **24 from the horizon
   on** — past five tiles the film records the street as sky depth.

   Do **not** replace `actorBlitZ` with `min(computed, feet)`. That reads
   the plane at the hotspot and believes it, so a bird behind a facade
   inherits the facade's depth and draws through the wall. That regression
   shipped once.

### Moving must not wait on the film

The worst bug in the mode, with two causes.

**The decoder.** `decodeImageData` used an `Image` element. Measured on a
town plate: **19–142 ms**. Via `fetch` + `createImageBitmap`: fetch 1–2 ms,
decode 0.4 ms, readback 0.2 ms — **about 3 ms**. `onload` fires on load
rather than decode, and the decode then lands synchronously on the main
thread when you draw it.

A move needs six plates and six Z planes inside a 250 ms strip; at 80 ms
each that is nearly a second. The symptom is precise and worth
remembering: **sprites reproject every frame while the background sits
still**, so chickens appear to zoom past a static street.

Carried from the play modes' decoder: re-wrap a blob whose type is not
`image/*`, and never pass `colorSpaceConversion: "none"` — that turns
indexed SET PNGs black in Firefox.

**The await.** `tryWalk` awaited the whole strip before the camera moved.
Nothing needed it: `render` only swaps the displayed plate once it and its
Z are ready and otherwise holds the one on screen, so a late plate costs a
repeated frame, never a black one, and the walk is clock-driven.

Three changes:

- **Start the move now.** A turn begins in **0.1–0.7 ms**.
- **`preloadAround`** warms every plate reachable from the current pose —
  three strips out, three landing stills — `PRELOAD_WIDTH` at a time. Fully
  sequential could not keep up (a landing queues ~36 plates and auto-repeat
  starts the next move long before that drains); all at once janks the
  frame being looked at, since these decodes read pixels back on the main
  thread.
- **Starting a move abandons the speculative queue.** Its plates are
  guesses; the move's twelve are needed inside 250 ms.

Measured after: cold strip 217 ms (inside budget), preloaded 0 ms, and a
traced move shows camera index and plate index in lockstep with **zero
desync frames**.

Movement also accepts **key auto-repeat** — holding a direction keeps
walking, and `tryWalk` no-ops mid-strip. The toggles still ignore repeats.

### The gun hand

`PRP/_HOUSE` group `gunhand` is the original's own first-person hand,
authored as a grid: five aim bands (`low`, `lowmid`, `mid`, `midhi`, `Hi`)
of **thirteen frames each** sweeping the barrel left to right, plus a
`…fire` and `…recoil` row per band. Aiming is a lookup — Y picks the band,
X picks the frame. A shot holds fire for two 20 Hz frames, recoil for
three.

**Anchoring.** Every band is anchored to `bottom = 291` in the 512x384
sheet — it hangs off the bottom edge of the 264-tall window. A screen prop
uses its sheet coordinates *as* screen coordinates, which is what
`projectWorld` does for a `screen` prop. Re-centring it on the still's
midline leaves the hand floating with a gap beneath it.

The aim row is `Hi` but its own rows are `hifire` / `hirecoil`; every
lookup is lower-cased.

### The minimap

**The game's own town map** — `FLT/_NEW/frame_6.png`, the plan that pops up
when you click MAP on the dashboard. DIAMONDBACK, POPULATION: 248, compass
rose, every building labelled.

It is a literal plan on the same 15x15 grid the SET table uses, and the
engine knows where each tile lands: NEW.FLT `openflat` puts its cross at
`scenecol * 20 + 222`, `scenerow * 20 + 93` (0-based). Verified against the
artwork: tile (6,14) lands at (342, 373), the bottom of Main Street, which
is where the gate is drawn.

*This was wrong first.* The initial version used `MOV/_JAILMAP`, the
territorial map off the jail wall. It is a lovely plate and **not a town
plan** — it shows towns, not streets. If the real asset seems missing, look
harder before inventing a substitute.

Bottom-left, where the gun hand never covers. Birds red, bosses larger
yellow, you a wedge pointing where you face. **Toggles** on `M`, the `×`,
or the `MAP` chip — checked before the belt, so opening it never costs a
shell.

### The HUD is drawn at monitor resolution

Chrome does **not** go into the film buffer. Blowing that buffer up
nearest-neighbour is the whole look, but chrome drawn into it inherits
that: at a typical window the stage is scaled ~7x, so a 104px map panel had
104 real pixels of the town plan in it and read as mush.

`drawOverlay` paints the HUD and map onto the display canvas under the same
letterbox transform, so coordinates stay in still space and hit-testing is
unchanged. (`putImageData` ignores that transform — anything that must
scale with the film goes into the frame buffer instead.)

### Contact shadows

A CST sprite carries its foot pancake as `(0, 0, 0, ~120)` and
`blitSpriteZ` preserves that alpha, because the play modes hand the buffer
to a texture where it blends. This stage canvas is `alpha: false`, forcing
every pixel opaque — an untouched shadow lands as a **solid black slab**.
Invisible under a chicken; a hole in the street under a boss.

Decode with `restoreShadow: false` so the 120 survives (`restoreSpriteAlpha`
was flooring it to 255), then `blendContactShadows` composites every
sub-255 pixel back over the film plate, still intact in its own buffer.

### Waves

Two beats:

1. **The flock.** Wave *n* is `n * 8` chickens **fed in through the gate a
   few at a time** rather than dropped on the map at once — they come up
   the street as a stream you watch arriving, which is what makes it a wave
   rather than a hunt.
2. **The boss.** Once the last chicken is down, whatever is waiting walks
   in. The wave is not over until it is.

Running them together buried the boss in poultry and let a lucky cascade
end the wave before you saw what arrived.

Birds move at `BIRD_SPEED` — a tile every ~1.7s — and lean toward you as
they wander (`BIRD_DRIFT`; 0 restores pure milling).

**No "Wave N" banner.** The HUD already reads WAVE N, and a card over the
street at the moment the first birds come through the gate hides the thing
it announces.

### Chain reactions

A chicken that dies detonates every chicken within **1 tile of SET-graph
adjacency**, which detonate their own neighbours.

**Stagger each hop by ~80 ms.** A design requirement, not a tuning value.
One frame is a bang; staggered, the cascade visibly crawls down Main Street
tile by tile and dead-ends where the filmed street does. Do not "fix" a
slow-looking chain by setting this to 0.

**Blast decay.** Found by playing: past about wave 8 the flock is dense
enough that tile adjacency links nearly all of it into one component, so
**every** shot cleared **every** bird. Measured at wave 12: one bullet, 96
birds, 43,200 points, wave over — which kills the ammo economy outright.

A neighbour's chance of catching now decays per hop (`CHAIN_DECAY`, floored
at `CHAIN_MIN_CATCH`). Hop 1 always catches and the tail stays long enough
that a street-clearer is still possible — the rare payoff instead of the
default. Same shot after: 18,000 points, 47 of 96 still standing. A bird
the blast reaches but does not light stays in the pool, so a later hop can
catch it from another direction.

### Ammo, not health

**The player takes no damage and cannot die.** No health value exists in
`score.ts`, and a test asserts its absence.

Pure no-fail goes flat around wave four, so the pressure is **ammo**. The
belt starts at 24. Clearing a wave pays `10 + wave/3`, and **each boss pays
its own `AMMO_PER_BOSS`** — from the second lap a wave brings two or three,
each soaking its own shots, and without a per-kill refund a doubled wave
costs double the belt for one payout. The run would die to arithmetic.

Rejected: a wave timer. It rushes the player, and the player should be free
to stop and admire the cascade.

### Losing, and going again

The belt running dry ends the run, over **`MOV/_DIEH3`** — 19 plates of the
stranger propped upright in an open coffin in the undertaker's parlour. Its
own `timeline.json` gives the 291 ms hold rather than a made-up rate, and
the reel is warmed on the first click so it never stalls the one frame the
player is guaranteed to watch.

(`_DIES3` is the knife, `_DIES1` the scorpion, `_DIEH1`/`_DIEH2` the
hanging. `_DIEH3` is the only reel with a coffin in it.)

The wash over it is light — the parlour is already dark, and another 55% of
black left the coffin invisible; the text carries its own shadow instead.
The minimap is hidden; nothing on it is live.

**Click to go again** — fresh belt, wave one, back at the saloon. But not
for `DEATH_CARD_GRACE_MS`: you die *while shooting*, so the click that
killed the run is followed by two or three already in flight, and without
the guard the card is dismissed before it can be read. The prompt only
appears once it will actually work.

---

## 4. Bosses

**Every wave has a boss**, and the roster is **ten deep**, so ten waves
pass before anything repeats.

| # | Boss | Sheet | Notes |
|---|---|---|---|
| 1 | **The Big Bird** | `chicken1`: peck / stand / walk | The straight one. |
| 2 | **The Hog** | `pig`: grunt / stand / walk | The mobile bruiser. |
| 3 | **The Cow** | `cow`: **down / up only** | Cannot walk. A siege engine: it lies down, then stands up at you. |
| 4 | **The Horse** | `horse1`: head / stand / tail | Idles only. It stands there flicking its tail while you empty a revolver into it. |
| 5 | **Leroy** | `Leroy`: stand, walk, **drink (32)** | Walk → drink → walk. The swig really is in the extract. |
| 6 | **The Bounty Hunter** | `bounty1`: lowwalk (64), cock, fire, todie, dead | The richest sheet in the extract. |
| 7 | **The Automaton** | `dummytarg`: gunspin / twitch / headspin / hatflip | The range's mechanical gunfighter, raised by `robotup`. No walk cycle. |
| 8 | **The Skeleton** | `skeleton` (`_MINE`) | An underground payoff, so it belongs to the Yunni thread. |
| 9 | **The Yunni Shaman** | `shaman`: stand / walk | The only Yunni figure with a walk cycle. |
| 10 | **The Kid** | `Kid`: stand, walk (64), dead | The lap's closer. |

The lap has a shape: farmyard (1–4), Leroy at 5, the gallery's oddities
(6–7), the underground (8–9), the Kid last.

**Design each boss around the poses it actually has.** The sheets are
wildly uneven and the constraint is funnier than the workaround: a cow that
cannot walk is a better siege engine than any faked charge, and a
forty-foot horse doing nothing is better than a pretend gallop.

*The Bounty Hunter replaced a giant gila monster.* `gilatarg` is a 31px
sprite with two authored facings and read as a blur at boss scale —
blowing a sprite up does not add detail that was never there.

### Size

**One fixed, enormous size — not a per-wave ramp.** Growing them each wave
sounds like escalation and plays like inconsistency: you never learn how
big the thing coming through the gate is, and past a point it is a wall of
texture rather than an animal.

It is a constant `sheetHeight * scale` product (`BOSS_SCALE_UNITS`) rather
than a flat scale, because a chicken frame is 71px tall and a horse 301.
The same scale on both draws the horse four times the size; dividing by the
sprite's own height lands every boss at the same on-screen height.

### Escalation is by number

One boss on waves 1–10, **two at once on 11–20**, three on 21–30. A
doubled wave is **the same boss twice** — two giant cows, not a cow and a
pig. A matched pair reads as "more of that thing"; a mixed bag reads as
noise. They fan across the gate so they do not merge into one mass.

### Movement

Walkers move at the flock's own pace (a test pins them within half a
`BIRD_SPEED` either side). A boss that ambles while the birds sprint reads
as scenery. The Cow, Horse and Automaton are at **zero** — none has a walk
cycle. That is the design, not an oversight.

Pose names are **not consistent across sheets**: most casts say `walk`, the
bounty hunter's is `lowwalk`. Movement matches on the substring
(`isWalkPose`) or a boss moonwalks the moment a new sheet spells it
differently.

### One sheet does not follow the hotspot convention

Almost every CST actor is drawn standing *above* its hotspot with its feet
near it. `dummytarg` is not: boxed at `y=168, h=156`, it hangs **132px
below** the hotspot, because for a range dummy the hotspot is the point it
rises from behind the counter. On the street it rendered below ground and
the depth test ate all but a 15px sliver. `BossSpec.anchor: "bottom"`
re-anchors it. Check a new boss's sheet box before assuming it stands up.

### Placement and death

Every boss enters at the **gate**, like the flock, wherever you happened to
be standing. The walkers come up the street; the cow, horse and Automaton
hold the far end and you go to them.

A boss going down is a 4x fireball and nothing else — **no "X DOWN" card**.
A boss the size of a building going up is not something the player needs
told. The flock is already clear, so there is nothing to chain into.

---

## 5. Sound

**No boss repeats a bark.** Four speak exactly once, on arrival:

| Boss | Clip | Line |
|---|---|---|
| The Big Bird | `PUP/_QUIST/AUDIO/scaring chickens` | *"You're scaring the chickens!"* |
| Leroy | `PUP/_LEROY/AUDIO/leroy.1` | *"This thing's empty. I'm gonna whip your damn ass!"* |
| The Shaman | `SND/_MISSION/spirit` | the voice from under the mission |
| The Kid | `PUP/_KID/AUDIO/kid.2` | *"You're pathetic!"* |

Quist's is the line the mode is named after, and the extract's own
identifier for the clip is literally `scaring chickens`. The Automaton gets
`robotup.wav`, machinery rather than a voice.

**Getting hit.** Animals use the gallery's per-species impacts. The
**people get a voice** — a hit that goes "thump" on a man reads as hitting
scenery — and every cry is that character's own recording, found by
grepping each cast's `texts.csv` for exclamations:

| Boss | Clip | Transcribed as |
|---|---|---|
| Leroy | `PUP/_FEAR/AUDIO/fear.83b` | *"\*leroy screaming"* |
| The Kid | `PUP/_KID/AUDIO/kid.25` | *"Aaagh!"* |
| Shaman, Bounty Hunter | `PUP/_DEAD/AUDIO/deadn.3` | *"Aagghh!"* (0.79s) |

Bones and machinery keep an impact. A cry runs about a second, so it is
held off by `HIT_CRY_COOLDOWN_MS`; firing one per trigger pull stacks into
mush.

**The gunshot is `SND/_BOUNTY/shotgun.wav`** (0.56s). `SND/_TARGET/draw.wav`
sounds like it should be the draw and is a **2.83-second voice line** —
unbearable at a shot every half second. `rifleshot.wav` is a real gunshot
but runs 1.53s. **Check a WAV's duration before assuming a name means what
it says.**

### Two bugs the one-shot lines exposed

**A leaking voice counter.** Voices were released on `onended` alone, but a
source whose context gets suspended may never fire it, and every leaked
voice permanently lowers the ceiling. Symptom: early sounds fine, and by
wave ten a one-shot silently dropped. Release is now also on a timer.

**The cap itself.** Arrival lines and hit cries play as `important`,
bypassing the cap. Losing one chicken pop out of forty costs nothing; a
boss's only line is not interchangeable with a pop.

**Background music was tried and reverted.** `SND/_SALOON3/saloonsep.snd`
is 110 seconds of saloon piano and loops well, but a bed under a shooting
gallery is a taste call and the mode is busy enough without one.

---

## 6. Controls

| Input | Action |
|---|---|
| Click / tap | Fire — and on the death card, go again |
| Arrow keys or WASD | Turn, walk a filmed block (auto-repeat works) |
| Swipe (touch/pen) | Drag to turn, up to walk |
| `M`, or the corner box | Show / hide the map |
| `S` | Sound on / off |
| `Esc` | Back to the Sideshow chooser |

`S` for sound rather than `M`, because `M` belongs to the map.

---

## 7. Assets, all confirmed present in `dfextract/out/`

**Death is the powder keg's blast**, not a feather puff.
`PRP/_HOUSE/FRAMES/powderkeg1/explode/` is 15 plates growing to 339x264.
**Plate 0 is skipped** — it is the *intact barrel*, which is right when you
shot a keg and very wrong when the thing that died was a chicken.

`CST/_TARGET/chickexplode/` (5 frames; its whole script is `code stop ()
actorvisible (me, false) endcode` — it plays once and deletes itself) is
still a lovely thing and is **not used**: feathers where this wants a
fireball.

**Dialogue text** lives in `PUP/<cast>/AUDIO/texts.csv`, column `Text` —
3,420 written lines keyed to the WAV identifier. Quote these; do not invent
dialogue when the real line exists.

**PUP puppets are layered** (`FRAMES/sprites.json`): Background, Body,
Head, Eyes, Eyebrows, Nose, Jaw, arms, hands. `rest` gives each layer's
hotspot centre and `restLayers` the default frame. Composite by placing
each frame at `restCentre + (frame.xy - (256,192))` on a 512x264 canvas —
treating the frame's x/y as an absolute top-left puts the nose over the
eyes. The `Body` layer holds whole-face expression poses that replace the
head stack entirely.

**Unused, sitting there**: `towertarg`, `vanetarg`, `gilatarg`,
`can1`–`can3targ`, `bottle1targ`, `target1`–`target7`, `water1`–`water3`,
and most of `_GANG`.

---

## 8. Deferred

- Night variant on `_NITE` stills.
- Chicken Blaster 3D in Reimagined, with real AABB bodies and impulse.
  Different attraction, same wall.
- Persistent high scores. Must use its own storage key — it may not touch
  the Resurrected autosave or `.json` save format.
- Further attractions: Giant Mode, Wanted: You (`wantedBoard()` plus an
  uploaded face), the Diamondback Nickelodeon (MOV reels on a 3D wall).
