# Play mode (`/?mode=play`)

How the remake runs Day 1 night: original HUD under the stills, CST actors,
and PUP talking-heads driven by extracted scripts. Extract formats live in
[`dfextract/docs/`](../../dfextract/docs/). This file is the **playback**
book so we do not re-debug speech, visemes, or the Firefox audio delay.

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
faces the lens (O7 N looks south, not the 82-east diagonal). When the
player steps or turns, standing actors’ idle loops fire on the next
script frame — do not wait a full second, and do not freeze turns during
a SET walk (`talking` is only `mousedown`). Do not snap deg; `turntodeg`
still animates.

Talk approach is `walktopuppet`: in town he walks to `playerxyz` facing
that vector (straight-on toward the camera), then `turntodeg (currentdeg
+ 128)`. Scripts `stoploop` for the walk. Do not spin during the walk.

Named `walktostar` (Leroy `walkout` → `town.leroy2` at the range) does
**not** beeline. Dust scripts never call `walkonroad` / `walkonpath`;
DF.EXE does that inside `walktostar` on the SET walk graph (52 camera
tiles). Play BFS those streets, then the star — main street north from
N7, east along y=10 to K11. Explicit `x,y,z` strings stay a beeline
(town talk). Road hops use `calcdeg` to the next tile, even if that
center is the player’s tile (L7 moonwalk). `currentdeg + 128` is only
the talk beeline. Draw if the still projection lands on-screen, up to
~5 tiles ahead — a 520-unit sphere hid him from K7 looking east. A
cross-street body (K7 north vs the east road) is not in that photo.

CST sprites: native frames are ~200px with hotspot (256, 192) on the 384
stage — that is 1:1 **on the camera plane**. `stdscale("town")` is **1450**
(`CST/_GANG/Cast.txt`). Leroy at the sign is **`actorscale (me, 1100)`**
after `stdactor` (`CST/_GANG/Leroy/Script.txt`). Indoor sets use 2400–5800.

Day-1 stand is `setupactor("sign")` → `actorstar (me, "town.leroy1")`.
That star is **(1740, 3536)** in `SET/_TOWN/waypoints.json` (second half of
the 50-byte `town.leroy2` record). `town.leroy2` (2656, 2720) is the
range. Do not invent a nearby xyz if a name looks missing — re-read slot B.
CST in-world blit uses the same hotspot as PUP: header `pos_x`/`pos_y` are
top-left when the hotspot is (256, 192). Scale that offset by the still
scale; do not `translate(-50%, -100%)` on the bbox. ¾ frames are not
centered on the hotspot.

Screen **X** is a pinhole: `256 + 256 * right / forward` (focal = still
half-width). **Y and scale** use `256/(256+forward)`. Using 1/z for X
put Leroy on the O7 east fence; he is 162 off-axis and only 82 forward
(`|right| > forward` is outside a 90° still) and the original does not
draw him there. Horizon Y is 128; the near plane is **248** (mid Z=3
band). Still-bottom 264 sat the sign hotspot in Z=4 while actor Z is 5,
so SET Z clipped his feet. Camera is the tile center
(`x*255+128`). During a SET walk or turn, lerp that camera through the
5 motion frames. Do not scan the Z plane for Y — O8 N’s fence has no
ground pixels at Leroy’s depth in that column. Do not nudge a star or a
character.

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

Walk poses advance by **distance** (one 8-frame cycle per 256-unit
tile), not a 0.08 s treadmill. Drink is the 8×4 CST strip, one pose
every 6 script frames (`toidle` waits 25), held on the last pose.

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

Leroy’s first walk on talk is about **198 `forceupdate` frames (~1.2s)**, then
`turntodeg` + `openpuppet` + `puppetspeak` on the same tick. Do not cap the
`while iswalk { forceupdate }` loop so low that the walk never finishes
(256 was too small; 2048 is enough). Do not also `advanceActors` from the
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
