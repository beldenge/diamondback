# Play mode (`/?mode=play`)

How the remake runs Day 1 night: original HUD under the stills, CST actors,
and PUP talking-heads driven by extracted scripts. Extract formats live in
[`dfextract/docs/`](../../dfextract/docs/). This file is the **playback**
book so we do not re-debug speech, visemes, the Firefox audio delay, or
CST world→still X.

Town sandbox (`/`) stays an unlocked stills walker:
[`src/world/set/README.md`](../world/set/README.md).

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

World → still (X vs Y, three cameras, dead ends): **World → still**
below. During a SET walk or turn, lerp the feet through the 5 motion
frames.

### World → still (do not re-debug)

Code: `CAMERA_FOCAL` / `CAMERA_SETBACK` / `TILE_SPAN` in
[`facing.ts`](facing.ts). Tests pin O7 N + `town.leroy1` at still-x
**354**. Binary writeup:
[`dustdecompile/docs/findings.md`](../../dustdecompile/docs/findings.md)
§7a. SET header fields:
[`dfextract/docs/file-types.md`](../../dfextract/docs/file-types.md).

There are **three** cameras. Do not collapse them.

| Name | World point | Used for |
|---|---|---|
| Feet / `playerxyz` | `tile * 256 + 128` | Scripts, walk dest, **Y and scale** 1/z, actor Z |
| Draw lens | feet minus `calcvect(facing, 64)` | **Screen X only** |
| `cameraxyz` | one **full tile** behind the feet | Idle `calcdeg` only. Not placement. |

`DF.EXE` `0x40dcd0`: rotate `(actor − lens)` by TRIG sin/cos ÷ 16384,
then `256 + 310 * right / forward`. Focal **310** is `mov …, 0x136` at
`0x40d255`, not 256 (90° on 512) and not 192 (half of 384).

**Oracle** (spawn O7 N, `town.leroy1` = 1740, 3536):

```
feet     = (6*256+128, 14*256+128) = (1664, 3712)
lens     = (1664, 3712+64)          = (1664, 3776)   # looking N, +y south
right    = 76
forward  = 240
x        = 256 + 310*76/240         = 354
```

Original DOSBox still-space midline (shirt ≈ hotspot on the front
stand plate) measured **353**. Integer `idiv` truncates to 354.

How we measured the screenshots: both are a **3×** 512×384 stage
(still 1536×792). Original has wood window chrome (still origin 6,10);
ours was 8,10. Map screenshot pixels through that rect, then
still-minus-diff the orange shirt in x=300–430, y=90–230. Do not
compare raw PNG sizes — the two shots are not the same pixel size and
the original is letterboxed inside a frame.

**Proven from this install’s `DF.EXE` (SHA-1 `54558d7b…`):** tile
`*256+128` (`0x40ddac`); focal 310; TRIG rotate + pinhole at
`0x40dcd0`; lens subtracts `calcvect(facing, [0x46094c])` at
`0x40e081`; depth cap `0x600` = 6×256. **Proven from SET container 0:**
+24 = **64 on every map**; +26 = camera Z (town/nite **62**, target
**72**, interiors 90–260); +42/+44 = 512×264; +48/+50/+52 = spawn
`(6,14,1)` = O7 N.

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
| 1/z X: `256 + 256*right/(256+forward)` | Same math as a **full-tile** setback. **~306**. Too far left; plants him on the O7 east fence. `ours.png` in `screenshots/` is this era. |
| Focal 192 (half of 384) | Attractive (353.2 with 255-tiles and no setback) and **wrong**. EXE says `0x136`. |
| Patent setback 128 / height 72 | Dust’s SET +24 is 64; town +26 is 62. Target +26 is 72 (patent default). |
| Engine Y `132 + 62*310/forward` | Hotspot in Z=4; SET Z clips feet. Keep 1/z Y from the **feet** (near plane **248**) so O7 N stays in Z=5 (y=194–209). |
| Nudge `town.leroy1` | Authored (1740, 3536). The error was the camera, not the star. |
| Use `cameraxyz` (one tile back) for blit | That vector is idle facing. Draw lens is 64, not 256. |
| Fit FOV to one screenshot and freeze it | X is the EXE. If another actor looks off, check tile 256 / focal 310 / setback 64 before inventing a new model. |

Distance: Dust never computes scale in scripts. DFET says DF.EXE uses the
SET Z plane; the EXE imports `BitBlt` / `WinGBitBlt`, not `StretchBlt`.
South-gate Z is 3 at your feet … 7 up the road (24 = sky). Falloff is
`256 / (256 + forward)` — same 256 the scripts use for tiles
(`walktopuppet` does `xyz / 256`). Sampled actor depth is `round(3 /
persp)` (Leroy at the sign is Z=5). Then multiply sprite size by the
still canvas CSS height / 264 so window resize does not change his size
relative to the street.

Actors are blitted onto a 512×264 canvas with the SET Z plane: a pixel
draws when `actorZ <= stillZ` (DFET: smaller Z is closer). From O8 N
the picket fence is Z=3, so his body does not show through it; gaps in
the fence (Z≥5) can still leak slivers. `python cli.py --type set --z`
writes `FRAMES/z/` without rewriting color stills.

Walk poses advance on the **20 Hz game frame** from that actor’s CST
setInfo +0x2e table (`timing.json`, keyed by `actorpose`). GANG 8-pose
walks: 16 slots, 0.8 s cycle. Not distance, not a 60 Hz treadmill.
Drink is still the 8×4 CST strip, one pose every 6 script frames
(`toidle` waits 25), held on the last pose.

The actor layer **is** the still (top 264 of the 384 stage), `overflow:
hidden`, under the HUD. Town sprites never paint into the dashboard.

The brown pancake under feet is a **contact shadow**, not studio dirt.
Detect **per actor** from stand frames: a dark palette index (`max(rgb) ≤
50`) with ≥80% of its pixels in the bottom quarter. GANG Leroy/Jones/Marie
use index **131** RGB `(25, 17, 17)`; Todd/Oona/Watson use **132**. Flood-
fill from the bottom edge; isolated specks of that matte on the body are
keyed fully transparent. Write the blob as translucent black (`alpha`
120). Do not add a CSS `drop-shadow` on top. PUP talking-heads do not use
this. Re-dump: `python cli.py --type cst --frames`.

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
