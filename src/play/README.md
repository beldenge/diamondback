# Play mode (`/?mode=play`)

How the remake runs Day 1 night: original HUD under the stills, CST actors,
PUP talking-heads, world props, night FX, and spot-movies, all driven by
extracted DreamFactory scripts (boot → `advanceday` → SET/CST/PRP). Extract formats live in
[`dfextract/docs/`](../../dfextract/docs/). This file is the **playback**
book so we do not re-debug speech, visemes, the Firefox audio delay, or
world→still (X, Y, scale, Z, pans).

Town sandbox (`/`) stays an unlocked stills walker:
[`src/world/set/README.md`](../world/set/README.md).

---

## First evening (boot → scripts)

Play mode runs extracted `boot()` then stage `advanceday()`. That is
Day 1 night (`clock = 3`, `$5`, `nite.set`, script scene `g15` =
filmed **O7** north). Do not hand-place Leroy or unlock doors — CST
`initactors`, PRP `initprops`, and SET scene `lock*` procs are the
gates.

Town **script** names are column-letter + row (`scene g12` = filmed L7
jail). SET Pascal names in `scenes.json` are the transpose (`Scene L7`).
`currentscene("scene g15")` must not `sceneByName` Pascal G15 at (14,6).
Code: [`sceneName.ts`](sceneName.ts).

| Kind | Day 1 night |
|---|---|
| People | Leroy at the sign. Help after the dog. Jones after Help’s ring. Hotel: Fear + Laurel. Saloon: Gus, Oona, Isao, Trotter. |
| Animals | Dog on the street. Pig. Horses / cow if `random` says so. No chickens (day-only). |
| Ground items | Jug at `town.jug` (after Leroy walks off). Bone at `town.bone` (Help’s day1 script). |
| Sky / extras | `shootingstar` (night). Tumbleweeds are **day** (`clock != 3`). |
| Ambience | `night.snd` + looping `town.snd`. `nightfxs`: saloon bed, chin chime, then owl / coyote / cricket. |
| Click movies | South-gate rules / firearms (`nitewarn` / `nitefire`), shop signs, `dog1` / `dog2`, item inspects. Intros skipped unless `?intro`. `dog1.mov` is a 59-tick overlay whose table stamps the same 0.88 s growl twice 100 ms apart; playing both in one pass stacks. Play two sequential passes (lunge + one growl, then again). |
| Locked | Jail, chin (until `phase >= 2`), bank, apoth, store, doctor, stage. Hotel + saloon open. |

`currentview()` / `currentdir()` return `north`/`south`/`east`/`west`
(scripts compare those words; a raw `N` never matches). After a walk,
`currentscene` stays on the script name (`g12`), not Pascal `l7`.

`random (n)` is **1..n** (Dust `findscene`, `scream1..3`, `town.extra1..3`).
The night pig stays in the day-1 farm (`b11`–`c12` / `chicken`=`d11` / `e11`–`e12`).
`chicken` in the SET table is (10, 3); script space transposes that to (3, 10)
so `adjscene` can walk the pen instead of falling through to the player tile.

World sprites paint far-to-near (Leroy in front of the dog/jug). The
held item (`#play-hand`) is a canvas stamped from decoded sprite bits
(so a new item is not the previous bitmap stretched to the new size).
It hides during puppet UI and inventory. Inventory places owned INVEN
props via `moveyoself` on the avatar flat.

HUD chrome (map / skull menu / portrait) is hit-tested before script
`mousedown`, so a held jug at (316, 320) cannot steal those clicks.

Clicks go through boot `mousedown` → `hittest` (actor / prop / scene).
Empty still still uses the remake 22%/48% walk bands (Dust used chrome
outside 0–512). `passcode` from a scene proc falls through to the SET
keydown (walk), not to `new.flt`’s options `mousedown`.

---

## Stage

Dust’s stage is **512×384**. The still is **512×264**; the HUD is the bottom
**120px** (`FLT/_NEW/frame_3.png`). Do not overlay the HUD on the still.

## Dialogue chrome

Speech is a **full-width black bar** (40px) sitting on the HUD, overlaying
the still/puppet. GDI `DrawTextA` / `TextOutA` is left-aligned (same as
the bevel labels); face is **Arial**. Click the bar to skip a line. Do
not keep a Continue button on the still. **C** hides or shows the bar
(audio and visemes keep going).

