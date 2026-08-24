# Dust: Resurrected (`/?mode=resurrected` or `/?mode=play`)

How the remake runs Day 1 night: original HUD under the stills, CST actors,
PUP talking-heads, world props, night FX, and spot-movies, all driven by
extracted DreamFactory scripts (boot → `advanceday` → SET/CST/PRP). Extract formats live in
[`dfextract/docs/`](../../dfextract/docs/). This file is the **playback**
book so we do not re-debug speech, visemes (per-PUP idle tracks), the
Firefox audio delay, world→still (X, Y, scale, Z, pans), interior
spawn/Z, HOUSE door overlays, EXAMINE pointer, dest-rect hits, the
map `cross`, or the script pump that runs FLT minigames (`mousedown`
press, `makeloop` / `pauseloop`, `forceupdate` vs idle `runQueued`,
60 Hz `delay` / fades, `findword` / `putword` holes).

Dust: Unlocked (`/?mode=unlocked`) is the sandbox stills walker:
[`src/world/set/README.md`](../world/set/README.md). The title chooser is `/`.

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
| People | Leroy at the sign. Help after the dog. Jones after Help’s ring. Hotel: Fear + Laurel. Saloon: Gus, Oona, Isao, Trotter. Card tables: click `blackjack` / `gamblers` (Jan / Mez). Slot cabinet: Scene D3 east hotspot. |
| Animals | Dog on the street. Pig. Horses / cow if `random` says so. No chickens (day-only). |
| Ground items | Jug at `town.jug` (after Leroy walks off). Bone at `town.bone` (Help’s day1 script). |
| Sky / extras | `shootingstar` (night). Tumbleweeds are **day** (`clock != 3`). |
| Ambience | `night.snd` + looping `town.snd`. `nightfxs`: saloon bed, chin chime, then owl / coyote / cricket. |
| Click movies | South-gate rules / firearms (`nitewarn` / `nitefire`), shop signs, `dog1` / `dog2`, item inspects. Intros skipped unless `?intro`. `dog1.mov` is a 59-tick overlay with two A1 cues 100 ms apart on the same 0.88 s growl. Play **two sequential still+audio passes** (one growl each) so the second cue does not cut the first into one bark. Wait-for-click is MOV frame **rec+0** (`actionframe`), not the `spotmovie` wrapper. WARNING/BONE set 1 on the inspect still; DOG1 is all 0 so Scene G12 can `setupactor("dog")` as soon as the lunge ends. |
| Locked | Jail, chin (until `phase >= 2`), bank, apoth, store, doctor, stage. Hotel + saloon open. |

`gotointerior` (`gotospecial` with an empty scene) stands at the SET
header spawn (+48 camera tile), not the street cell you left. Mapping
`scene g8` onto `_SALLOWER` / `scene g12` onto `_CHIN` has no still and
no walks — music from `openset` plays on the facade. Spawn is framelist
space (`SET_SPAWN` / `header.json`). `currentview("east")` is the word,
not `E`.