Choices are **five horizontal bevels** that **replace** the HUD band
(24px × 5 = 120), not floating above it. Not Windows/Mac buttons:
`DF.EXE` never creates a `BUTTON` class; it `BitBlt`s HOUSE `butbevel`
(72×23, 3px dark/tan rim, **transparent hole**) and draws labels with
GDI `CreateFontA` / `DrawTextA` / `TextOutA`. Face name **Arial** is in
the EXE. Labels are left-aligned. The hole is filled with the rim’s
dark brown `(111, 56, 38)` — the sprite has no fill of its own; do not
paint it black. Empty slots stay blank bevels so it always reads as
five boxes — including during speech, from `openpuppetfile`, not only
after `puppetbevel`. Hide the leather dashboard whenever the puppet UI
is up (`#play-stage:has(#puppet-ui:not([hidden])) #play-hud`).

---

## Town CST

CST `actordeg` / `currentdeg`: **256 units per turn, 0 = south**. Stand is 8
facings; walk is 8 facings × 8 frames. Drink is 32 frames (8 dirs × 4).
Visible octant is `(camOct - actorOct + 4) & 7` — CST east/west plates
face *left* for east, so the other sign moonwalks a north-view east walk
(K7 corner to the range). Front/back are the same either way.

Idle is Leroy’s script, not a remake fidget. `setupactor("sign")` ends in
`endwalk` → `leroyidle`. Each tick (`makeloop` delay 20 at `framerate (3)`
= 1 s): 8% `actorpose ("drink")` then `toidle` after 25 frames; if
`realdist < hotdist()` (384 in town) `turntodeg` toward `cameraxyz`;
otherwise `actordeg + 2` (slow pivot). `playerxyz` is the tile center;
`cameraxyz` is one tile behind the feet on the view axis so `calcdeg`
faces the lens (O7 N looks south, not the 76-east diagonal). When the
player steps or turns, standing actors’ idle loops fire on the next
script frame — do not wait a full second, and do not freeze turns during
a SET walk (`talking` is only `mousedown`). Do not snap deg; `turntodeg`
still animates.

Talk approach is `walktopuppet`: in town he walks to `playerxyz` facing
that vector (straight-on toward the camera), then `turntodeg (currentdeg
+ 128)`. Scripts `stoploop` for the walk. Do not spin during the walk.
Dust’s VM is single-threaded: `cursor ("watch")` then `while iswalk {
forceupdate }` — no nested mousedown/keydown, no player SET walk, no HUD
map/inven. Play sets `talking` for that blocking script so our async
`forceupdate` cannot let clicks through. SET filmstrips use `busy`, not
`talking`, so standing idle still runs when *you* walk.

A **star** is a named SET pin (`waypoints.json`, 256 units/tile in the EXE), not a
sprite. `actorstar` copies that xyz. Do not invent a nearby xyz if a
name looks missing — 50-byte records hold two stars; `town.leroy1` is
slot B of `town.leroy2`.

Named `walktostar` does **not** beeline and does **not** BFS camera
tiles. `DF.EXE` `0x424000` loads the SET polyline in the waypoint
record’s +0x18 container for **that star pair** (any actor, any SET).
Points run A→B; going B→A reverses them. Extract: `SET/_<PLACE>/paths.json`
(TOWN/NITE have 12 pairs; interiors that authored a path have 1–3).
Explicit `"x,y,z"` strings stay a beeline (town `walktopuppet`). Hops
use `calcdeg` to the next vertex. `currentdeg + 128` is only the talk
beeline.

Worked example — Leroy `walkout` → `town.leroy2`: pair container **262**,
range (2656, 2720) → … → (1664, 3476) → sign (1740, 3536). Walkout
reverses; first hop from the sign is **(1664, 3476)**, then
**(1632, 3388)** north along x=1632.

`actorspeed` is world units per **game frame** (`stdactor` copies
`stdspeed` of the actor’s set: town **3**, hotlower/sallower **4**, else
**5**; mine extra **4**). Boot `framerate (3)` waits 3 ticks of the 60 Hz
`timeGetTime` counter (`0x40e1d2`) → **20 Hz**. Town 3 → 60 units/s, not
180. Walk poses use **that actor’s** CST setInfo +0x2e table
(`CST/_<CAST>/timing.json`) on the same 20 Hz draw. GANG 8-pose walks
are 16 slots (two frames per pose). EXTRA pigs/chickens are 4 slots
`[1,1,2,2]`. Do not invent a Leroy-only clock.

CST sprites: native frames are ~200px with hotspot (256, 192) on the 384
stage — that is 1:1 **on the camera plane**. `stdscale("town")` is **1450**
(`CST/_GANG/Cast.txt`). Leroy at the sign is **`actorscale (me, 1100)`**
after `stdactor` (`CST/_GANG/Leroy/Script.txt`). Indoor sets use 2400–5800.

Day-1 stand is `setupactor("sign")` → `actorstar (me, "town.leroy1")` at
**(1740, 3536)** (76 east, 176 north of O7’s tile center in 256-unit
tiles). `town.leroy2` (2656, 2720) is the range. CST in-world blit uses
the same hotspot as PUP: header `pos_x`/`pos_y` are top-left when the
hotspot is (256, 192). Scale that offset by the still scale; do not
`translate(-50%, -100%)` on the bbox. ¾ frames are not centered on the
hotspot.

World → still is **locked**. Do not invent a second projector. The
trap: 1/z Y/scale/Z looks fine for **far** actors (Leroy at the O7
sign sits in SET Z=5) and fails on the **same tile** (N7 E jug and
Help). Full book: **World → still** below.

### World → still (locked — do not re-debug)

Code: [`facing.ts`](facing.ts), [`occlude.ts`](occlude.ts). Tests in
`facing.test.ts` / `occlude.test.ts`. Binary: [`dustdecompile/docs/findings.md`](../../dustdecompile/docs/findings.md)
§7a. SET header: [`dfextract/docs/file-types.md`](../../dfextract/docs/file-types.md).

There are **three** cameras. Do not collapse them.

| Name | World point | Used for |
|---|---|---|
| Feet / `playerxyz` | `tile * 256 + 128` | Scripts, walk dest, draw-order forward |
| Draw lens | feet minus `calcvect(facing, 64)` | **Screen X, Y, dest size, sprite Z** |
| `cameraxyz` | one **full tile** behind the feet | Idle `calcdeg` only. Not placement. |

CST and PRP share this projector (`0x415213` / `0x428173`). Skip a
sprite if lens-forward `≤ 0` or `< 32` or `> 6×256`. Integer `idiv`
truncates toward 0.

| Piece | Formula | Pin |
|---|---|---|
| **X** | `256 + 310 * right / lensForward` | O7 N Leroy **354** |
| **Y** | `132 − 310 * (objZ − 62) / lensForward` (ground z=0) | N7 E jug hotspot **279** |
| **Size** | `bbox * actorscale * field / (1000 * lensForward)` | GANG field **114**, INVEN jug **96** |
| **Sprite Z** | `(lensForward − zclip − setback + 128) >> 6` | O7 N Leroy **4**, N7 E jug **3** |
| Draw | pixel if `spriteZ ≤ stillZ` (smaller = closer). At most **one** SET plane closer if the hotspot is dirt. Never unconditional `min(hotspot Z)`. |

Blit top-left from DFET hotspot (256, 192) plus header `pos_x`/`pos_y`,
scaled. A hotspot **below** 264 still paints onto the still; do not
clamp Y into 0..264 and do not treat “off the plate” as hidden. The
actor layer **is** the still (top 264 of the 384 stage), under the HUD.

SET filmstrip (`0x40dd90`): 5 motion frames then dest HQ as the last
plate. Walk: lerp feet `index*64` (`t = index/4`). Turn: keep XY, yaw
look-deg `index*16`, **reproject** with the table above every plate.
Draw sprites **after** the still advances. If the next PNG is not
ready, hold the previous plate’s camera. Facing codes **1=N 2=S 3=E 4=W**.

**Oracle A — O7 N Leroy** (`town.leroy1` = 1740, 3536, `actorscale` 1100):

```
feet     = (6*256+128, 14*256+128) = (1664, 3712)
lens     = (1664, 3712+64)          = (1664, 3776)   # looking N, +y south
right    = 76
forward  = 240
x        = 256 + 310*76/240         = 354
y        = 132 + 310*62/240         = 212
z        = (240 − 32 − 64 + 128)>>6 = 4
```

Original DOSBox shirt midline **353**. `idiv` truncates to 354.

**Oracle B — N7 E jug** (`town.jug` = 1730, 3476, `propscale` 800, zclip 0):

```
feet     = (6*256+128, 13*256+128) = (1664, 3456)
lens     = (1600, 3456)             # looking E, setback west 64
right    = 20
forward  = 130
x        = 256 + 310*20/130         = 303
y        = 132 + 310*62/130         = 279
z        = (130 − 0 − 64 + 128)>>6  = 3
```