`closescene` / `openscene` are **tile** hooks, not turns. An in-place
pan in Help’s shop A2 must not run that scene’s `closescene` (that
`voicesound ("doorclose1")` is arrival-only). `closesetfile` runs the
old scene’s `closescene` so the close plays once on `gotointerior`.
HOUSE **door overlays** are a different rule — see [HOUSE door overlays](#house-door-overlays).

World→still **Y** uses that SET’s header +26 as camZ (chin **230**,
town **62**). Hardcoding 62 puts Help in the air behind the counter.

Help **behind the counter** is SET Z, not a second Y. The counter is in
the still; sprite pixels draw only when `spriteZ ≤ stillZ`. Interior
SETs need `FRAMES/z/` (`python cli.py --type set --z` that SET). No Z
plane → Help paints on top of the counter. `stdactor` sets chin
`actorscale` 5800 and `actorzclip` 32 — do not invent a shop Y.

`opensetfile` `removePrefix("set"|"scene:")` drops the script index.
The load mark must not block re-install or town `keydown` never returns
after leaving a shop (walk freeze).

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
INVEN unused palette **index 0** is 8.8 `0xFFFF`. DF.EXE `0x423e59`
`sar r16, 8` makes that **white**, not a knockout and not CST Help-black.
HUD holes that **sample pal 0** (HELP letter counters, gun leather flecks)
are opaque white. DFET wrote unused as `(0,0,0)` (black spots); keying
that through the HUD was a second wrong fix. Codec skip (unwritten
index 255) stays transparent — Dust leaves the framebuffer there
(gun outline, butbevel hole, ring center). World CST keeps unused→black
because those sprites index-blit onto the SET still (VGA 0 = black;
Help’s legs are pal 0). The held item hides during puppet UI and
inventory. Inventory places owned INVEN
props via `moveyoself` on the avatar flat (`panel`, or `hilite` for
`handitem`). Click an item to run `stdmouse` (that prop becomes the
HUD `handitem`). EXAMINE is `sendtoprop (handitem, infoyoself ())` →
`invenmovie` / `playmovie` on the **first** pointer (`mousedown` /
`trackbut`, not a leftover `click`). HUD buttons win over item sprites.
Boot `addinven ("helpbut")` is not an inspect target — empty hand falls
back to the first owned prop. Inspect MOVs wait on the still whose
80-byte record has rec+0 ≠ 0, then play the fade-out frames. That
dismiss must not `skipNextClick` the next real EXAMINE.

INVEN `addinven` parks the large prop at **(316, 320)** on the mainpanel
HUD — that pixel is also the skull chrome. Dust `stdmouse` **mousedown**
on the held prop (not a `click`): `while stilldown` follows `mouse()`,
then `pointinactor` → `offerobject`. Play starts that on **pointerdown**,
tracks `stilldown` / `mouse` on the window, and does not let the skull
rect steal the slot. Mouse-up over the dog runs `offerobject ("bone")`.
Empty chrome (map / skull / portrait) still opens those flats.
The map (`NEW.FLT` `openflat`) shows HOUSE `cross` at
`tile * 20 + (222, 93)` while `currentset` is town (nite counts as
town). `scenecol`/`scenerow` are 1-based for pig `isadj`; the map uses
**0-based** tiles so `scene g15` stays on the 512×384 still (1-based
y=393 clips). Timing `1,1,1,2,2,2` at 20 Hz — slot 2 has no frame, so
the X blinks. Interiors fall back to `townscene`.

The portrait is HOUSE `avatar` at **(460, 325)**, not the still baked into
`frame_3.png`. NEW.FLT `mainpanel` `openflat` calls `noface`: night
`nitefaces` / day `dayfaces`, `propdeg 0`, then `makeloop makeface`
(`random(30)+30` frames). `makeface` is `random(10)`: `propdeg` 1–5
(blink/look) or `niterite` / `niteleft` (timing table). Oona’s `tiphat`
plays `nitehattip` for 26 `forceupdate`s. FLT extract must not collapse
every `openflat` onto one file — mainpanel is container 2.

Clicks go through boot `mousedown` → `hittest` (actor / prop / scene).
Dust fires that on the **press** (`pointerdown` + `stilldown`), not
mouseup. Idle `runQueued` (`scriptBusy`) must wait, not drop the
press — that was the first-click miss on doors and the card table.
Hover runs the same objects’ `setcursor` (boot idle without
`forceupdate`). Actor/`pointinactor` hits the CST dest Mac Rect
(`0x415271`: projected hotspot minus scaled header hotspot) — the
head is in the box, the dirt below the feet is not. A remake 80px
chest-to-shins box around the feet hotspot missed hats and kept
`touch` on the ground. Scene G14 `pointinrules` / `pointinfire` set
`cursor ("touch")` — the south-gate warning / firearms signs. Cast
`setcursor` uses `realdist < hotdist`. Play does **not** walk from
still click bands (those 22%/48% overlays stole the sign). Dust walked
from chrome *outside* 0–512 or from keys. Mouse + keyboard still walk
with ←/→/↑ (or WASD). A held key is Dust `keyrepeat` (boot `keydown`
with `isrepeat`); a tap queued during a strip is the same `keydown`.
Do not `tryMove` either — Scene G12’s dog (and doors that `if isrepeat`)
live on those hooks. Touch/pen **swipe** (across = turn, up = walk;
down is not a back step) is the mobile stand-in; it must not start on
the HUD or steal an INVEN `stdmouse` drag. `passcode` from a scene proc
falls through to the SET keydown (walk), not to `new.flt`’s options
`mousedown`.

## Script pump (FLT minigames, next hand, world idle)

Dust is single-threaded. Checkers, slots, sleep, fights, and the next
blackjack/poker hand all share this pump. Do not invent a second
scheduler.

**Two clocks.** Boot `framerate (3)` is **20 Hz** script/walk frames
(`gameFrameSec`). `delay (n)`, `screentoblack (…, n)`, and
`blacktoscreen (…, n)` are **60 Hz** ticks (`dustTicksToMs`: 30 → 0.5 s,
45 → 0.75 s). Do not wait on `requestAnimationFrame` inside Three’s
`setAnimationLoop` — after Jan’s second-hand bet that fade never
finished and `dealcards` never ran.

**`forceupdate` (`0x433740`)** is one 20 Hz **display + walk** pump:
step actors, refresh the still/puzzle, drain `walkEnds` / `turnEnds` /
`ballEnds` on **this** stack, wait one game frame. It is **not** a
`makeloop` drain. Nested `forceupdate` during `dealcards` / `drawcash`
must not run other `makeloop` callbacks (Isao/crowd idles nested into
the deal; first card painted via `propdist`, then freeze).

**Idle `runQueued`** is the only place `makeloop` fires. Tick starts it
only when `idlePumpAllowed` (`!talking && !scriptBusy`). A sit-click
owns the VM with `talking`. Hand two’s `resetgame` owns it with
`scriptBusy`. `scriptPump > 0` (in-flight `forceupdate`) must **not**
let tick start a second pump.

**Press, not mouseup.** Dust `mousedown` + `stilldown` is
`pointerdown`. World doors, the card table, FLT hit/stay, and INVEN
drags all fire on press. Folding idle `scriptBusy` into click `talking`
**drops** the first press (door overlay never opens; blackjack never
sits). Wait for the idle pump; ignore only `cursor ("watch")`
(`walktopuppet`) and a live puppet (bevels own that click).

**`pauseloop (kind, "all")` is not sticky.** Sit at cards pauses HUD
`makeface` and saloon actor/scene loops that **already exist**, and
drops already-due callbacks of that kind. A later `makeloop ("flat",
me, "resetgame")` is **live** — that is how the next hand starts after
bust/stay/draw. Treating the kind as sticky left `resetgame` paused
and froze on the bust banner. `makeloop ("flat", me)` from a button is
the current flat (`flat 2:stay` → `flat 2`), not a button named
`resetgame`.

**`pausewalk ("all", true)`** actually freezes NPC walks (it was a
no-op) and clears queued `walkEnds` so `endwalk` cannot nest into the
game’s `forceupdate`.

**Puppet re-open.** `ui.open` must unhide **before** the first blit.
A pose tick during that paint is not `close()`. Skipping `hidden =
false` left second-hand `mainbetbj` waiting on `puppetevent` with no
visible bevels.

**`findword` / `putword`.** 1-based split on the separator; **empty
slots count**. SALGAMES `shuffle` does `putword (list, " ", n, "")`
then writes the swap. Filtering empties shrinks 52 cards to ~12; hand
two `findword` past the end deals nothing. Same helpers for poker
hands and checkers move lists.

**Empty `switch` `case` labels fall through** (Pascal). Mez `case 0` /
`case 1` share a body; `cardtovalue "2h"`…`"2c"` share `return (2)`.
A C-style break on the empty label makes poker skip the sit and
blackjack `dealertake` loop forever.

Code: pump [`lock.ts`](lock.ts) `idlePumpAllowed` / `worldMouseGate`;
loops [`host.ts`](host.ts) `runQueued` / `pauseLoop` / `makeLoop`;
ticks [`facing.ts`](facing.ts) `dustTicksToMs`; words [`puzzle.ts`](puzzle.ts)
`findWord` / `putWord`; press [`game.ts`](game.ts) `runScriptMouse`.

## HOUSE door overlays

Every interior uses the same HOUSE prop named **`door`**. Click on a
facade still runs that scene’s `mousedown` → `sendtoprop ("door",
setupprop ("salout"))` (or `chin`, `hotout`, `apoth`, …). A second
click on the open overlay is `uparrow` (walk in), not the prop’s
`mousedown` `initprop` (that closed the door). `setupprop`
sets `propowner` / `propview` to that name, `propvisible true`, and a
world `propxyz`. `initprop` is the matching close: if visible, play
`doorclose1`/`2`/`3`, then `propvisible false` and `propowner "none"`.

That sprite is a **photographed still replacement**, not furniture that
follows the camera. `setupprop ("salout")` on sallower D1 east replaces
the closed exit in that one photo. The same xyz world-projects onto C1
east — dead center of the inner double-door still — if the prop stays
visible. Chin A2, hotel `hotout`, bank `dollar`, and the other
`setupprop` names are this same prop; blit them on the neighbor camera
and the next building repeats the saloon bug.

Scripts: the opening scene’s `closescene` is usually
`sendtoprop ("door", initprop ())`. Dust runs `closescene` on a **tile**
leave (`DF.EXE` `0x40eae0` dest XY), not an in-place pan. Firing that
hook on pans replays `doorclose*` on every A2 / D1 turn.

Play therefore:

1. Remember the still `setupprop` opened (`door.openedAt` = current
   scene + facing). [`host.ts`](host.ts) `propvisible`.
2. Blit the overlay **only** on that still (`shouldBlitDoorOverlay`).
   Do not 1:1 / Z=1 blit it onto C1, D1 west, or any other camera.
   [`occlude.ts`](occlude.ts), [`game.ts`](game.ts).
3. Leaving that still — turn **or** tile — runs `initprop` **once**
   (`closeDoorIfLeftOpening`) before the dest strip. Sound and hide
   together. Already shut → no-op. Tile leave still runs `closescene`
   for other scene hooks; `initprop` sees `propvisible false` and does
   not play close again.
4. `voicesound` starts the mixer and returns. Awaiting the WAV fetch
   held `initprop` before `propvisible (false)`, so the overlay stayed
   up and the next pan replayed close.

Do not add a per-building close. The next hotel / shop / jail exit is
this `door` prop.

Scale/Z on the **opening** still: HOUSE door field 160, header ~252px on
the 264 still → blit scale **1**, sprite Z **1**. That 1:1 is only safe
when the overlay is the still it replaced. Bar drinks (`buildrand*`)
are not `door`; they keep script `propscale`.

Projector: `0x40dcd0` does not draw forward ≤ 0 (behind the camera).
That is necessary but not sufficient — C1 east looking at D1’s wall
still has forward > 0.

### Dead ends (do not retry)

| Approach | What we saw |
|---|---|
| Parse town `scene g8` / `g12` onto `_SALLOWER` / `_CHIN` | Music on the facade, no still, no walks. `gotointerior` stands at SET header spawn (+48), not the street cell. |
| Resolve `voicesound ("swingdoor")` in `_SALOON1` | Silent inner saloon double doors. `swingdoor.wav` is UNILIB; `opentrackfile ("saloon1.snd")` must not steal that lookup. |
| Skip PRP trans sprites over 256×256 / 20 KB | No `salout` PNG; click-to-exit in the saloon has sound but no open-door overlay. |
| Colorize HOUSE world overlays with HOUSE.PRP unused-black | Silhouette doors and card tables. Dust 8-bit-blits those onto the SET; extract recolors any sprite whose HOUSE unused-black ratio is ≥ 0.5. |
| `force-cache` + 1-day PNG `max-age` | Re-extracted gamblers/blackjack/table1 stay black until the browser cache dies. Extract PNGs revalidate (`no-cache` + ETag). |
| Isao `actordeg 64` / **192** at `sallower.isao` | Both are profiles (perpendicular to the keys). (2,3) S still is an upright with the keyboard toward the lens; rest heading is **0** (south) into the keys so the south aisle sees his back (wanted 128). Idle sways 236–20 through south. |
| Hardcode camZ **62** in every SET | Help floats behind the counter. Interior **door overlays** (salout z=174) sit at that SET’s +26 (sallower **180**); town 62 throws them off the top of the still. Use `cameraZOf(world)`. |
| Filter props with exact `prop.set === currentSet` | `sallower` vs `_SALLOWER` hid the exit overlay after a catalog hop. Same SET, different spellings. |
| Actor Z-slack on HOUSE door overlays | Door sprites replace the still wall. `GROUND_Z_SLACK` 1 left them behind the doorway. Pinning to hotspot Z=4 still dropped the lower leaf on floor Z=3 / a stale street plane — only the lintel stayed open. Wall overlays blit at Z=1. |
| INVEN field 96 on HOUSE door overlays | `salout` 232×252 is authored 1:1 (hotspot → y=11..263). PRP dest with default 1450 × 96 / (1000 × 156) is ~0.89 and leaves a strip of closed door above the HUD. Door +0x2a is **160**; 1450×160 is ~1.49×. **Only the HOUSE `door` prop** blits at scale 1. Bar drinks (`buildrand*`, z=147 vs camZ 180) kept getting that 1:1 blit and looked huge — they use script `propscale` 800–1100. |
| Open door on every still / close sound every pan | HOUSE `door` is a still replacement for the pose `setupprop` opened. World-projecting it onto C1 E paints the leaf on the inner doors; `initprop` on every pan replays close. Bind to `openedAt`; close **once** when leaving that still. Book: [HOUSE door overlays](#house-door-overlays). |
| Skip interior `FRAMES/z/` | Help paints in front of the counter. Draw when `spriteZ ≤ stillZ`. `python cli.py --type set --z`. |
| Scene `closescene` on in-place pans | `doorclose1` on every A2 turn. Those hooks are **tile** steps (`isTileStep`). Overlay close on a turn is `closeDoorIfLeftOpening`, not `closescene`. |
| `closesetfile` without the old scene’s `closescene` | Street door still visible; the close plays later on pans. |
| `loadedScriptFiles` blocking reinstall after `removePrefix("set"\|"scene:")` | Town `keydown` gone; walk freeze on shop exit. Reinstall when `!index.has(key)`. Cache parsed scripts; do not refetch every `gototown`. |
| `screentoblack` / `blacktoscreen` as no-ops | Saloon exit hitch: no fade, then O7 flashes before the street cell. Dust fades 30 ticks (0.5 s) to black, swaps the SET, fades up. Do not stand at town spawn when `currentscene` is still interior `d1`. |
| Skip SALGAMES.FLT comment-first flats / treat `openshopfile("salgames.prp")` as HOUSE | Clicking the card table fades to black and never returns. Poker/blackjack scripts start with `//`; stage `playcards*` + shop handle/cards live in `_SALGAMES`. |
| Switch `case 0` empty then `case 1` as C without fall-through | Poker: Mez pops in and fades out (`mezphase` 0 never reaches the day body). Blackjack stay: `cardtovalue` returns 0, dealer hits until the while cap. Empty labels share the next body; a non-empty case still breaks. |
| PRP unused→black for SALGAMES | Card faces and slot handle look inverted. Unused 0xFFFF is white except HOUSE SET overlays. |
| Colorize SALGAMES with the PRP ColorPalette | That table is unused-white; Dust indexes `SALGAMES.FLT`. Companion same-stem FLT/SET palettes, pick max chroma. |
| `makeloop ("flat", me, "resetgame")` with button `me` | After stay/draw the next hand never starts (`me` is `flat 2:stay`). Resolve to the current flat name. |
| Fold idle `scriptBusy` into click `talking` / dispatch world `mousedown` on `click` | First press on a door or the blackjack table is dropped (idle `makeloop` / `resetgame` holds `runQueued`). Dust does not throw away `mousedown`. Press on **pointerdown**; wait for the idle pump; ignore only `cursor ("watch")` `walktopuppet`. |
| `ui.open` skip unhide when `paintPose` changed | Second-hand blackjack `mainbetbj` leaves `#puppet-ui` `hidden`. `puppetevent` waits forever. Pose ticks are not `close()`. Unhide before the first blit; only `paintGen` / sheet means closed. |
| Tick `runQueued` while `scriptBusy` if `scriptPump > 0` | First blackjack hand is a click (`talking` blocks tick). Hand two is idle `resetgame`. `dealcards` `forceupdate` raises `scriptPump`, tick starts a second pump on the same VM, first card shows, the rest never deal. Tick stays off for the whole idle pump; nested drain is only `forceupdate`. |
| `pauseloop (kind, "all")` as a sticky kind pause | Sit pauses HUD/world loops, then bust does `makeloop ("flat", me, "resetgame")`. Treating the kind as sticky left that timer paused, so the next hand never started. Dust `makeloop` is live. Pause existing loops and drop already-due ones of that kind; do not pause the next-hand timer. Nested `forceupdate` still must not run other `makeloop`s. |
| `screentoblack` / `delay` waiting on `requestAnimationFrame` | Those opcodes are 60 Hz ticks (`blacktoscreen (…, 30)` = 0.5 s). Waiting on rAF inside Three’s animation loop can stall after the second-hand bet (fade never finishes, `dealcards` never runs). Use wall-clock ticks. `forceupdate` (`0x433740`) is one 20 Hz display/walk pump, not a `makeloop` drain. |
| `putword (list, " ", n, "")` dropping the word | SALGAMES `shuffle` clears a slot then writes the swap. Filtering empties shrinks 52 cards to ~12. Hand two `findword` past the end deals nothing. Keep holes; `findword` is the same 1-based split. |
| Skip `showHold` when `setPose` matches boot’s pre-set O7 N | First `opensetfile` no-ops; MeshBasicMaterial stays white (HUD + Leroy/jug, no town) until a turn. Skip only if a still is already on screen. |
| Load NEW.FLT flats without running `openflat` | HUD portrait stays the cowboy baked into `frame_3.png`. Engine `openstagefile` shows mainpanel (`noface` / `makeloop makeface`). `initall` `stoploop ("flat", "all")` then `opensetfile` must re-arm that loop. |
| Tick `runQueued` during `boot()` | Animation loop and `advanceday` share the VM. `makeface` due during boot is dropped; `stoploop` did not clear `dueLoops`, so re-arm thought the portrait was still live. Do not tick scripts until boot returns; `stoploop` cancels due callbacks; `ensureHudPortrait` after boot. |
| `#play-hud-face` under `#actor-layer` | Raising the still overlay to z-index 42 (full-height door) hid the HOUSE face. Portrait stacks with `#play-hand`, above the actor layer. |
| Prefetch two viseme JSON files | Choice-line jaw lags while the WAV plays (Leroy and Help). Warm **every** ident; `puppetspeak` awaits the track before `play()`. |
| Uncapped SET still + all-CST sprite decode | Turn/walk hangs 1–2s or eats the key. Current strip is high-priority; neighbor strips prefetch at depth 2; shared inflight cap 8. Do not skip plates. |
| New face blit per 60 Hz tick (`paintGen` drops in-flight jaws) | Idle head, then a late jump. One blit; queue the latest pose; share one `Image` onload. |
| Avatar EXAMINE on DOM `click` after `#play-stage` `pointerdown` | First press lost. Dust is button `mousedown` + `trackbut`. Overlay fires on **pointerdown**; HUD buttons win over item sprites. |
| `infoyoself` on boot `handitem` `helpbut` | Empty shop `infoyoself`. `addinven ("helpbut")` is chrome, not an inspect target. |
| `skipNextClick` after a captured actionframe `pointerdown` | Next real EXAMINE / world click eaten. `preventDefault` on that pointerdown already kills the synthetic `click`. |
| `puppetevent` as a click-only Promise | Hold a Yes/No and Leroy never fidgets. `0x431330` runs four `idle 1`–`4` timers (`0x40B060`); `puppetevent (240)` returns -2. |
| `idlefx` every 240 ticks | Same spoken line at 4 s, no blinks. The EXE plays named idle clips with a random per-clip wait, not that script. |
| Await `speak()` for blinks / glances | Hourglass and dead bevels on every silent fidget. Only `idlespeak` awaits `puppetspeak`; blinks/gestures `fidget()` with `waitEvent` still live. |
| Viseme ticks as the `0x40B060` wait / `continue` overdue tracks | Glances every ~2 s; idle 4 twice in a row. Wait is WAV ms; glances 3×; one clip per wake; 4 s floor after `idlespeak`. |
| `tryMove` on hold-to-repeat / a tap queued during the strip | Hold W past the G12 dog. After the filmstrip, fire boot `keydown` / `keyrepeat`, not a raw SET step. |
| Hide portrait / skip CST blit when the next PNG is still decoding | Face and town people flicker on `makeface` / a deg step. Keep the last blit; high-priority the plate in view. |
| `openpuppetfile` unhide with the previous canvas | Next talk flashes the last face. `screentoblack` is a no-op here; clear + drop stale blits, show the UI after the new sheet paints. |
| Talking-head under `#actor-layer` / rest from sprite headers | Help outdoor idle painted the shop-interior plate and stacked both sleeves on the chest (384 headers). Rest is **idle 1** extras for every PUP (`Background: -1` on Help1/Dell1/Cobb; Help2 indoor keeps the plate). Unencoded `idle 1.json` / `Hands 1` 404s drop that rest. Encode extract path segments; do not default Background to frame 0. `#puppet-ui` stacks above the actor layer. |
| Viseme / CSV cache keyed only by ident (`idle 1`) | Every PUP names **`idle 1`–`idle 4`**. Boot-warming Leroy then talking to Help plays Leroy extras on Help’s sheet (shop plate + Picasso head). Rest can look fine — live idle used the ident cache. Key `folder/ident`. Book: [PUP viseme tracks](#pup-viseme-tracks). |
| `pointinactor` as ±40×80 px around the feet hotspot | Head unclickable; `touch` on the dirt. Chin Help is `actorscale` 5800 — 80px is the chest. Use CST dest Mac Rect (`0x415271`). |
| Map `cross` at 1-based `scenerow * 20 + 93` | `scene g15` y=393, clipped off the parchment. Opcode is 1-based for pig `isadj`; the grid is **0-based** tiles from (222, 93). Slot 2 of `1,1,1,2,2,2` has no frame (blink). |
| `infoyoself` on every inventory `stdmouse` | Not Dust. Panel click selects `handitem`; EXAMINE inspects. |

Code: interiors [`sceneName.ts`](sceneName.ts) / [`graph.ts`](../world/set/graph.ts); hits [`facing.ts`](facing.ts) `spriteDestRect`; EXAMINE [`hud.ts`](hud.ts) / [`game.ts`](game.ts); map X [`hud.ts`](hud.ts) `mapCrossHotspot`; choice idle [`host.ts`](host.ts) `waitPuppetEvent` / [`ui.ts`](ui.ts); viseme cache [`host.ts`](host.ts) `puppetClipKey`; script pump [above](#script-pump-flt-minigames-next-hand-world-idle).

---

## Stage

Dust’s stage is **512×384**. The still is **512×264**; the HUD is the bottom
**120px** (`FLT/_NEW/frame_3.png`). Do not overlay the HUD on the still.

## Dialogue chrome

Speech is a **full-width black bar** (40px) sitting on the HUD, overlaying
the still/puppet. GDI `DrawTextA` / `TextOutA` is left-aligned (same as
the bevel labels); face is **Arial**. Click the bar to skip a line. **Escape** skips the rest of that
character’s `puppetspeak` lines until `puppetclear` / `puppetevent`
(choices). Do
not keep a Continue button on the still. **C** hides or shows the bar
(audio and visemes keep going). While `puppetspeak` is running the
cursor is `watch` (hourglass) and the five bevels do not highlight or
accept a click — Leroy’s Yes/No stay on screen through `leroy.12` but
are not live until the line ends. After speech, arrow + hover again.
Silent idle blinks and glances must **not** take that lock — only
spoken idle (`idlespeak`) does.

While a choice is waiting, Dust does not freeze the puppet. `puppetevent`
(`DF.EXE` `0x431330`) looks up **`idle 1`…`idle 4`** on the **open** PUP
(not a global clip of that name) and gives each clip its own timer:
interval `(rand15 * duration_ms / 0x7FFF) + 1` 60 Hz ticks (`0x40B060`).
CSV tags pick the kind (`blink`,
`gesture 1`, `idlespeak`); idle 1 defaults to blink, idle 4 to speak
(Mayor’s spoken idle is `idle 3`). Blinks use **1/3** of the clip length,
glances **3×** — that spacing is ours, not the EXE. Do not feed viseme
playback ticks (Leroy idle 2 is 29) into `0x40B060`; that is how long
the face moves, not the wait. One clip per wake; overdue neighbors
re-roll so idle 2 and idle 3 do not dump together. After `idlespeak`,
wait at least 240 ticks so the line cannot stutter. Idle 1–3 WAVs are
silent (~1 s); spoken idle is ~2.6 s on Leroy. Do **not**
hammer `idlefx` every 240 ticks — that script is not this loop, and it
made the same line fire at 4 s. `idlespeak` csv text is a tag, not a
subtitle. `puppetevent (240)` returns **-2** at that
mark (auto-continue); `puppetevent (-1)` keeps waiting.

Choices are **five horizontal bevels** that **replace** the HUD band
(24px × 5 = 120), not floating above it. Not Windows/Mac buttons:
`DF.EXE` never creates a `BUTTON` class; it `BitBlt`s HOUSE `butbevel`
(72×23, 3px dark/tan rim, **transparent hole**) and draws labels with
GDI `CreateFontA` / `DrawTextA` / `TextOutA`. Face name **Arial** is in
the EXE. Labels are left-aligned. The hole is filled with the rim’s
dark brown `(111, 56, 38)` — the sprite has no fill of its own; do not
paint it black. Empty slots stay blank bevels so it always reads as
five boxes — including during speech, from `openpuppetfile`, not only
after `puppetbevel`. Hide the leather dashboard **and** the HOUSE
portrait whenever the puppet UI is up (`#play-hud` and `#play-hud-face`).
The face canvas is a stage sibling (z-index above the dashboard); do not
leave it visible over the five bevels. `#play-hud-face { display: block }`
must not override `[hidden]`.

---

## Town CST

CST `actordeg` / `currentdeg`: **256 units per turn, 0 = south**. DF.EXE
`0x4154c0` does **not** index `octant % n`. Each 44-byte setInfo frame
stores pose at **+8** and facing deg at **+0x28**. Draw walks that
pose’s table (`+0x2e` / `+0x70`), then copies the frame whose deg is
closest on the circle (`0x411f20`). Wanted deg is
`(look + 128) − actordeg` on the view axis (from the actor back to the
lens, minus facing). Frame deg 0 is the front. CST plate **32** is the
west ¾ (head screen-left); world `actordeg 32` is SE, so from the south
that is the **east** ¾ (plate **224**). Matching the two 32s mirrored
the street dog. Do not use XY `calcdeg` to the 64-unit setback — that
sitting beside a near dog flipped the ¾.

Most GANG/EXTRA strips are 8 dirs at 32°. The **dog** is 7 plates at
**16°** around south (`0,16,32,48,208,224,240`) — `setupactor("street")`
sets `actordeg 32`, which is a ¾, not the head-on plate. `% 7` wrapped
that to frame 0. `alt` / `left` are the same 7 degs (head turn, not a
single extra[0]). Horses are 16 dirs at 16°. Sidecar: `pose` / `deg` on
CST `sprites.json`. Dog `doright` / `lookright` and horse `horsey` /
`head` / `tail` are those scripts — head-on made the fidgets easy to
miss. `singlesound` is fire-and-forget (do not `await` it inside
`runQueued` / `scriptBusy`).

Idle is Leroy’s script, not a remake fidget. `setupactor("sign")` ends in
`endwalk` → `leroyidle`. Each tick (`makeloop` delay 20 at `framerate (3)`
= 1 s): 8% `actorpose ("drink")` then `toidle` after 25 frames; if
`realdist < hotdist()` (384 in town) `turntodeg` toward `cameraxyz`;
otherwise `actordeg + 2` (slow pivot). `playerxyz` is the tile center;
`cameraxyz` is one tile behind the feet on the view axis so `calcdeg`
faces the lens (O7 N looks south, not the 76-east diagonal). When the
player steps or turns, standing actors’ idle loops fire on the next
script frame — do not wait a full second, and do not freeze turns during
a SET walk (`talking` is click/key; idle `hasattention` uses `scriptBusy`).
Do not snap deg; `turntodeg` still animates.

If `realdist < hotdist` at the sign (`leroyphase = 0`), `hasattention (10)`
counts script frames (`(seconds * 60) / framerate()` = 200 at boot 3 ≈
10 s) then `sendtoactor (target, mousedown (0))` — same talk walk as a
click, without the player clicking. `clearattention` when they walk out
of range. Do not skip that fake mousedown.

Talk approach is `walktopuppet`: in town he walks to `playerxyz` facing
that vector (straight-on toward the camera), then `turntodeg (currentdeg
+ 128)`. Scripts `stoploop` for the walk. Do not spin during the walk.
Dust’s VM is single-threaded: `cursor ("watch")` then `while iswalk {
forceupdate }` — no nested mousedown/keydown, no player SET walk, no HUD
map/inven. Play sets `talking` on click/key, and `scriptBusy` on an
in-flight idle `runQueued`, so a second tick cannot overlap
`hasattention`’s walk (he arrived and froze). Nested `forceupdate`
still drains `walkEnds`. SET filmstrips use `busy`, not `talking`, so
standing idle still runs when *you* walk.

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

Clothing pixels are forced opaque. Only the (0,0,0,~120) foot blob
4-connected to the bottom edge stays alpha 120 — Help’s robe is also
(0,0,0); canvas premultiply punching it to a<255 used to keep the coat
see-through. Do not treat every translucent black pixel as a matte.
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
unused/black — Help's legs are pal 0 (SET VGA black) and must stay
opaque; the robe is other greens. GANG
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

Idle pose comes from viseme **idle 1** extras (`rest` / `restLayers` in
`FRAMES/sprites.json`). Outdoor Help/Dell/Cobb hide `Background`; Help2's
indoor idle keeps the shop plate. Hands are usually `-1` at rest and appear
mid-line; Bolivar rests with hands up. Do not default Hands or Background to
frame 0. Extract URLs encode spaces (`idle 1.json`, `Hands 1/…`).

Sprite blit: DFET hotspot is **(256, 192)** on the 384-tall stage. Viseme
extras are **hotspot** `(centerY, centerX)` on the 512×264 still, not bounding-
box centers. Top-left is `cx + headerX - 256`, `cy + headerY - 192`. Do not
bbox-center — talking jaws are wider to one side and that pulls the mouth
left.

Load **per-line** viseme JSON (`AUDIO/visemes/<ident>.json`), not the
`visemes.json` blob. Last viseme tick / 60 matches the WAV length. Clock is
**60 Hz**. Warm every ident when the puppet opens so a choice reply is not a
late fetch while the WAV already plays. `puppetspeak` **awaits** that track
before `play()`. Ident is unique **inside that PUP** — see [PUP viseme tracks](#pup-viseme-tracks).
Sidecar dump: `python sprites.py` writes `sprites.json`, visemes,
and `scripts.json` for every PUP without rewriting PNGs.

Do not start a new face blit that **drops** an in-flight one (`paintGen`).
60 Hz viseme ticks would cancel jaw PNGs that are still loading, so the idle
head sat through the line and jumped later. One blit at a time; queue the
latest pose. Share one `Image` load per URL — do not overwrite `onload`.

---

## PUP viseme tracks

Each `.pup` file has its own dialogue table and 82-byte viseme tracks
(DFET ident at record+280, `animLogic` container). `openpuppetfile`
loads **that** file. `puppetevent` then looks up `idle 1`…`idle 4` on
the open PUP — those names are the engine idle slots, not a global clip
library. Extract writes `PUP/_<CHAR>/AUDIO/visemes/<ident>.json`.

Authored **idle 1** (first frame):

| PUP | Background | Head `at` | What paints |
|---|---|---|---|
| `_HELP1` (street `walktopuppet`) | **`-1`** | `[253, 44]` | Town still shows through |
| `_HELP2` (shop `runpuppet`) | `0`, photo `[256, 132]` | `[253, 44]` | Indoor shop plate |
| `_LEROY` | `0`, flat brown | `[249, 120]` | Flat fill skipped (`isFlatBackdrop`) |
| `_DELL1` / `_COBB` | **`-1`** | their own extras | Same outdoor hide as Help1 |

Help’s `FRAMES/Background/0.png` is the shop interior. Leroy’s is a
studio fill. Applying Leroy’s `Background: 0` to Help1 draws the shop
on the street. Applying Leroy’s Head `[249, 120]` to Help’s head sprite
(authored for y=44) is a ~76 px miss — Picasso. Rest can look fine:
`loadPuppetSheet` already fetches **that** folder’s `idle 1.json`. The
live blink / glance / `idlespeak` path used a cache keyed only by ident,
so the first fidget swapped in Leroy’s track. Help1 vs Help2 share
`idle 1` too — hiding Background for every Help talk would drop the
indoor plate.

Play therefore:

1. Cache visemes as `puppetClipKey(folder, ident)` (`PUP/_HELP1/idle 1`).
   In-flight loads use the same key so a boot-warm of Leroy cannot
   satisfy Help’s fetch. [`host.ts`](host.ts) `loadVisemeLine`.
2. Keep `texts.csv` maps per folder. Reopening an already-loaded PUP
   restores that bag (idle WAV/text, `help.1` vs `leroy.12`).
3. Rest still comes from **that** PUP’s idle 1 extras. Outdoor
   Help/Dell/Cobb hide Background; indoor Help2 keeps the plate. Do not
   default Background to frame 0. Encode spaces in extract URLs
   (`idle 1.json`, `Hands 1`).
4. Do not special-case Help. The next street talk after Leroy (Dell,
   Cobb, Jones, …) is the same ident collision.

### Dead ends (do not retry)

| Approach | What we saw |
|---|---|
| Rest from idle 1 + hide Background when unspecified | Rest looked OK until the first fidget. Live idle still applied Leroy’s track. |
| Encode `idle 1.json` / `Hands 1` | 404s dropped extras (sleeves stacked on the 384 header) but did not stop the ident-cache mix. |
| `#puppet-ui` above `#actor-layer` | The shop plate was the PUP Background layer, not the CST actor. |
| Always skip Help’s Background | Indoor Help2 must keep the shop plate. Help1 vs Help2 share `idle 1`. |
| Clear the viseme map on `openpuppetfile` | Drops warm tracks; a Help fetch still joins Leroy’s in-flight `idle 1` job if the key is ident-only. Key the pending map too. |

Tests: [`host.test.ts`](host.test.ts) per-puppet viseme cache (Leroy then
Help, in-flight race, Help2 plate, Help1 after Help2, idle 2 / idle 4
speak, CSV restore, late fetch, Cobb); [`viseme.test.ts`](viseme.test.ts)
Help vs Leroy extras and idle 2/4 dumps.

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
- HOUSE door overlays (all buildings): this file, [HOUSE door overlays](#house-door-overlays)
- PUP viseme tracks (per-character `idle 1`–`4`): this file, [PUP viseme tracks](#pup-viseme-tracks)