N7 E dirt is SET Z **3**. 1/z sprite Z was **4** → jug vanished
(`4 ≤ 3` fails) and Help punched through the picket. Facing **south**,
engine Y is ~361 (under the HUD); the overlay drops out and the
photographed jug remains. That is correct. Do not one-off the jug.

**Screenshots** (do not compare raw PNG sizes; map through the 3×
512×384 stage, still 1536×792). HUD leather starts at screenshot
**y=799** → still is **y=7..798**. Original N7 E has a left letterbox
(still **x=249**); ours is **x=1**. Diff against HQ `FRAMES/1629_5.png`
to find overlays.

| File | What it shows |
|---|---|
| `screenshots/original.png` / `ours.png` | O7 N Leroy **X** era (1/z X planted him on the east fence) |
| `screenshots/N7_east_original.png` | Jug on the HUD dirt; Help in front of the fence, feet on the ground |
| `screenshots/N7_east_ours.png` | 1/z **Y**: jug floating at mid-fence, Help small and high |
| `screenshots/N7_east_ours_next.png` | Pinhole Y but 1/z **Z**: jug gone, Help clipped through the post |

**Proven from this install’s `DF.EXE` (SHA-1 `54558d7b…`):** tile
`*256+128` (`0x40ddac`); focal 310; TRIG rotate + pinhole at
`0x40dcd0`; lens subtracts `calcvect(facing, [0x46094c])` at
`0x40e081`; dest size divisor is **lens-forward** (`0x415271`, skip
`< 32`); sprite Z `>> 6` at `0x41535c`; depth cap `0x600` = 6×256.
**Proven from SET container 0:** +24 = **64 on every map**; +26 =
camera Z (town/nite **62**, target **72**, interiors 90–260); +42/+44
= 512×264; +48/+50/+52 = spawn `(6,14,1)` = O7 N. **Proven from
setInfo +0x2a:** GANG **114** (1320 frames), INVEN jug **96**.

**Inferred, not traced:** nothing in `.text` does `mov [0x46094c], 64`.
Play treats SET +24 as that word because the engine *reads* it as the
setback distance, every SET stores 64 there, and 64 is the value that
makes 310/256 land on 354. Do not replace it with the patent’s half-tile
**128** or camera height **72**.

Appleton patents (found by searching Cyberflix / DreamFactory
projection, not by number): [US5644694](https://patents.google.com/patent/US5644694A)
is the production camera (256-unit cells, set-back lens, height 72);
[US5729669](https://patents.google.com/patent/US5729669A) is the 24-level
Z overlay. Prefer the EXE + SET over the patent when they disagree.

#### Dead ends (do not retry)

| Approach | What we saw |
|---|---|
| `tile * 255 + 128` | mrxstudios / early docs counted 0–255 as the span. EXE is `shl 8`. O7 feet became (1658, 3698); Leroy 82 east / 162 north. |
| 90° pinhole, focal 256, camera at feet | `256 + 256*82/162` = **386**. Too far right of original 353. |
| 1/z X: `256 + 256*right/(256+forward)` | Same math as a **full-tile** setback. **~306**. Too far left; plants him on the O7 east fence. `ours.png` is this era. |
| Focal 192 (half of 384) | Attractive (353.2 with 255-tiles and no setback) and **wrong**. EXE says `0x136`. |
| Patent setback 128 / height 72 | Dust’s SET +24 is 64; town +26 is 62. Target +26 is 72 (patent default). |
| 1/z Y (`128 + 120 × 256/(256+feetForward)`) | Far actors land in SET Z bands. **Same-tile** ground floats at mid-fence (`N7_east_ours.png`). EXE Y is pinhole. |
| Clamp hotspot Y into 0..264 / treat Y>264 as hidden | N7 E jug hotspot **279** is *below* the still; the sprite still sits on the HUD. N7 S overlay Y ~361 is supposed to drop out. |
| 1/z sprite Z (`round(nearZ / persp)` from feet) | N7 E dirt is Z=3; 1/z gave the jug Z=4 → invisible. Help Z=4–5 behind the Z=3 picket (`N7_east_ours_next.png`). Use EXE `>> 6`. |
| Unconditional `min(hotspot still-Z)` | Far Leroy whose hotspot hits a building becomes Z=3 and draws through every wall. Slack is **one** plane, dirt only. |
| Nudge `town.leroy1` / `town.jug` | Authored stars. The error was the camera or Z, not the pin. |
| Use `cameraxyz` (one tile back) for blit | Idle facing only. Draw lens is 64, not 256. |
| Fit FOV to one screenshot and freeze it | Formulas are the EXE. Check tile 256 / focal 310 / setback 64 / pinhole Y / EXE Z before a new model. |
| Freeze in-place-turn camera (start pose until dest HQ) | Sprites stuck on frame 0, then snap. EXE yaws `index*16` and reprojects every plate. |
| Screen-lerp standing 1/z stills across a pan | Looks planted on the film, then teleports to dest HQ. Reproject. |
| Yaw 90° on 1/z Y | Skates every ground sprite. Yaw + **pinhole** Y is what the EXE does. |
| Blend near props toward 1/z X | One-off. PRP uses the same `0x40dcd0` as CST. |
| Layout dest sprites, then swap dest HQ | Dest sprites sit on the last LQ; the world jumps. Dest HQ is the last strip plate; draw sprites **after** the still. |

Clothing pixels are forced opaque; only the translucent-black foot
pancake stays alpha 120 (canvas premultiply punched Help’s black robe).
From O8 N the picket fence is Z=3, so a far body does not show through
it; gaps (Z≥5) can still leak slivers. `python cli.py --type set --z`
writes `FRAMES/z/` without rewriting color stills. Multiply dest size
by still CSS height / 264 so resize does not change size relative to
the street.

Walk poses advance on the **20 Hz game frame** from that actor’s CST
setInfo +0x2e table (`timing.json`, keyed by `actorpose`). GANG 8-pose
walks: 16 slots, 0.8 s cycle. Not distance, not a 60 Hz treadmill.
Drink is still the 8×4 CST strip, one pose every 6 script frames
(`toidle` waits 25), held on the last pose.

The brown pancake under feet is a **contact shadow**, not studio dirt.
Detect **per actor** from stand frames: a dark maroon index (`8 ≤
max(rgb) ≤ 50`) with ≥80% of its pixels in the bottom quarter. Skip
unused/black — Help's robe is index 0 and must stay opaque. GANG
Leroy/Jones/Marie use index **131** RGB `(25, 17, 17)`; Todd/Oona/Watson
use **132**. Flood-fill from the bottom edge; write the blob as
translucent black (`alpha` 120). Same-index pixels on the body stay
opaque (clothing, not chroma). Do not add a CSS `drop-shadow` on top.
PUP talking-heads do not use this. Re-dump: `python cli.py --type cst --frames`.

`cursor ("watch")` is only for the walk-to-talk wait (`walktopuppet`). Once
`openpuppetfile` is up, the talking-head uses **arrow** (choices use
pointer). Do not leave the hourglass on the puppet window.

Leroy’s first walk on talk is **64 `forceupdate` ticks** (dist ~192 /
`actorspeed` 3), then `turntodeg` + `openpuppet` + `puppetspeak` on the
same tick (`startWalk` already faces `currentdeg+128`, so the turn is
a no-op). Do not cap the `while iswalk { forceupdate }` loop so low
that the walk never finishes (256 was too small; 2048 is enough). Do not also `advanceActors` from the
rAF tick during `forceupdate` — that doubles the approach. Town
`walktopuppet` dest is `playerxyz`; face `currentdeg + 128` so he walks
straight-on, not the sub-tile diagonal.

PUP line text is **Mac Roman** (0xD5 apostrophe). latin-1 turned it into `Õ`
(`ItÕs near on midnight`). Decode `mac_roman`.

Hit-test talk on the actor sprite, not “anyone nearby.” Clicks on empty still
should walk.

---

## Puppet composite

PUP face tables (all 39 puppets, same layout): Background, Body, Head, Eyes,
Eyebrows, Nose, Jaw, Left, Hands 1, Right, Hands 2. Paint in **table order**:
Body (chest, black face-hole is a matte), then **Head on top**. The Head
sprite includes the beard; painting Body over Head left a front-facing beard
ring that did not turn. Then features, then hands. Skip a missing folder
(Kid has no Eyebrows, Shaman has no Jaw). Skip a viseme index that is `-1`
or out of range — do not substitute frame 0. Skip a flat Background fill
(Leroy brown, Jenix black); real room plates (Bolivar) stay. Do not knock
out Body black — Head covers the hole.

This night slice only **places** Leroy in the town. The compositor is the
PUP format, not a Leroy special case: `openpuppetfile("jones.pup")` loads
`PUP/_JONES` sheet, lines, visemes, and `scripts.json`. Boot still warms
`leroy.43` / `leroy.44` as a prefetch fallback before any CSV is loaded.

Authored differences the code already skips or keeps: Kid has no Eyebrows
folder, Shaman has no Jaw, Isao line ids are `bye1` not `isao.N`, Bolivar’s
Background is a real room plate (not a flat studio fill). Hands were already
in viseme tracks (Leroy raises Hands 1 mid-greeting); we just were not
painting those tables.

Idle pose comes from `FRAMES/sprites.json` `rest` / `restLayers` (first viseme
frame). Hands are usually `-1` at rest and appear mid-line; Bolivar rests with
hands up. Do not default Hands to frame 0.

Sprite blit: DFET hotspot is **(256, 192)** on the 384-tall stage. Viseme
extras are **hotspot** `(centerY, centerX)` on the 512×264 still, not bounding-
box centers. Top-left is `cx + headerX - 256`, `cy + headerY - 192`. Do not
bbox-center — talking jaws are wider to one side and that pulls the mouth
left.

Load **per-line** viseme JSON (`AUDIO/visemes/<ident>.json`), not the
`visemes.json` blob. Last viseme tick / 60 matches the WAV length. Clock is
**60 Hz**. Sidecar dump: `python sprites.py` writes `sprites.json`, visemes,
and `scripts.json` for every PUP without rewriting PNGs.

---

## Speech audio (Firefox / Windows)

Dust speech WAVs are **8-bit mono PCM at 11025 Hz** (unsigned, 128 = silence).
Play them through **Web Audio** with our own decoder (`decodePcmWav` in
`speech.ts`). Do not use `decodeAudioData` or `<audio>` for these files.

### What actually happens on a click

1. First `pointerdown` anywhere creates an `AudioContext` and calls
   `resume()`. That starts the OS audio graph. Keep a tiny non-zero looping
   buffer so Firefox does not treat the graph as silence and auto-suspend.
2. On this machine Firefox stays `suspended` for **~10 seconds** after that
   first `resume()`. `BufferSource.start()` is silent until `state ===
   "running"`.
3. Visemes do **not** wait on that. Mouth frames follow **wall-clock from
   speak start** (`t0`), same 60 Hz as the viseme track. If the context
   becomes running mid-line, start the buffer at the current viseme time so
   voice stays in unison.
4. Cancel a pending `resume().then(fire)` when the line ends (`outGen`), or
   a late fire will replay a finished greeting over the choice screen.

So: click the town (or anything) and wait ~10s, then talk, and greetings
have sound. If the **first** click of the session is Leroy, 43/44 finish
before the device is up and those lines are silent; later lines play.

A “click to start” overlay before the town would spend that 10s before
anyone talks. Not implemented.

Do **not** create the `AudioContext` at page load (blocks first paint: white
screen) and do **not** wait until a dialogue choice to `resume()` (that
starts the 10s clock even later, so the first audible line is mid-reply).

### Dead ends (do not retry)

| Approach | What we saw |
|---|---|
| `<audio src="/extract/….wav">` | No `Content-Length` used to stall ~15–18s; even with it, 8-bit 11025 Hz does not advance (`play()` resolves, `paused=false`, `currentTime` stays 0). |
| Blob of the same 8-bit WAV, or 16-bit at 11025 Hz | Same frozen playhead. `duration` can look correct; samples never play. |
| Upsample to 16-bit 44100 Hz for `<audio>` | Header parses (`dur=4.18`); playhead still stuck at 0. |
| Mute/volume-0 “unlock” then unmute later | Firefox does not treat that as audible media; later `play()` is silent. |
| `await ctx.resume()` in `play()` with a 50ms cap | Greetings skipped; resume often completes ~1.3s later. |
| Drive visemes from `AudioContext.currentTime` or `<audio>.currentTime` | Mouth frozen or gated off whenever output is not live. |
| Keep-alive oscillator at gain 0 | Firefox optimizes it out and auto-suspends. |

Ambient bed (`town.snd`) must not `play()` at boot — that autoplay failure
can stall the same device. Cue the bed and start it on a later user click
(`resumeBed`).

---

## Related extract docs

- PUP viseme bytes / 60 Hz: [`dfextract/docs/reconstruction-gaps.md`](../../dfextract/docs/reconstruction-gaps.md)
- Speech ADPCM → WAV: [`dfextract/docs/audio.md`](../../dfextract/docs/audio.md)
- Sprite hotspots: [`dfextract/docs/images.md`](../../dfextract/docs/images.md)
