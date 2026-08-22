# Dust engine handbook

For an agent rebuilding Dust. **Scripts are the storyboard. This file is the rulebook.**
How we got this out of the EXEs (hashes, table layout, vs prior work): [findings.md](findings.md).

Confidence tags: `proven-scripts` (control flow in the dump shows it), `inferred` (high confidence from usage, not proven inside DF.EXE), `unknown` (do not guess).

Indexed **541** pretty-printed scripts from `dfextract/out` and **304** names from `DF.EXE`.

## 1. Do not mix Titanic names with Dust names

`dfextract` still prints DreamFactory 4.0 (Titanic) names. Dust’s own table in `DF.EXE` differs on these ids. When you read a `.txt` script, translate:

| Id | Name in `.txt` | Name in `DF.EXE` |
|---|---|---|
| 12007 | `makecricket` | `makeball` |
| 12012 | `stopcricket` | `stopball` |
| 12037 | `paintingscript` | `floorscript` |
| 12066 | `sendtopainting` | `sendtofloor` |
| 16011 | `currentview` | `currentdir` |
| 16034 | `currentcd` | `actorhitbox` |
| 16047 | `pausecricket` | `pauseball` |
| 20011 | `iscricket` | `isball` |
| 20017 | `pointinpainting` | `setwidth` |
| 20018 | `countpaintings` | `setheight` |
| 20021 | `sendtopostfx` | `rowcoltoscene` |
| 20022 | `indextopainting` | `scenefloor` |
| 20023 | `actorexists` | `scenerow` |
| 20024 | `propexists` | `scenecol` |
| 20067 | `fileexists` | `findfile` |
| 20082 | `calcmod` | `cacheinfo` |
| 20090 | `sendtopaintingfx` | `sendtofloorfx` |
| 20100 | `sendtoserverfx` | `scenebuild` |
| 20101 | `indextocricket` | `indextoball` |
| 20104 | `countcrickets` | `countballs` |

`currentview` in scripts **is** Dust `currentdir` (id 16011). `spotmovie` / `gototown` / `gotointerior` are **not** opcodes — they are library procedures in `new.flt`.

## 2. Engine hooks (procedures Dust calls by name)

These are `code` blocks, not opcodes. If a SET/PUP/BOOT file defines one, the engine invokes it.

- `boot` — BOOTFILE start. Sets paths, clock, plays intros, opens casts/shops.
- `keydown` — Keyboard. Boot dispatches to the visible set/flat. arg is a key name (`uparrow`, …).
- `keyrepeat` — Boot wraps keydown and sets isrepeat.
- `mousedown` — Click. Boot hit-tests, then sendto* the object. arg is a point.
- `setcursor` — Hover. Same dispatch as mousedown; sets cursor art.
- `idle` — Boot idle tick. Updates cursor via hittest.
- `openset` — SET load hook (per location).
- `closeset` — SET unload hook.
- `offerobject` — Use-item-on-world hook. Often empty.
- `runyoself` — Puppet conversation entry. Almost every PUP day script starts here.
- `menuselect` — Menu item by string (`quit`, `volume 3`, …).

Cast library (`CST/_GANG/Cast.txt`, also `_MINE` / `_EXTRA` copies):

- `stdactor(who)` — `actorspeed` / `actorscale` / `actorturn` from `std*` of `actorset(who)`, then visible, stand, `actorzclip(who, 32)`.
- `stdscale(theset)` — town **1450**; interiors 2400–5800 (chin 5800, sallower 4500, store 4000, …). See the switch in `Cast.txt`.
- `hotdist()` — town / jail / hotlower / sallower **384**; else 512. Talk / touch cursor uses `realdist < hotdist`.
- Individual `setupactor` often overrides scale after `stdactor` (Leroy sign **1100**).

## 3. Game library (`new.flt` / inventory)

Boot does `openstagefile ("new.flt")`. SET scripts then `sendtostage (spotmovie (…))` etc.

### `spotmovie`

Fade out, playmovie(name), fade back to set or puppet.

- **Args:** filename string (`apothpig.mov`)
- **Defined in:** FLT/_NEW (openstagefile "new.flt")
- **Dump:** FLT/_NEW/setcursor _arg_.txt:58, FLT/_SUNDIAL/offerobject _what_.txt:105
- Not an opcode. SET scripts write sendtostage (spotmovie ("….mov")).
- Engine verb underneath is playmovie.

### `gototown`

Leave an interior for the street. Night (clock=3) loads nite.set, else town.set. Restores townscene.

- **Args:** facing string (`north`, currentview(), …)
- **Defined in:** FLT/_NEW
- **Dump:** FLT/_NEW/setcursor _arg_.txt:17, FLT/_TARGET/gototown _dirname_.txt:3

### `gotointerior`

If current set is town, remember townscene, then opensetfile the interior.

- **Args:** set filename (`school.set`, `nitescho.set`, …)
- **Defined in:** FLT/_NEW
- **Dump:** FLT/_NEW/setcursor _arg_.txt:8

### `gotospecial`

Fade, closesetfile, opensetfile, optional currentscene/currentview, blacktoscreen.

- **Args:** setname, scenename, dirname (empty string = skip)
- **Defined in:** FLT/_NEW
- **Dump:** FLT/_NEW/setcursor _arg_.txt:27, FLT/_TARGET/gototown _dirname_.txt:9

### `advanceday`

Advances clock, or day when clock was 3. Plays day-change movies, inits sets, resets a lot of globals. Boot calls sendtostage (advanceday ()) after setting day=1 clock=2 phase=1 — that forces the first-slot setup (clock becomes 3 on day 1).

- **Args:** none
- **Defined in:** FLT/_NEW
- **Dump:** FLT/_NEW/setcursor _arg_.txt:86
- Day 1 start cash is 5 (999 if debugging).
- Day-change MOV names are d1nd2m, d2md2a, d2ad2n, …

### `initall`

Stop loops/walks, switch SET, re-init gang actors and inven props.

- **Args:** logical set name, file to opensetfile
- **Defined in:** FLT/_NEW
- **Dump:** FLT/_NEW/setcursor _arg_.txt:206

### `canadvance`

Whether the player is allowed to sleep/advance this slot. Encodes item gates (gun/boots/bullets on day 2 morning, ring+pages day 3, mask+yunnibook+flute later).

- **Args:** none
- **Returns:** true/false
- **Defined in:** FLT/_NEW
- **Dump:** FLT/_NEW/setcursor _arg_.txt:247

### `addinven`

Put an item in inventory. Boot gives helpbut at start.

- **Args:** item id string (`cards`, `gun`, `helpbut`, …)
- **Defined in:** PRP/_INVEN
- **Dump:** PRP/_INVEN/setcursor _arg__1.txt:195

## 4. High-value opcodes

Id bands (observed): `4xxx` language, `8xxx` operator, `12xxx` command, `16xxx` field get/set, `20xxx` function (returns a value), `24xxx` transition.

### `puppetspeak` (12043, command)

Play a puppet dialogue line (audio + face). Scripts stack several in a row with no wait loop, unlike voicesound.

- **Confidence:** inferred
- **Args:** line id string (`jenix.5`, `jones.1`). Rarely a second integer (Jones: puppetspeak ("jones.33", 101) in place of a bevel).
- **Returns:** none (command band)
- **Blocks:** inferred yes — sequential conversation would break if it returned immediately
- **Calls in dump:** 4303  arities [1, 2]
- Almost always one string. Maps to PUP/_NAME/AUDIO/*.wav + texts.csv.
- Compare voicesound: scripts poll currentvoice() != "none". puppetspeak is never polled that way.
- Example: `puppetspeak ("blood.add.6")`  (PUP/_BLOOD/Boot Script.txt:22)
- Example: `puppetspeak ("blood.add.7")`  (PUP/_BLOOD/Boot Script.txt:25)
- Example: `puppetspeak ("blood.add.9")`  (PUP/_BLOOD/Boot Script.txt:28)

### `puppetclear` (12041, command)

Clear the current speech/choice UI before offering a new bevel set.

- **Confidence:** proven-scripts
- **Args:** none
- **Returns:** none
- **Blocks:** inferred no
- **Calls in dump:** 430  arities [0]
- Jones/Jenix always puppetclear() then one or more puppetbevel() then puppetevent().
- Example: `puppetclear ()`  (PUP/_BLOOD/day1.txt:29)

### `puppetbevel` (12044, command)

Register one dialogue choice. Does not wait. Ids are later returned by puppetevent.

- **Confidence:** proven-scripts
- **Args:** label string, choice id integer
- **Returns:** none
- **Blocks:** no — several bevels are issued, then one puppetevent
- **Calls in dump:** 1207  arities [2]
- Jenix: puppetbevel ("Yes, here is the money.", 101) then case 101.
- Jones uses 101–104 as topic ids. 55555 is the inventory-hand bevel (with addhandbevel), not a spoken line.
- Duplicate ids in one menu are legal (Jones subrack1 offers two lines both as 101).
- Example: `puppetbevel ("Would you like something...?", 55555)`  (PRP/_INVEN/setcursor _arg__1.txt:294)
- Example: `puppetbevel ("Would you like something else...?", 55555)`  (PRP/_INVEN/setcursor _arg__1.txt:299)
- Example: `puppetbevel ("Would you like this bone?", 55555)`  (PRP/_INVEN/setcursor _arg__1.txt:301)

### `puppetevent` (20028, function)

Wait for the player to pick a bevel (or dismiss). Returns that id.

- **Confidence:** proven-scripts
- **Args:** always (-1) in Dust
- **Returns:** integer: choice id, or -1 dismiss, or 55555 inventory bevel
- **Blocks:** yes
- **Calls in dump:** 410  arities [1]
- arg = puppetevent (-1) then switch arg / case -1 / case 101 …
- Meaning of the -1 argument is unproven in DF.EXE (sentinel / timeout / allow-dismiss). Do not invent other values; Dust always passes -1.
- Example: `puppetevent (-1)`  (PUP/_BLOOD/day1.txt:36)
- Example: `puppetevent (240)`  (PUP/_BLOOD/day1.txt:407)

### `plugin` (12027, command)

Call a native plugin for side effect (no value used).

- **Confidence:** proven-scripts
- **Args:** verb string, then plugin-specific args
- **Returns:** none
- **Blocks:** unknown
- **Calls in dump:** 1  arities [2]
- Boot debug menu: plugin ("writestats", "gblw").
- CHECKERS.DLL exports PlugProc only; the verb string is dispatched inside the DLL.
- Example: `plugin ("writestats", "gblw")`  (BOOT/_BOOTFILE/Script 1.txt:247)

### `pluginfx` (20098, function)

Call a native plugin and use the return value.

- **Confidence:** proven-scripts
- **Args:** verb string, then plugin-specific args
- **Returns:** whatever the plugin returns (checkers: a string)
- **Blocks:** unknown
- **Calls in dump:** 2  arities [4]
- move = pluginfx ("checkmove", mainboard, count, 0)
- playerjumps = pluginfx ("checkmove", mainboard, 0, 1)
- Empty string means no moves (AI loss / no jumps).
- Returned move list is comma-separated; each move is words parsed with findword.
- Player-legal step/jump tests also exist in PRP/_CHECKERS scripts (goodmove/goodjump). The DLL is the AI / jump-generator, not the only rules copy.
- Example: `pluginfx ("checkmove", mainboard, count, 0)`  (PRP/_CHECKERS/automove_1.txt:14)
- Example: `pluginfx ("checkmove", mainboard, 0, 1)`  (PRP/_CHECKERS/automove_1.txt:48)

### `playmovie` (12017, command)

Play a MOV file (full-screen cutscene). Engine verb.

- **Confidence:** inferred
- **Args:** filename string (`intro.mov`, `d2md2a.mov`, …)
- **Returns:** none
- **Blocks:** inferred yes (boot plays intro then intro2 in order; spotmovie wraps it with fades)
- **Calls in dump:** 59  arities [1]
- Still holds: 80-byte records at MOV header+0x8C2. Tick = timeGetTime()*3/50 (60 Hz). See findings.md §7.
- Group A (header+0x1A): start when record+32 equals the 1-based slot; retrigger restarts that slot.
- A new scene’s A line is held until the previous scene’s A line’s original end (INTRO clip 325 vs 423).
- Group B (header+0x1C): sequential theme playlist at +0x83E; a scene with n_b=0 keeps the previous bed.
- Stills are deltas into one framebuffer. Scene headers are not images — keep prior pixels.
- Each scene header loads a 256-entry palette at +0x3E. RGB/PNG must use that palette.
- Example: `playmovie ("intro.mov")`  (BOOT/_BOOTFILE/Script 1.txt:50)
- Example: `playmovie ("intro2.mov")`  (BOOT/_BOOTFILE/Script 1.txt:54)
- Example: `playmovie ("skeleton.mov")`  (CST/_MINE/skeleton/Script.txt:89)

### `opensetfile` (12032, command)

Load a SET (location). Library gotospecial calls this after closesetfile.

- **Confidence:** proven-scripts
- **Args:** filename (`town.set`, `nite.set`, `hotroom.set`, …)
- **Returns:** none
- **Blocks:** inferred yes
- **Calls in dump:** 16  arities [1]
- Example: `opensetfile (setname)`  (FLT/_NEW/setcursor _arg_.txt:32)
- Example: `opensetfile (newset)`  (FLT/_NEW/setcursor _arg_.txt:224)
- Example: `opensetfile ("hotlower.set")`  (PUP/_BLOOD/day1.txt:50)

### `closesetfile` (12033, command)

Unload the current SET.

- **Confidence:** proven-scripts
- **Args:** none in library use
- **Returns:** none
- **Calls in dump:** 17  arities [0]
- Example: `closesetfile ()`  (FLT/_NEW/death.txt:14)

### `sendtostage` (12070, command)

Run an expression in the stage (open FLT / new.flt) context.

- **Confidence:** proven-scripts
- **Args:** a call, e.g. spotmovie ("x.mov"), advanceday (), gotointerior ("school.set")
- **Returns:** none
- **Calls in dump:** 282  arities [1]
- This is message-send, not a file load. The first argument is the thing to run, not a filename.
- sendtoactor/prop/scene/flat/shop/cast/set/button/boot are the same idea with different namespaces.
- Example: `sendtostage (advanceday ())`  (BOOT/_BOOTFILE/Script 1.txt:62)
- Example: `sendtostage (spotmovie ("bountdie.mov"))`  (CST/_EXTRA/bounty1/Script.txt:228)
- Example: `sendtostage (spotmovie ("dog2.mov"))`  (CST/_EXTRA/dog/Script.txt:106)

### `sendtoactor` (12016, command)

Run an expression on a named actor (cast member).

- **Confidence:** proven-scripts
- **Args:** actor name string, then a call (mousedown, setupactor, putdownactor, resetactor, …)
- **Returns:** none
- **Calls in dump:** 377  arities [2]
- Names are short (`JENIX`, `watson`, `bolivar`), not `jenix.pup`.
- setupactor/putdownactor/resetactor are user procedures on CST scripts, not opcodes.
- Example: `sendtoactor (thename, mousedown (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:119)
- Example: `sendtoactor (thename, setcursor (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:168)
- Example: `sendtoactor (name, putdownactor ())`  (CST/_EXTRA/bounty1/Script.txt:699)

### `sendtopuppet` (12045, command)

Run an expression on the current/named puppet.

- **Confidence:** inferred
- **Args:** see call sites
- **Returns:** none
- **Calls in dump:** 112  arities [2]
- Example: `sendtopuppet ("boot script", runyoself ())`  (CST/_GANG/Dell/Script.txt:120)
- Example: `sendtopuppet ("boot script", gift (name))`  (PRP/_INVEN/setcursor _arg__1.txt:283)
- Example: `sendtopuppet ("day" @ numtostring (day), runyoself ())`  (PUP/_BLOOD/Boot Script.txt:10)

### `sendtoset` (12067, command)

Run an expression on the current SET.

- **Confidence:** inferred
- **Args:** a call
- **Calls in dump:** 10  arities [1]
- Example: `sendtoset (hit ())`  (CST/_EXTRA/bounty1/Script.txt:346)
- Example: `sendtoset (closefight ())`  (CST/_EXTRA/bounty1/Script.txt:702)
- Example: `sendtoset (gotohub ())`  (CST/_MINE/skeleton/Script.txt:94)

### `sendtoshop` (12059, command)

Run an expression on a PRP shop (inventory is `inven`).

- **Confidence:** proven-scripts
- **Args:** shop name, then a call (addinven, addhandbevel, initprops, …)
- **Calls in dump:** 296  arities [2]
- Example: `sendtoshop ("inven", addinven ("helpbut"))`  (BOOT/_BOOTFILE/Script 1.txt:63)
- Example: `sendtoshop ("inven", giveinven (what, me))`  (CST/_EXTRA/birdcage/Script.txt:61)
- Example: `sendtoshop ("inven", dumpinven (what))`  (CST/_EXTRA/dog/Script.txt:105)

### `sendtocast` (12048, command)

Broadcast to a CST (`gang`, `extra`).

- **Confidence:** proven-scripts
- **Args:** cast name, then a call (initactors, …)
- **Calls in dump:** 41  arities [2]
- Example: `sendtocast ("gang", runpuppet ("jenix.pup"))`  (CST/_EXTRA/Jenix/Script.txt:79)
- Example: `sendtocast ("gang", giftpuppet ("jenix.pup", what))`  (CST/_EXTRA/Jenix/Script.txt:90)
- Example: `sendtocast ("gang", runpuppet ("shaman.pup"))`  (CST/_EXTRA/shaman/Script.txt:70)

### `sendtoscene` (12034, command)

Run an expression on a SET scene (tile).

- **Confidence:** proven-scripts
- **Args:** scene name or currentscene(), then a call
- **Calls in dump:** 26  arities [2]
- Boot: sendtoscene (currentscene (), keydown (arg)).
- Example: `sendtoscene (currentscene (), keydown (arg))`  (BOOT/_BOOTFILE/Script 1.txt:82)
- Example: `sendtoscene (thename, mousedown (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:125)
- Example: `sendtoscene (thename, setcursor (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:174)

### `sendtoprop` (12055, command)

Run an expression on a named prop.

- **Confidence:** proven-scripts
- **Args:** prop name, then a call
- **Calls in dump:** 234  arities [2]
- Example: `sendtoprop (thename, mousedown (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:121)
- Example: `sendtoprop (thename, setcursor (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:170)
- Example: `sendtoprop ("gunhand", idle ())`  (CST/_EXTRA/bounty1/Script.txt:227)

### `sendtoflat` (12069, command)

Run an expression on a FLT (`flat 0`, currentflat(), mainpanel).

- **Confidence:** proven-scripts
- **Args:** flat name, then a call
- **Calls in dump:** 74  arities [2]
- Example: `sendtoflat (currentflat (), keydown (arg))`  (BOOT/_BOOTFILE/Script 1.txt:85)
- Example: `sendtoflat ("mainpanel", bullet (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:112)
- Example: `sendtoflat (thename, mousedown (thepoint))`  (BOOT/_BOOTFILE/Script 1.txt:127)

### `sendtoboot` (12081, command)

Run an expression in boot context.

- **Confidence:** inferred
- **Args:** a call
- **Calls in dump:** 1  arities [1]
- Example: `sendtoboot (idle ())`  (PRP/_INVEN/setcursor _arg__1.txt:395)

### `hittest` (20070, function)

What is under a point? Stores the kind in result() and returns the object name.

- **Confidence:** proven-scripts
- **Args:** point
- **Returns:** object name string; kind is result() = actor|prop|button|scene|flat|none
- **Calls in dump:** 3  arities [1]
- Boot mousedown: thename = hittest (thepoint) / switch result ().
- Example: `hittest (thepoint)`  (BOOT/_BOOTFILE/Script 1.txt:116)

### `result` (16010, field)

Kind of the last hittest (and possibly other queries).

- **Confidence:** proven-scripts
- **Args:** none when used as result ()
- **Returns:** string kind
- **Calls in dump:** 9  arities [0]
- Example: `result ()`  (BOOT/_BOOTFILE/Script 1.txt:117)

### `pointx` (20002, function)

X of a point, in still pixels. Dust stills are 512 wide.

- **Confidence:** proven-scripts
- **Args:** point (mousedown/setcursor arg, or mouse())
- **Returns:** integer
- **Calls in dump:** 441  arities [1]
- Scene A2: pointx (arg) > 228 & pointx (arg) < 299 — exclusive bounds.
- Boot: pointx > 512 → right, < 0 → left (click off the plate turns).
- Example: `pointx (thepoint)`  (BOOT/_BOOTFILE/Script 1.txt:133)
- Example: `pointx (arg)`  (FLT/_CURE/setcursor _arg_.txt:12)
- Example: `pointx (endloc)`  (PRP/_CHECKERS/setcursor _arg__2.txt:31)

### `pointy` (20003, function)

Y of a point, in still pixels. Outdoor stills are 512×264.

- **Confidence:** proven-scripts
- **Args:** point
- **Returns:** integer
- **Calls in dump:** 431  arities [1]
- Boot: pointy < 0 → uparrow (walk). Click above the plate walks forward.
- Example: `pointy (thepoint)`  (BOOT/_BOOTFILE/Script 1.txt:129)
- Example: `pointy (arg)`  (PRP/_CHECKERS/setcursor _arg__2.txt:21)
- Example: `pointy (endloc)`  (PRP/_CHECKERS/setcursor _arg__2.txt:31)

### `pointinprop` (20040, function)

Is the point inside a named prop sprite?

- **Confidence:** proven-scripts
- **Args:** prop name, point
- **Returns:** true/false
- **Calls in dump:** 7  arities [2]
- Example: `pointinprop ("gunhand", thepoint)`  (BOOT/_BOOTFILE/Script 1.txt:111)
- Example: `pointinprop (me, arg)`  (PRP/_HOUSE/initprop_556.txt:35)
- Example: `pointinprop (findword (playerhand, " ", count), epoint)`  (PRP/_SALGAMES/mousedown _arg__522.txt:16)

### `pointinset` (20041, function)

Is the point inside the SET view (the 512×264 plate)?

- **Confidence:** proven-scripts
- **Args:** point
- **Returns:** true/false
- **Calls in dump:** 3  arities [1]
- Example: `pointinset (thepoint)`  (BOOT/_BOOTFILE/Script 1.txt:110)
- Example: `pointinset (arg)`  (PRP/_INVEN/setcursor _arg__1.txt:133)

### `mouse` (20006, function)

Current pointer as a point (idle cursor path).

- **Confidence:** proven-scripts
- **Args:** none
- **Returns:** point
- **Calls in dump:** 40  arities [0]
- Example: `mouse ()`  (BOOT/_BOOTFILE/Script 1.txt:158)

### `cursor` (12039, command)

Set cursor art by name.

- **Confidence:** proven-scripts
- **Args:** string: arrow, touch, watch, sight, gostrait, goleft, goright, …
- **Returns:** none
- **Calls in dump:** 340  arities [1]
- Bitmaps themselves are not in the script. UI chrome is still a gap.
- Example: `cursor ("watch")`  (BOOT/_BOOTFILE/Script 1.txt:155)
- Example: `cursor ("sight")`  (BOOT/_BOOTFILE/Script 1.txt:161)
- Example: `cursor ("gostrait")`  (BOOT/_BOOTFILE/Script 1.txt:179)

### `actorowner` (16043, field)

Get or set an actor flag/owner string (memory).

- **Confidence:** proven-scripts
- **Args:** actor, value  → set.  actor only → get (usage-dependent)
- **Calls in dump:** 89  arities [1, 2]
- Jenix: actorowner ("JENIX", "gavemoney") after paying.
- Units/flag vocabulary are script strings, not enums in DF.EXE.
- Example: `actorowner (me, "none")`  (CST/_EXTRA/bird1/Script.txt:5)
- Example: `actorowner (me, "crow")`  (CST/_EXTRA/bird1/Script.txt:64)
- Example: `actorowner (me, "birdsing")`  (CST/_EXTRA/bird1/Script.txt:66)

### `actorstar` (16006, field)

Place an actor at a named star/waypoint.

- **Confidence:** proven-scripts
- **Args:** actor, star expression
- **Calls in dump:** 308  arities [1, 2]
- Jenix refuse-money: actorstar ("JENIX", "town.extra" @ numtostring (random (3))).
- @ is string concat. town.extra + "0"/"1"/"2" indexes EXTRA CST extras.
- A star is a named SET pin, not a sprite. Waypoint records store absolute xy; `DF.EXE` tiles are 256 units (`tile*256+128`). Star names live in waypoints.json.
- 50-byte SET records hold two stars. `town.leroy1` is slot B of `town.leroy2` at (1740, 3536). `town.leroy2` (2656, 2720) is the range.
- Cast `walktopuppet` in town walks to `playerxyz` facing that vector, then `turntodeg (currentdeg + 128)`.
- Example: `actorstar (me, "maydine.cage")`  (CST/_EXTRA/birdcage/Script.txt:29)
- Example: `actorstar (me, "town.chick1")`  (CST/_EXTRA/chicken1/Script.txt:31)
- Example: `actorstar (me, "town.chick2")`  (CST/_EXTRA/chicken1/Script.txt:34)

### `actorxyz` (16003, field)

Actor position. Field band — likely get/set.

- **Confidence:** unknown
- **Args:** see call sites
- **Calls in dump:** 172  arities [2, 4]
- Do not assume world units without a call site.
- Example: `actorxyz ("bird1", 4)`  (CST/_EXTRA/bird1/Script.txt:147)
- Example: `actorxyz (name, x, y, z)`  (CST/_EXTRA/bird1/Script.txt:217)
- Example: `actorxyz (me, 4)`  (CST/_EXTRA/birdcage/Script.txt:79)

### `walktostar` (12006, command)

Walk an actor to a named star.

- **Confidence:** proven-scripts
- **Args:** actor, star name **or** `"x,y,z"` string
- **Blocks:** async walk; Dust waits with `while iswalk { forceupdate }`
- **Calls in dump:** 66  arities [2]
- Named dest: `DF.EXE` `0x424000` loads the SET polyline at waypoint +0x18. Reverse when going B→A. `town.leroy2`/`leroy1` is container 262. No pair, or explicit `"x,y,z"`, is a beeline. `actorspeed` is units per 20 Hz game frame (boot `framerate (3)`); CST walk poses use setInfo +0x2e.
- Explicit `"x,y,z"` (town `walktopuppet`) is a beeline.
- Example: `walktostar (name, numtostring (x) @ "," @ numtostring (y) @ "," @ numtostring (z))`  (CST/_EXTRA/bird1/Script.txt:234)
- Example: `walktostar (me, where)`  (CST/_EXTRA/birdcage/Script.txt:20)
- Example: `walktostar (me, "birdstar2")`  (CST/_TARGET/birdtarg/Script.txt:5)

### `path` (16009, field)

Virtual search path. Slot get/set. `@` concatenates path pieces.

- **Confidence:** proven-scripts
- **Args:** path (n) → get slot n.  path (n, string) → set slot n.
- **Calls in dump:** 22  arities [1, 2]
- Boot: path (1, path (1) @ "local:"), path (2, "dust:data:"), path (3, "dust:movies:"), path (4, "dust:puppets:"), path (5, "dust:under:"), path (8, "dust:inven:").
- findfile/fileexists uses these slots. Browser remake maps them to dfextract/out/.
- Example: `path (1, path (1) @ "local:")`  (BOOT/_BOOTFILE/Script 1.txt:23)
- Example: `path (1)`  (BOOT/_BOOTFILE/Script 1.txt:23)
- Example: `path (2, "dust:data:")`  (BOOT/_BOOTFILE/Script 1.txt:24)

### `findfile` (20067, function)

True if a game file exists on the virtual path. Extracted txt prints fileexists.

- **Confidence:** proven-scripts
- **Args:** filename (`town.set`)
- **Returns:** true/false
- **Calls in dump:** 13  arities [1]
- Boot refuses to run if not findfile ("town.set").
- Example: `fileexists ("town.set")`  (BOOT/_BOOTFILE/Script 1.txt:35)
- Example: `fileexists (name @ ".pup")`  (SET/_NITE/Scene G14.txt:281)

### `@` (8007, operator)

String concat.

- **Confidence:** proven-scripts
- **Args:** infix: a @ b
- **Returns:** string
- **Calls in dump:** 0
- path (1) @ "local:", "town.extra" @ numtostring (random (3)).

### `me` (4026, language)

Language value: the current object in some sendto/plugin contexts.

- **Confidence:** inferred
- **Args:** none (token, not a call)
- **Calls in dump:** 0
- Checkers win ("me") is a user function argument, not this token.

### `target` (4027, language)

The object a sendto* is currently addressing.

- **Confidence:** proven-scripts
- **Args:** none (token)
- **Calls in dump:** 0
- INVEN setcursor: propview (target) = "small".

### `passcode` (4025, language)

Fall through: let the engine/default handler continue this event.

- **Confidence:** inferred
- **Args:** none (token)
- **Calls in dump:** 0
- SET mousedown/setcursor: after handling a hotspot, exitcode; otherwise passcode.
- Opposite of exitcode (stop this procedure).

### `exitcode` (4005, language)

Return from the current `code` block immediately.

- **Confidence:** proven-scripts
- **Args:** none (token)
- **Calls in dump:** 0
- case -1 on puppetevent → exitcode (player dismissed talk).

### `return` (4024, language)

Return a value from the current `code` block.

- **Confidence:** proven-scripts
- **Args:** expression (`return true`, `return (count)`)
- **Calls in dump:** 185  arities [1]
- Example: `return (1)`  (CST/_EXTRA/bounty1/Script.txt:206)
- Example: `return (0)`  (CST/_EXTRA/bounty1/Script.txt:216)
- Example: `return (true)`  (CST/_EXTRA/bounty1/Script.txt:267)

### `error` (12053, command)

Abort / debugger trap on impossible switch fallthrough.

- **Confidence:** inferred
- **Args:** none
- **Calls in dump:** 214  arities [0]
- canadvance and checkers decodemove call error () if no case matched.
- Example: `error ()`  (CST/_EXTRA/bird1/Script.txt:17)

### `savegame` (12077, command)

Write a save. Format unknown.

- **Confidence:** proven-scripts
- **Args:** title string (`Dust 0.3`) in the quit menu
- **Calls in dump:** 1  arities [1]
- Boot menuselect quit may questiondialog then savegame. Do not invent the file layout.
- Example: `savegame ("Dust 0.3")`  (BOOT/_BOOTFILE/Script 1.txt:225)

### `opengame` (12078, command)

Load a save. Format unknown.

- **Confidence:** unknown
- **Args:** see call sites
- **Calls in dump:** 0

### `dumpglobal` (4029, language)

Debug print a global. Also used to list checkers state.

- **Confidence:** proven-scripts
- **Args:** variable name, often without parens: dumpglobal mainboard
- **Calls in dump:** 0

### `code` (4001, language)

Start a procedure. First token of every script container.

- **Confidence:** proven-scripts
- **Args:** name (args)
- **Calls in dump:** 0
- Pairs with endcode. Nested code is not used; new procedures are sequential in the file.

### `if` (4006, language)

Conditional. Closed by endif. Optional else.

- **Confidence:** proven-scripts
- **Args:** condition expression. Parens optional in some files.
- **Calls in dump:** 10  arities [1]
- Example: `if (playerisat () & calcdist (actorxyz (me, 4), playerxyz (4)) < 256 * 4)`  (CST/_EXTRA/kidgang1/Script.txt:321)
- Example: `if (slot1 < 6 & random (adjust * 10) < 10)`  (FLT/_SALGAMES/initgame.txt:137)
- Example: `if (endrow -startrow = 2 | endrow -startrow = -2)`  (PRP/_CHECKERS/setcursor _arg__2.txt:64)

### `switch` (4009, language)

Switch. case / endswitch. case bodies do not fall through in Dust usage (each case exits or ends).

- **Confidence:** inferred
- **Args:** expression. `switch (arg)` or `switch arg`.
- **Calls in dump:** 2  arities [1]
- Whether case falls through is unproven in DF.EXE. Dust scripts treat cases as exclusive.
- Example: `switch (arg)`  (BOOT/_BOOTFILE/Script 1.txt:73)
- Example: `switch (total)`  (FLT/_SALGAMES/initgame.txt:270)

### `global` (4002, language)

Declare globals (persist across procedures / save).

- **Confidence:** proven-scripts
- **Args:** comma-separated names
- **Calls in dump:** 0
- Boot declares day, clock, phase, handitem, …

### `local` (4003, language)

Declare locals for this procedure.

- **Confidence:** proven-scripts
- **Args:** comma-separated names
- **Calls in dump:** 0

### `true` (4021, language)

Boolean constant (opcode, not a variable).

- **Confidence:** proven-scripts
- **Calls in dump:** 0

### `false` (4022, language)

Boolean constant (opcode, not a variable).

- **Confidence:** proven-scripts
- **Calls in dump:** 0

### `framerate` (16022, field)

Boot calls framerate (3). Units unknown (MOVPLAY also has a framerate string).

- **Confidence:** unknown
- **Args:** integer
- **Calls in dump:** 16  arities [0, 1]
- Do not treat 3 as 3 fps. SET walker currently uses ~24 fps from play, not this.
- Example: `framerate (3)`  (BOOT/_BOOTFILE/Script 1.txt:19)
- Example: `framerate ()`  (PRP/_CRACK/mousedown _arg__2.txt:10)
- Example: `framerate (1)`  (PRP/_CRACK/mousedown _arg__2.txt:11)

### `delay` (12004, command)

Wait some ticks. Unit unknown (boot blacktoscreen uses 30; checkers delay (45)).

- **Confidence:** inferred
- **Args:** integer
- **Blocks:** inferred yes
- **Calls in dump:** 107  arities [1]
- Example: `delay (30)`  (CST/_EXTRA/birdcage/Script.txt:65)
- Example: `delay (3)`  (CST/_EXTRA/bounty1/Script.txt:305)
- Example: `delay (60)`  (CST/_EXTRA/dog/Script.txt:108)

### `voicesound` (12026, command)

Start a voice clip. Asynchronous: scripts wait with while currentvoice () != "none".

- **Confidence:** proven-scripts
- **Args:** line id (`bol.102`)
- **Blocks:** no
- **Calls in dump:** 240  arities [1]
- Example: `voicesound ("seed1")`  (CST/_EXTRA/birdcage/Script.txt:64)
- Example: `voicesound ("seed2")`  (CST/_EXTRA/birdcage/Script.txt:67)
- Example: `voicesound ("shotgun")`  (CST/_EXTRA/bounty1/Script.txt:343)

### `currentvoice` (20078, function)

Playing voice id, or "none".

- **Confidence:** proven-scripts
- **Args:** none
- **Returns:** string
- **Calls in dump:** 35  arities [0]
- Example: `currentvoice ()`  (FLT/_NEW/death.txt:147)

### `currentdir` (16011, field)

Facing. Extracted txt prints currentview.

- **Confidence:** proven-scripts
- **Args:** get: none. set: `north`/`south`/`east`/`west`/`strait`/`left`/`right` depending on caller
- **Calls in dump:** 652  arities [0, 1]
- SET boot keydown: currentscene ("strait"/"left"/"right") — those are walk/turn commands on the scene, not compass.
- gotospecial sets currentview (dirname) to a compass word.
- Example: `currentview ("north")`  (CST/_EXTRA/dog/Script.txt:103)
- Example: `currentview ()`  (CST/_EXTRA/dog/Script.txt:110)
- Example: `currentview ("west")`  (CST/_GANG/Bolivar/Script.txt:209)

### `currentscene` (16029, field)

Get/set the SET tile (`scene g15`, `scene a1`) or issue a walk/turn (`strait`, `left`, `right`).

- **Confidence:** proven-scripts
- **Args:** optional string
- **Calls in dump:** 210  arities [0, 1]
- Example: `currentscene ()`  (BOOT/_BOOTFILE/Script 1.txt:82)
- Example: `currentscene ("scene g12")`  (CST/_EXTRA/dog/Script.txt:104)
- Example: `currentscene ("right")`  (CST/_EXTRA/dog/Script.txt:109)

### `clut` (12038, command)

Palette / fade target named `black` or `set` or `puppet`.

- **Confidence:** inferred
- **Args:** string
- **Calls in dump:** 25  arities [1]
- Example: `clut ("black")`  (BOOT/_BOOTFILE/Script 1.txt:49)
- Example: `clut ("set")`  (BOOT/_BOOTFILE/Script 1.txt:104)
- Example: `clut ("stage")`  (SET/_MAYROOM/Scene B2.txt:31)

### `blackscreen` (12051, command)

Cut to black.

- **Confidence:** inferred
- **Args:** none
- **Calls in dump:** 58  arities [0]
- Example: `blackscreen ()`  (BOOT/_BOOTFILE/Script 1.txt:29)

### `blacktoscreen` (12049, command)

Fade up onto set/stage/puppet.

- **Confidence:** inferred
- **Args:** layer string (`set`, `stage`, `puppet`), duration integer
- **Calls in dump:** 87  arities [2]
- Example: `blacktoscreen ("stage", 30)`  (FLT/_CHECKERS/playcheckers.txt:7)
- Example: `blacktoscreen ("set", 30)`  (FLT/_CHECKERS/playcheckers.txt:17)
- Example: `blacktoscreen ("stage", 20)`  (FLT/_CREDITS/openstage.txt:45)

### `screentoblack` (12050, command)

Fade down.

- **Confidence:** inferred
- **Args:** `current` plus duration, in library use
- **Calls in dump:** 110  arities [2]
- Example: `screentoblack ("puppet", 10)`  (CST/_GANG/Dell/Script.txt:121)
- Example: `screentoblack ("current", 30)`  (CST/_MINE/skeleton/Script.txt:87)
- Example: `screentoblack ("stage", 30)`  (FLT/_CHECKERS/setcursor _arg_.txt:37)

## 5. Still unknown (do not invent)

- Exact `delay (n)` units; SET walk fps (~24) is from play, not DF.EXE. `framerate (3)` with `hasattention` is 60/3 script Hz (inferred).
- MOV reel timing / audio cues (see dfextract reconstruction-gaps §4a).
- `walktostar` named dest uses the SET polyline at waypoint +0x18 (not BFS). Scripts wait with `while iswalk { forceupdate }`. `actorxyz` is SET units (256/tile in the EXE; scripts often `/ 256`). `actorspeed` is units per 20 Hz game frame.
- Save file layout (`savegame` / `opengame`).
- `pluginfx("checkmove", …)` encoding inside CHECKERS.DLL (scripts already parse the returned string).
- UI chrome besides cursors (bevel / inventory layout). Cursors:
  `dustdecompile/out/rsrc/cursors/{touch,arrow,watch,…}.png`.
- How `animLogic` (now in `texts.csv`) maps to jaw/mouth frames.

## 6. Every Dust opcode

| Id | Dust name | Name in `.txt` | Band | Calls |
|---|---|---|---|---|
| 4001 | `code` | — | language | 0 |
| 4002 | `global` | — | language | 0 |
| 4003 | `local` | — | language | 0 |
| 4004 | `endcode` | — | language | 0 |
| 4005 | `exitcode` | — | language | 0 |
| 4006 | `if` | — | language | 10 |
| 4007 | `endif` | — | language | 0 |
| 4008 | `else` | — | language | 0 |
| 4009 | `switch` | — | language | 2 |
| 4010 | `endswitch` | — | language | 0 |
| 4011 | `case` | — | language | 0 |
| 4012 | `for` | — | language | 0 |
| 4013 | `to` | — | language | 0 |
| 4014 | `step` | — | language | 0 |
| 4015 | `endfor` | — | language | 0 |
| 4016 | `while` | — | language | 0 |
| 4017 | `endwhile` | — | language | 0 |
| 4018 | `(` | — | language | 0 |
| 4019 | `)` | — | language | 0 |
| 4020 | `,` | — | language | 0 |
| 4021 | `true` | — | language | 0 |
| 4022 | `false` | — | language | 0 |
| 4023 | `not` | — | language | 1 |
| 4024 | `return` | — | language | 185 |
| 4025 | `passcode` | — | language | 0 |
| 4026 | `me` | — | language | 0 |
| 4027 | `target` | — | language | 0 |
| 4028 | `dumplocal` | — | language | 0 |
| 4029 | `dumpglobal` | — | language | 0 |
| 8001 | `+` | — | operator | 0 |
| 8002 | `-` | — | operator | 0 |
| 8003 | `*` | — | operator | 0 |
| 8004 | `/` | — | operator | 0 |
| 8005 | `&` | — | operator | 0 |
| 8005 | `and` | — | operator | 0 |
| 8006 | `or` | — | operator | 0 |
| 8006 | `|` | — | operator | 0 |
| 8007 | `@` | — | operator | 0 |
| 8008 | `=` | — | operator | 0 |
| 8010 | `>` | — | operator | 0 |
| 8011 | `<` | — | operator | 0 |
| 12001 | `message` | — | command | 95 |
| 12002 | `hidecursor` | — | command | 0 |
| 12003 | `showcursor` | — | command | 0 |
| 12004 | `delay` | — | command | 107 |
| 12005 | `makeloop` | — | command | 371 |
| 12006 | `walktostar` | — | command | 66 |
| 12007 | `makeball` | makecricket | command | 3 |
| 12008 | `exportclut` | — | command | 0 |
| 12009 | `visualeffect` | — | command | 79 |
| 12010 | `stopwalk` | — | command | 128 |
| 12011 | `stoploop` | — | command | 219 |
| 12012 | `stopball` | stopcricket | command | 52 |
| 12013 | `opencastfile` | — | command | 4 |
| 12014 | `closecastfile` | — | command | 2 |
| 12015 | `actorscript` | — | command | 6 |
| 12016 | `sendtoactor` | — | command | 377 |
| 12017 | `playmovie` | — | command | 59 |
| 12018 | `openpuppetfile` | — | command | 22 |
| 12019 | `opentrackfile` | — | command | 60 |
| 12020 | `closetrackfile` | — | command | 49 |
| 12021 | `playtheme` | — | command | 20 |
| 12022 | `singlesound` | — | command | 167 |
| 12023 | `multiplesound` | — | command | 15 |
| 12024 | `dualsound` | — | command | 1 |
| 12025 | `bothsound` | — | command | 0 |
| 12026 | `voicesound` | — | command | 240 |
| 12027 | `plugin` | — | command | 1 |
| 12028 | `haltsound` | — | command | 8 |
| 12029 | `halttheme` | — | command | 5 |
| 12030 | `haltvoice` | — | command | 4 |
| 12031 | `bootscript` | — | command | 1 |
| 12032 | `opensetfile` | — | command | 16 |
| 12033 | `closesetfile` | — | command | 17 |
| 12034 | `sendtoscene` | — | command | 26 |
| 12035 | `setscript` | — | command | 1 |
| 12036 | `scenescript` | — | command | 1 |
| 12037 | `floorscript` | paintingscript | command | 0 |
| 12038 | `clut` | — | command | 25 |
| 12039 | `cursor` | — | command | 340 |
| 12040 | `debugger` | — | command | 0 |
| 12041 | `puppetclear` | — | command | 430 |
| 12042 | `closepuppetfile` | — | command | 25 |
| 12043 | `puppetspeak` | — | command | 4303 |
| 12044 | `puppetbevel` | — | command | 1207 |
| 12045 | `sendtopuppet` | — | command | 112 |
| 12046 | `puppetscript` | — | command | 12 |
| 12047 | `castscript` | — | command | 0 |
| 12048 | `sendtocast` | — | command | 41 |
| 12049 | `blacktoscreen` | — | command | 87 |
| 12050 | `screentoblack` | — | command | 110 |
| 12051 | `blackscreen` | — | command | 58 |
| 12052 | `forceupdate` | — | command | 205 |
| 12053 | `error` | — | command | 214 |
| 12054 | `propscript` | — | command | 9 |
| 12055 | `sendtoprop` | — | command | 234 |
| 12056 | `openshopfile` | — | command | 25 |
| 12057 | `closeshopfile` | — | command | 12 |
| 12058 | `shopscript` | — | command | 0 |
| 12059 | `sendtoshop` | — | command | 296 |
| 12060 | `openstagefile` | — | command | 62 |
| 12061 | `closestagefile` | — | command | 61 |
| 12062 | `gotoflat` | — | command | 57 |
| 12063 | `stagescript` | — | command | 1 |
| 12064 | `flatscript` | — | command | 1 |
| 12065 | `buttonscript` | — | command | 0 |
| 12066 | `sendtofloor` | sendtopainting | command | 0 |
| 12067 | `sendtoset` | — | command | 10 |
| 12068 | `sendtobutton` | — | command | 6 |
| 12069 | `sendtoflat` | — | command | 74 |
| 12070 | `sendtostage` | — | command | 282 |
| 12071 | `quit` | — | command | 4 |
| 12072 | `turntodeg` | — | command | 67 |
| 12073 | `flushevents` | — | command | 27 |
| 12074 | `puppetgrab` | — | command | 59 |
| 12075 | `actorinstance` | — | command | 13 |
| 12076 | `propinstance` | — | command | 65 |
| 12077 | `savegame` | — | command | 1 |
| 12078 | `opengame` | — | command | 0 |
| 12079 | `notedialog` | — | command | 2 |
| 12080 | `drawstring` | — | command | 6 |
| 12081 | `sendtoboot` | — | command | 1 |
| 12082 | `mixclut` | — | command | 15 |
| 12083 | `puppetscramble` | — | command | 28 |
| 12084 | `puppetsubtitle` | — | command | 0 |
| 12085 | `actorwarm` | — | command | 4 |
| 12086 | `propwarm` | — | command | 0 |
| 12087 | `shopwarm` | — | command | 2 |
| 12088 | `castwarm` | — | command | 0 |
| 16001 | `actorvisible` | — | field | 169 |
| 16002 | `actordeg` | — | field | 148 |
| 16003 | `actorxyz` | — | field | 172 |
| 16004 | `actorxy` | — | field | 0 |
| 16005 | `actoris3d` | — | field | 1 |
| 16006 | `actorstar` | — | field | 308 |
| 16007 | `setvisible` | — | field | 42 |
| 16008 | `stagevisible` | — | field | 1 |
| 16009 | `path` | — | field | 22 |
| 16010 | `result` | — | field | 9 |
| 16011 | `currentdir` | currentview | field | 652 |
| 16012 | `actordist` | — | field | 12 |
| 16013 | `propdist` | — | field | 71 |
| 16014 | `actorpose` | — | field | 267 |
| 16015 | `propvisible` | — | field | 353 |
| 16016 | `propdeg` | — | field | 264 |
| 16017 | `propxyz` | — | field | 128 |
| 16018 | `propxy` | — | field | 281 |
| 16019 | `propis3d` | — | field | 1 |
| 16020 | `propstar` | — | field | 15 |
| 16021 | `actorset` | — | field | 204 |
| 16022 | `framerate` | — | field | 16 |
| 16023 | `actorspeed` | — | field | 17 |
| 16024 | `actorscale` | — | field | 36 |
| 16025 | `propview` | — | field | 242 |
| 16026 | `propspeed` | — | field | 2 |
| 16027 | `propset` | — | field | 96 |
| 16028 | `propscale` | — | field | 45 |
| 16029 | `currentscene` | — | field | 210 |
| 16030 | `variable` | — | field | 33 |
| 16031 | `currentdeg` | — | field | 6 |
| 16032 | `propowner` | — | field | 306 |
| 16033 | `wavevolume` | — | field | 3 |
| 16034 | `actorhitbox` | currentcd | field | 19 |
| 16035 | `camerahi` | — | field | 0 |
| 16036 | `actorturn` | — | field | 8 |
| 16037 | `menuvisible` | — | field | 1 |
| 16038 | `soundpan` | — | field | 0 |
| 16039 | `soundloop` | — | field | 30 |
| 16040 | `soundvol` | — | field | 42 |
| 16041 | `themevol` | — | field | 20 |
| 16042 | `propvalue` | — | field | 106 |
| 16043 | `actorowner` | — | field | 89 |
| 16044 | `actorvalue` | — | field | 204 |
| 16045 | `keyaborts` | — | field | 1 |
| 16046 | `pauseloop` | — | field | 152 |
| 16047 | `pauseball` | pausecricket | field | 33 |
| 16048 | `pausewalk` | — | field | 33 |
| 16049 | `puppetparam` | — | field | 20 |
| 16050 | `puppetvisible` | — | field | 2 |
| 16051 | `actorzclip` | — | field | 26 |
| 16052 | `propzclip` | — | field | 16 |
| 16053 | `puppetbase` | — | field | 22 |
| 20001 | `random` | — | function | 656 |
| 20002 | `pointx` | — | function | 441 |
| 20003 | `pointy` | — | function | 431 |
| 20004 | `makepoint` | — | function | 8 |
| 20005 | `button` | — | function | 5 |
| 20006 | `mouse` | — | function | 40 |
| 20007 | `stilldown` | — | function | 26 |
| 20008 | `tick` | — | function | 0 |
| 20009 | `iswalk` | — | function | 20 |
| 20010 | `isloop` | — | function | 0 |
| 20011 | `isball` | iscricket | function | 0 |
| 20012 | `countactors` | — | function | 8 |
| 20013 | `indextoactor` | — | function | 8 |
| 20014 | `countsounds` | — | function | 1 |
| 20015 | `indextosound` | — | function | 1 |
| 20016 | `sounddone` | — | function | 1 |
| 20017 | `setwidth` | pointinpainting | function | 0 |
| 20018 | `setheight` | countpaintings | function | 0 |
| 20019 | `countscenes` | — | function | 0 |
| 20020 | `indextoscene` | — | function | 0 |
| 20021 | `rowcoltoscene` | sendtopostfx | function | 5 |
| 20022 | `scenefloor` | indextopainting | function | 0 |
| 20023 | `scenerow` | actorexists | function | 7 |
| 20024 | `scenecol` | propexists | function | 7 |
| 20025 | `stringtonum` | — | function | 42 |
| 20026 | `numtostring` | — | function | 232 |
| 20027 | `freemem` | — | function | 0 |
| 20028 | `puppetevent` | — | function | 410 |
| 20029 | `countcasts` | — | function | 0 |
| 20030 | `indextocast` | — | function | 0 |
| 20031 | `countprops` | — | function | 4 |
| 20032 | `indextoprop` | — | function | 4 |
| 20033 | `countshops` | — | function | 0 |
| 20034 | `indextoshop` | — | function | 0 |
| 20035 | `countflats` | — | function | 4 |
| 20036 | `indextoflat` | — | function | 0 |
| 20037 | `flattoindex` | — | function | 5 |
| 20038 | `currentflat` | — | function | 68 |
| 20039 | `pointinactor` | — | function | 1 |
| 20040 | `pointinprop` | — | function | 7 |
| 20041 | `pointinset` | — | function | 3 |
| 20042 | `pointinstage` | — | function | 1 |
| 20043 | `pointinbutton` | — | function | 10 |
| 20044 | `countbuttons` | — | function | 0 |
| 20045 | `indextobutton` | — | function | 0 |
| 20046 | `countpuppets` | — | function | 33 |
| 20047 | `indextopuppet` | — | function | 33 |
| 20048 | `currentstage` | — | function | 7 |
| 20049 | `currentpuppet` | — | function | 5 |
| 20050 | `type` | — | function | 0 |
| 20051 | `countglobals` | — | function | 0 |
| 20052 | `indextoglobal` | — | function | 0 |
| 20053 | `currentset` | — | function | 27 |
| 20054 | `findword` | — | function | 49 |
| 20055 | `substring` | — | function | 5 |
| 20056 | `stringlength` | — | function | 0 |
| 20057 | `putword` | — | function | 7 |
| 20058 | `optionkey` | — | function | 10 |
| 20059 | `shiftkey` | — | function | 2 |
| 20060 | `commandkey` | — | function | 1 |
| 20061 | `calcvectx` | — | function | 9 |
| 20062 | `calcvecty` | — | function | 9 |
| 20063 | `cameraxyz` | — | function | 47 |
| 20064 | `playerxyz` | — | function | 46 |
| 20065 | `machinetype` | — | function | 0 |
| 20066 | `machinespeed` | — | function | 0 |
| 20067 | `findfile` | fileexists | function | 13 |
| 20068 | `questiondialog` | — | function | 2 |
| 20069 | `textdialog` | — | function | 0 |
| 20070 | `hittest` | — | function | 3 |
| 20071 | `calcdeg` | — | function | 49 |
| 20072 | `calcturn` | — | function | 0 |
| 20073 | `starxyz` | — | function | 3 |
| 20074 | `frame` | — | function | 59 |
| 20075 | `counttracks` | — | function | 0 |
| 20076 | `indextotrack` | — | function | 0 |
| 20077 | `currentsound` | — | function | 6 |
| 20078 | `currentvoice` | — | function | 35 |
| 20079 | `currenttheme` | — | function | 19 |
| 20080 | `soundrate` | — | function | 0 |
| 20081 | `calcdist` | — | function | 40 |
| 20082 | `cacheinfo` | calcmod | function | 0 |
| 20083 | `actionframe` | — | function | 14 |
| 20084 | `sendtoactorfx` | — | function | 0 |
| 20085 | `sendtoscenefx` | — | function | 0 |
| 20086 | `sendtopuppetfx` | — | function | 2 |
| 20087 | `sendtocastfx` | — | function | 2 |
| 20088 | `sendtopropfx` | — | function | 0 |
| 20089 | `sendtoshopfx` | — | function | 6 |
| 20090 | `sendtofloorfx` | sendtopaintingfx | function | 0 |
| 20091 | `sendtosetfx` | — | function | 0 |
| 20092 | `sendtobuttonfx` | — | function | 1 |
| 20093 | `sendtoflatfx` | — | function | 3 |
| 20094 | `sendtostagefx` | — | function | 14 |
| 20095 | `sendtobootfx` | — | function | 0 |
| 20096 | `scenexyz` | — | function | 36 |
| 20097 | `voicedone` | — | function | 0 |
| 20098 | `pluginfx` | — | function | 2 |
| 20099 | `walkdest` | — | function | 1 |
| 20100 | `scenebuild` | sendtoserverfx | function | 3 |
| 20101 | `indextoball` | indextocricket | function | 0 |
| 20102 | `indextoloop` | — | function | 0 |
| 20103 | `indextowalk` | — | function | 0 |
| 20104 | `countballs` | countcrickets | function | 0 |
| 20105 | `countloops` | — | function | 0 |
| 20106 | `countwalks` | — | function | 0 |
| 20107 | `countbevels` | — | function | 1 |
| 20108 | `sqrt` | — | function | 1 |
| 24001 | `barndoorclose` | — | transition | 0 |
| 24002 | `barndooropen` | — | transition | 0 |
| 24003 | `irisclose` | — | transition | 0 |
| 24004 | `irisopen` | — | transition | 0 |
| 24005 | `scrolldown` | — | transition | 0 |
| 24006 | `scrollup` | — | transition | 0 |
| 24007 | `scrollright` | — | transition | 0 |
| 24008 | `scrolleft` | — | transition | 0 |
| 24009 | `venetian` | — | transition | 0 |
| 24010 | `wipedown` | — | transition | 0 |
| 24011 | `wipeup` | — | transition | 0 |
| 24012 | `wiperight` | — | transition | 0 |
| 24013 | `wipeleft` | — | transition | 0 |
| 24014 | `plain` | — | transition | 0 |

## 7. User procedures in the dump

Every `code name (` we parsed. Duplicates are the same hook on many files (e.g. `runyoself` on each PUP, `setupactor` on each CST).

| Name | # | Params | First definitions |
|---|---|---|---|
| `aboutoona` | 1 |  | `PUP/_JONES/day1.txt:148` |
| `acid` | 1 |  | `PUP/_BLOOD/day1.txt:359` |
| `actdep` | 1 | amount | `PUP/_TELLER/day1.txt:209` |
| `addhandbevel` | 1 |  | `PRP/_INVEN/setcursor _arg__1.txt:286` |
| `addinven` | 1 | newitem | `PRP/_INVEN/setcursor _arg__1.txt:195` |
| `adjscene` | 1 |  | `CST/_EXTRA/pig/Script.txt:127` |
| `adjusthi` | 1 |  | `PRP/_HOUSE/setcursor _arg__270.txt:109` |
| `adoremarie` | 1 |  | `PUP/_FEAR/day2.txt:144` |
| `advanceday` | 1 |  | `FLT/_NEW/setcursor _arg_.txt:86` |
| `afterbounty` | 1 |  | `PUP/_MEZ/Boot Script.txt:133` |
| `afterbreak` | 2 |  | `PUP/_BUICK/day3.txt:82`, `PUP/_JONES/day2.txt:86` |
| `aftertarget` | 1 |  | `PUP/_LEROY/day1.txt:73` |
| `alternate` | 1 |  | `PUP/_TROTTER/day1.txt:53` |
| `ambivalent` | 1 |  | `PUP/_LAUREL/day1.txt:153` |
| `angle` | 1 |  | `PUP/_MEZ/Boot Script.txt:268` |
| `anteup` | 1 |  | `PUP/_MEZ/makebets.txt:3` |
| `apologize` | 1 |  | `PUP/_LAUREL/day2.txt:103` |
| `appear` | 1 |  | `PRP/_HOUSE/initprop_174.txt:119` |
| `approxdeg` | 3 |  | `CST/_EXTRA/bounty1/Script.txt:621`, `CST/_EXTRA/kidgang1/Script.txt:744`, `CST/_MINE/skeleton/Script.txt:196` |
| `attackmode` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:391`, `CST/_EXTRA/kidgang1/Script.txt:514` |
| `automove` | 1 |  | `PRP/_CHECKERS/automove_1.txt:3` |
| `backidle` | 1 |  | `CST/_GANG/Mayor/Script.txt:126` |
| `backtobol2` | 1 |  | `CST/_GANG/Bolivar/Script.txt:281` |
| `backtobol3` | 1 |  | `CST/_GANG/Bolivar/Script.txt:275` |
| `backup` | 2 |  | `CST/_EXTRA/chicken1/Script.txt:108`, `CST/_TARGET/chicken1targ/Script.txt:27` |
| `badnews` | 1 |  | `PUP/_BOLIVAR/DAY1.txt:322` |
| `balmtwopm` | 2 |  | `PUP/_HELP1/day2.txt:147`, `PUP/_HELP2/day2.txt:143` |
| `bankhint` | 1 |  | `PUP/_BUICK/day3.txt:159` |
| `baralone` | 1 |  | `PRP/_HOUSE/setcursor _arg__244.txt:80` |
| `beforetarget` | 1 |  | `PUP/_LEROY/day1.txt:31` |
| `beg` | 1 |  | `PUP/_BUICK/day2.txt:91` |
| `behindhorse` | 1 |  | `PRP/_HOUSE/setcursor _arg__202.txt:36` |
| `belcherbeat` | 2 |  | `PUP/_HELP1/day2.txt:206`, `PUP/_HELP2/day2.txt:202` |
| `bigstep` | 1 |  | `PUP/_JONES/day3.txt:102` |
| `bio` | 2 |  | `PUP/_FLIPPO/day3.txt:70`, `PUP/_NED/day2.txt:92` |
| `birdidle` | 1 |  | `CST/_EXTRA/birdcage/Script.txt:76` |
| `block` | 1 |  | `PUP/_OONA/day1.txt:259` |
| `bloodcode` | 1 |  | `PRP/_INVEN/initprop_428.txt:48` |
| `bloodhotel` | 1 |  | `PUP/_BLOOD/day1.txt:60` |
| `bloodidle` | 1 |  | `CST/_GANG/Blood/Script.txt:121` |
| `bolidle1` | 1 |  | `CST/_GANG/Bolivar/Script.txt:236` |
| `booktwopm` | 2 |  | `PUP/_HELP1/day2.txt:177`, `PUP/_HELP2/day2.txt:173` |
| `boot` | 1 |  | `BOOT/_BOOTFILE/Script 1.txt:3` |
| `bootblackjack` | 1 |  | `PUP/_JAN/Boot Script.txt:6` |
| `bootpoker` | 1 |  | `PUP/_MEZ/Boot Script.txt:19` |
| `borrow` | 1 |  | `PUP/_BUICK/day2.txt:139` |
| `bountyloop` | 1 |  | `CST/_EXTRA/bounty1/Script.txt:24` |
| `bowiebyes` | 1 |  | `PUP/_LAUREL/day1.txt:105` |
| `breakfast` | 3 |  | `PUP/_BUICK/day3.txt:48`, `PUP/_LAUREL/day2.txt:33`, `SET/_HOTLOWER/Scene B3.txt:61` |
| `breakready` | 1 | arg | `SET/_HOTLOWER/Scene B3.txt:72` |
| `broke` | 1 |  | `PUP/_GUS/day1.txt:266` |
| `broken` | 1 |  | `PUP/_BOLIVAR/DAY1.txt:401` |
| `brushoff` | 30 |  | `PUP/_BLOOD/day1.txt:439`, `PUP/_BUICK/day1.txt:286`, `PUP/_COBB/day2.txt:132` |
| `buick6` | 1 |  | `PUP/_BUICK/day1.txt:222` |
| `buick7` | 1 |  | `PUP/_BUICK/day1.txt:254` |
| `buickidle` | 1 |  | `CST/_GANG/Buick/Script.txt:154` |
| `business` | 1 |  | `PUP/_BLOOD/day1.txt:187` |
| `buy` | 1 |  | `PUP/_BOLIVAR/DAY1.txt:146` |
| `buydrink` | 1 |  | `PUP/_GUS/day1.txt:101` |
| `bye` | 1 |  | `PUP/_LAUREL/day2.txt:155` |
| `byenow` | 1 |  | `PUP/_ISAO/day1.txt:103` |
| `byetwo` | 2 | sale | `PUP/_HELP1/day2.txt:93`, `PUP/_HELP2/day2.txt:89` |
| `bysign` | 1 |  | `PUP/_LEROY/day1.txt:174` |
| `bywell` | 1 |  | `PUP/_QUIST/day1.txt:78` |
| `calcabs` | 4 | arg | `CST/_EXTRA/bounty1/Script.txt:536`, `CST/_EXTRA/kidgang1/Script.txt:659`, `CST/_EXTRA/pig/Script.txt:171` |
| `calcmaskdir` | 1 |  | `SET/_MINE/Boot Script.txt:100` |
| `calcspin` | 1 | start, deg | `PRP/_SNAKE/setcursor _arg__1.txt:118` |
| `calm` | 1 |  | `PUP/_LAUREL/day3.txt:123` |
| `canadvance` | 1 |  | `FLT/_NEW/setcursor _arg_.txt:247` |
| `cansleep` | 1 |  | `SET/_HOTROOM/Scene A1.txt:54` |
| `changeall` | 1 | row, col | `SET/_MINE/Boot Script.txt:73` |
| `changelike` | 1 | del | `PUP/_MWIFE/day1.txt:223` |
| `charm` | 1 |  | `PUP/_MWIFE/day2.txt:429` |
| `chat` | 6 |  | `PUP/_FEAR/day2.txt:82`, `PUP/_FEAR/day3.txt:97`, `PUP/_FLIPPO/Boot Script.txt:50` |
| `cheat` | 1 |  | `PUP/_JAN/makebets.txt:288` |
| `cheated` | 1 |  | `PUP/_PETE/playscript.txt:365` |
| `checkers` | 1 |  | `PUP/_BOLIVAR/DAY1.txt:288` |
| `checkey` | 1 | arg | `FLT/_NEW/openflat.txt:103` |
| `chickenloop` | 1 |  | `CST/_GANG/Jones/Script.txt:312` |
| `chinese` | 1 |  | `PUP/_FLIPPO/day2.txt:149` |
| `chirper` | 1 |  | `CST/_EXTRA/bird1/Script.txt:139` |
| `clickinchamber` | 1 | arg | `PRP/_HOUSE/setcursor _arg__270.txt:46` |
| `clock1` | 1 |  | `PUP/_WATSON/day1.txt:45` |
| `clock1boots` | 2 |  | `PUP/_HELP1/day2.txt:305`, `PUP/_HELP2/day2.txt:301` |
| `clock1bullets` | 2 |  | `PUP/_HELP1/day2.txt:369`, `PUP/_HELP2/day2.txt:365` |
| `clock1gun` | 2 |  | `PUP/_HELP1/day2.txt:337`, `PUP/_HELP2/day2.txt:333` |
| `clock1pages` | 2 |  | `PUP/_HELP1/day3.txt:276`, `PUP/_HELP2/day3.txt:276` |
| `clock1ring` | 2 |  | `PUP/_HELP1/day3.txt:223`, `PUP/_HELP2/day3.txt:223` |
| `clock2book` | 2 |  | `PUP/_HELP1/day3.txt:346`, `PUP/_HELP2/day3.txt:346` |
| `clock2boots` | 2 |  | `PUP/_HELP1/day2.txt:401`, `PUP/_HELP2/day2.txt:397` |
| `clock2bullets` | 2 |  | `PUP/_HELP1/day2.txt:466`, `PUP/_HELP2/day2.txt:462` |
| `clock2flute` | 2 |  | `PUP/_HELP1/day3.txt:377`, `PUP/_HELP2/day3.txt:377` |
| `clock2gun` | 2 |  | `PUP/_HELP1/day2.txt:433`, `PUP/_HELP2/day2.txt:429` |
| `clock2mask` | 2 |  | `PUP/_HELP1/day3.txt:310`, `PUP/_HELP2/day3.txt:310` |
| `clock3bird` | 2 |  | `PUP/_HELP1/day3.txt:409`, `PUP/_HELP2/day3.txt:409` |
| `clock3stone` | 2 |  | `PUP/_HELP1/day3.txt:442`, `PUP/_HELP2/day3.txt:442` |
| `close` | 1 |  | `PRP/_TARGET/endball _arg__33.txt:27` |
| `closecheckers` | 1 |  | `FLT/_CHECKERS/playcheckers.txt:10` |
| `closecredits` | 1 |  | `FLT/_CREDITS/openstage.txt:54` |
| `closefight` | 2 |  | `SET/_NITE/Boot Script.txt:148`, `SET/_TOWN/Boot Script.txt:158` |
| `closeflat` | 10 |  | `FLT/_FIGHT/openflat.txt:8`, `FLT/_FLUTE/openflat.txt:14`, `FLT/_FLUTE/setcursor _arg_.txt:25` |
| `closeidle` | 1 |  | `PRP/_TARGET/endball _arg__33.txt:34` |
| `closenough` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:260`, `CST/_EXTRA/kidgang1/Script.txt:289` |
| `closescene` | 64 |  | `SET/_APOTH/Scene C2.txt:47`, `SET/_BANK/Scene D2.txt:45`, `SET/_CHIN/Scene A2.txt:47` |
| `closeset` | 25 |  | `SET/_APOTH/Boot Script.txt:35`, `SET/_CHIN/Boot Script.txt:31`, `SET/_COURT/Boot Script.txt:39` |
| `closestage` | 2 |  | `FLT/_CREDITS/openstage.txt:19`, `FLT/_SUNDIAL/offerobject _what_.txt:100` |
| `cluckme` | 2 |  | `CST/_EXTRA/chicken1/Script.txt:121`, `SET/_TARGET/chicken.txt:57` |
| `cobb` | 1 |  | `PUP/_SOPHIE/day2.txt:108` |
| `cobbidle` | 1 |  | `CST/_GANG/Cobb/Script.txt:95` |
| `combhair` | 1 |  | `CST/_GANG/Oona/Script.txt:110` |
| `comefromblack` | 1 |  | `SET/_HUB/Boot Script.txt:56` |
| `converse` | 1 |  | `PUP/_BLOOD/day1.txt:283` |
| `cowloop` | 1 |  | `CST/_EXTRA/cow/Script.txt:66` |
| `crime` | 1 |  | `PUP/_MEZ/Boot Script.txt:398` |
| `curious` | 1 |  | `PUP/_MARIE/day2.txt:97` |
| `damage` | 1 | person, force | `PRP/_FIGHT/setcursor _arg__54.txt:165` |
| `day2am` | 1 |  | `PUP/_TROTTER/day2.txt:23` |
| `day2items` | 1 |  | `FLT/_NEW/setcursor _arg_.txt:292` |
| `day2morn` | 1 |  | `PUP/_BUICK/day2.txt:69` |
| `day2pm` | 2 |  | `PUP/_BUICK/day2.txt:28`, `PUP/_TROTTER/day2.txt:79` |
| `day3bedtime` | 1 |  | `FLT/_NEW/setcursor _arg_.txt:307` |
| `dayfxs` | 2 |  | `SET/_NITE/Scene G14.txt:59`, `SET/_TOWN/Scene G14.txt:59` |
| `dbljump` | 1 |  | `PUP/_BOLIVAR/checkers vo.txt:149` |
| `dead` | 1 |  | `PRP/_HOUSE/setcursor _arg__270.txt:155` |
| `deadexits` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:683`, `CST/_EXTRA/kidgang1/Script.txt:806` |
| `deadidle` | 1 |  | `CST/_GANG/Dead/Script.txt:79` |
| `dealerbj` | 1 |  | `PUP/_JAN/makebets.txt:256` |
| `death` | 1 |  | `FLT/_NEW/death.txt:3` |
| `deathmovie` | 1 |  | `FLT/_NEW/death.txt:151` |
| `decide` | 1 |  | `PUP/_OONA/day5.txt:31` |
| `decodemove` | 1 | themove | `PRP/_CHECKERS/automove_1.txt:213` |
| `delayloop` | 1 |  | `CST/_GANG/Trotter/Script.txt:90` |
| `deliverdrink` | 1 |  | `PUP/_GUS/day1.txt:175` |
| `dellcomment` | 1 |  | `PUP/_COBB/day2.txt:63` |
| `dellidle` | 1 |  | `CST/_GANG/Dell/Script.txt:170` |
| `delloses` | 1 |  | `PRP/_FIGHT/setcursor _arg__54.txt:223` |
| `depbig` | 1 |  | `PUP/_TELLER/day1.txt:236` |
| `deplil` | 1 |  | `PUP/_TELLER/day1.txt:220` |
| `diamondback` | 1 |  | `PUP/_FLIPPO/day2.txt:89` |
| `die` | 1 |  | `CST/_TARGET/dummytarg/Script.txt:74` |
| `dinner` | 1 |  | `PUP/_MWIFE/day1.txt:120` |
| `disdain` | 1 |  | `PUP/_OONA/day2.txt:251` |
| `dismiss` | 1 |  | `PUP/_RUBY/day1.txt:159` |
| `doamovie` | 1 | thename | `SET/_TOWN/Scene G14.txt:321` |
| `doapuppet` | 1 | pupname | `SET/_TOWN/Scene G14.txt:296` |
| `dobox` | 1 |  | `SET/_PADRE/Scene A3.txt:29` |
| `dobuick` | 1 |  | `SET/_HOTUPPER/Scene C1.txt:59` |
| `docidle` | 1 |  | `CST/_GANG/Doc/Script.txt:86` |
| `docrack` | 1 |  | `SET/_BANK/Scene D1.txt:41` |
| `dodeposit` | 1 |  | `PUP/_TELLER/day1.txt:175` |
| `dodrugs` | 1 |  | `PRP/_HOUSE/setcursor _arg__678.txt:47` |
| `doexit` | 3 | arg | `FLT/_SCORP/setcursor _arg_.txt:126`, `FLT/_SUNDIAL/offerobject _what_.txt:6`, `FLT/_YUNNIBOX/setcursor _arg_.txt:8` |
| `dofold` | 3 |  | `PUP/_MEZ/playscript.txt:328`, `PUP/_PETE/playscript.txt:338`, `PUP/_ZEB/playscript.txt:421` |
| `dohexpuz` | 1 |  | `SET/_SNAKE/Scene B3.txt:29` |
| `dojump` | 1 | row, col | `PRP/_CHECKERS/automove_1.txt:127` |
| `doleft` | 1 |  | `CST/_EXTRA/dog/Script.txt:61` |
| `domovies` | 1 |  | `FLT/_CRACK/setcursor _arg_.txt:140` |
| `donepourin` | 1 |  | `CST/_GANG/Gus/Script.txt:113` |
| `doright` | 1 |  | `CST/_EXTRA/dog/Script.txt:49` |
| `doscorp` | 2 |  | `SET/_NITESCHO/Scene A2.txt:66`, `SET/_SCHOOL/Scene A2.txt:66` |
| `dospecial` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:283`, `CST/_EXTRA/kidgang1/Script.txt:346` |
| `dosundial` | 4 |  | `SET/_HUB/Scene C4.txt:43`, `SET/_HUB/Scene D3.txt:43`, `SET/_HUB/Scene D5.txt:43` |
| `dotbird` | 1 |  | `SET/_TBIRD/Scene B2.txt:38` |
| `down` | 1 |  | `PRP/_FIGHT/knife_2.txt:31` |
| `dragit` | 2 |  | `PRP/_SALGAMES/setcursor _arg__1.txt:188`, `PRP/_TARGET/openshop_1.txt:11` |
| `draw` | 1 |  | `CST/_TARGET/dummytarg/Script.txt:56` |
| `drawbetbevel` | 1 |  | `PUP/_JAN/makebets.txt:201` |
| `drink` | 1 |  | `PUP/_OONA/day2.txt:207` |
| `drinks` | 1 |  | `PUP/_TROTTER/day2.txt:208` |
| `drugbook` | 1 |  | `FLT/_DRUG/setcursor _arg_.txt:61` |
| `drugmortar` | 1 |  | `FLT/_DRUG/setcursor _arg_.txt:29` |
| `drugmovie` | 1 | name, posit | `FLT/_DRUG/setcursor _arg_.txt:8` |
| `drugok` | 1 |  | `FLT/_DRUG/setcursor _arg_.txt:34` |
| `drugretry` | 1 |  | `FLT/_DRUG/setcursor _arg_.txt:74` |
| `dumpcheckersglobals` | 1 |  | `FLT/_CHECKERS/playcheckers.txt:29` |
| `dumpfightglobals` | 1 |  | `FLT/_FIGHT/openflat.txt:50` |
| `dumpinven` | 1 | newitem | `PRP/_INVEN/setcursor _arg__1.txt:238` |
| `dumptargetglobals` | 1 |  | `FLT/_TARGET/mousedown _arg_.txt:50` |
| `dumpyunniglobals` | 1 |  | `FLT/_SUNDIAL/offerobject _what_.txt:68` |
| `eaststar` | 1 |  | `PRP/_HOUSE/initprop_2.txt:100` |
| `endball` | 4 | arg | `PRP/_HOUSE/initprop_174.txt:30`, `PRP/_TARGET/endball _arg__2.txt:3`, `PRP/_TARGET/endball _arg__29.txt:3` |
| `endturn` | 9 |  | `CST/_EXTRA/bird1/Script.txt:160`, `CST/_EXTRA/bounty1/Script.txt:449`, `CST/_EXTRA/kidgang1/Script.txt:572` |
| `endwalk` | 29 |  | `CST/_EXTRA/bird1/Script.txt:50`, `CST/_EXTRA/bounty1/Script.txt:456`, `CST/_EXTRA/chicken1/Script.txt:93` |
| `exitsundial` | 1 |  | `FLT/_SUNDIAL/offerobject _what_.txt:28` |
| `fadetoblack` | 1 |  | `PRP/_FIGHT/setcursor _arg__1.txt:26` |
| `favor` | 1 |  | `PUP/_MEZ/Boot Script.txt:382` |
| `fearidle` | 1 |  | `CST/_GANG/Fear/Script.txt:104` |
| `fight` | 3 |  | `FLT/_FIGHT/openflat.txt:14`, `SET/_NITE/Scene D7.txt:26`, `SET/_TOWN/Scene D7.txt:26` |
| `findscene` | 1 | num | `CST/_EXTRA/pig/Script.txt:188` |
| `fire` | 2 |  | `CST/_EXTRA/kidgang1/Script.txt:432`, `CST/_TARGET/dummytarg/Script.txt:62` |
| `firstbet` | 3 |  | `PUP/_MEZ/playscript.txt:156`, `PUP/_PETE/playscript.txt:179`, `PUP/_ZEB/playscript.txt:255` |
| `firstencounter` | 1 |  | `PUP/_BUICK/day1.txt:22` |
| `firststreet` | 1 |  | `PUP/_MWIFE/day1.txt:86` |
| `fix24deg` | 1 | arg | `PRP/_TUMBLE/setcursor _arg__1.txt:46` |
| `fixdeg16` | 1 | dest | `PRP/_SUNDIAL/setcursor _arg__1.txt:88` |
| `fixdeg256` | 3 | dest | `PRP/_CRACK/mousedown _arg__2.txt:59`, `PRP/_SNAKE/setcursor _arg__1.txt:140`, `PRP/_SUNDIAL/setcursor _arg__1.txt:76` |
| `fixdeg36` | 1 | dest | `PRP/_SNAKE/setcursor _arg__1.txt:152` |
| `fixdeg50` | 1 | dest | `PRP/_CRACK/mousedown _arg__2.txt:71` |
| `flirt` | 1 |  | `PUP/_SOPHIE/day1.txt:92` |
| `flyit` | 1 | x, y | `CST/_EXTRA/bird1/Script.txt:187` |
| `flyto` | 1 | x, y, z | `CST/_EXTRA/bird1/Script.txt:247` |
| `fountain` | 2 |  | `SET/_COURT/Boot Script.txt:83`, `SET/_NITECOUR/Boot Script.txt:83` |
| `freewoman` | 1 |  | `PUP/_LAUREL/day1.txt:127` |
| `fromfrance` | 1 |  | `PUP/_BUICK/day1.txt:78` |
| `fromhell` | 2 |  | `PUP/_HELP1/day1.txt:183`, `PUP/_HELP2/day1.txt:185` |
| `fromruby` | 1 |  | `PUP/_TROTTER/day3.txt:95` |
| `fromthink` | 1 |  | `CST/_GANG/Mayor/Script.txt:120` |
| `gameloop` | 1 |  | `PUP/_OONA/day1.txt:103` |
| `getlost` | 2 |  | `PUP/_OONA/day1.txt:276`, `PUP/_RUBY/day3.txt:159` |
| `getpunch` | 1 | arg | `PRP/_FIGHT/setcursor _arg__54.txt:235` |
| `ghostloop` | 2 |  | `SET/_COURT/Scene C5.txt:76`, `SET/_NITECOUR/Scene C5.txt:76` |
| `gift` | 34 | what | `PUP/_BLOOD/Boot Script.txt:15`, `PUP/_BOLIVAR/Boot Script.txt:9`, `PUP/_BUICK/Boot Script.txt:13` |
| `giveinven` | 1 | newitem, who | `PRP/_INVEN/setcursor _arg__1.txt:243` |
| `givesring` | 2 |  | `PUP/_HELP1/day1.txt:152`, `PUP/_HELP2/day1.txt:153` |
| `giveup` | 1 |  | `FLT/_CRACK/setcursor _arg_.txt:8` |
| `gohelp` | 1 |  | `PUP/_RUBY/day3.txt:107` |
| `goodbye` | 2 |  | `PUP/_GUS/day1.txt:215`, `PUP/_JONES/day2.txt:160` |
| `goodjump` | 1 | srow, scol, erow, ecol, person | `PRP/_CHECKERS/automove_1.txt:326` |
| `goodloc` | 1 | srow, scol, erow, ecol | `PRP/_CHECKERS/setcursor _arg__2.txt:99` |
| `goodmove` | 1 | srow, scol, erow, ecol, person | `PRP/_CHECKERS/automove_1.txt:282` |
| `gopour` | 1 |  | `CST/_GANG/Gus/Script.txt:118` |
| `gossip` | 7 |  | `PUP/_BLOOD/day2.txt:276`, `PUP/_BLOOD/day3.txt:72`, `PUP/_MARIE/day2.txt:342` |
| `gossipone` | 1 | name | `SET/_HUB/Boot Script.txt:105` |
| `gotoblack` | 1 |  | `SET/_HUB/Boot Script.txt:36` |
| `gotochat` | 3 |  | `SET/_NITE/chicken.txt:47`, `SET/_TARGET/chicken.txt:38`, `SET/_TOWN/chicken.txt:44` |
| `gotochick` | 3 |  | `SET/_NITE/chicken.txt:36`, `SET/_TARGET/chicken.txt:19`, `SET/_TOWN/chicken.txt:33` |
| `gotohub` | 5 |  | `FLT/_SUNDIAL/offerobject _what_.txt:77`, `SET/_FLUTE/Boot Script.txt:38`, `SET/_MINE/Boot Script.txt:139` |
| `gotointerior` | 1 | setname | `FLT/_NEW/setcursor _arg_.txt:8` |
| `gotospecial` | 2 | setname, scenename, dirname | `FLT/_NEW/setcursor _arg_.txt:27`, `FLT/_TARGET/gototown _dirname_.txt:9` |
| `gotospecialdark` | 1 | setname, scenename, dirname | `FLT/_NEW/setcursor _arg_.txt:43` |
| `gototown` | 2 | dirname | `FLT/_NEW/setcursor _arg_.txt:17`, `FLT/_TARGET/gototown _dirname_.txt:3` |
| `grangers` | 1 |  | `PUP/_FLIPPO/day3.txt:102` |
| `greet` | 1 |  | `PUP/_TROTTER/day1.txt:106` |
| `greeting` | 1 |  | `PUP/_BLOOD/day1.txt:525` |
| `handleit` | 10 |  | `FLT/_DRUG/handleit.txt:3`, `FLT/_FIGHT/openflat.txt:84`, `FLT/_FLUTE/openflat.txt:40` |
| `handleselect` | 1 |  | `PRP/_INVEN/setcursor _arg__1.txt:391` |
| `happy` | 1 |  | `PUP/_ISAO/day1.txt:154` |
| `hardtoget` | 1 |  | `PUP/_LAUREL/day1.txt:61` |
| `hasit` | 2 |  | `PUP/_HELP1/day3.txt:255`, `PUP/_HELP2/day3.txt:255` |
| `hasjump` | 1 |  | `PUP/_BOLIVAR/checkers vo.txt:162` |
| `hasring` | 1 |  | `PUP/_JONES/day3.txt:35` |
| `haveadrink` | 1 |  | `PUP/_GUS/day1.txt:192` |
| `head` | 1 |  | `CST/_EXTRA/horse1/Script.txt:106` |
| `hello` | 1 |  | `PUP/_GUS/day1.txt:242` |
| `helpidle` | 1 |  | `CST/_GANG/Help/Script.txt:107` |
| `helpme` | 4 |  | `PUP/_HELP1/day2.txt:260`, `PUP/_HELP1/day3.txt:183`, `PUP/_HELP2/day2.txt:256` |
| `helpyou` | 1 |  | `PUP/_MARIE/day2.txt:125` |
| `hesdrunk` | 1 |  | `PUP/_TROTTER/day2.txt:112` |
| `hide` | 1 |  | `PRP/_FIGHT/knife_2.txt:37` |
| `hidestep` | 1 | arg | `PRP/_FLUTE/setcursor_1.txt:33` |
| `history` | 1 |  | `PUP/_BLOOD/day2.txt:250` |
| `hit` | 33 |  | `CST/_EXTRA/birdcage/Script.txt:113`, `CST/_EXTRA/bounty1/Script.txt:149`, `CST/_EXTRA/dog/Script.txt:122` |
| `hitdesk` | 1 |  | `FLT/_SCORP/setcursor _arg_.txt:101` |
| `hitmatch` | 1 |  | `FLT/_SCORP/setcursor _arg_.txt:68` |
| `hitpage` | 1 |  | `FLT/_SCORP/setcursor _arg_.txt:81` |
| `hitsound` | 1 |  | `PRP/_FIGHT/setcursor _arg__54.txt:87` |
| `hitstat` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:219`, `CST/_EXTRA/kidgang1/Script.txt:239` |
| `hitup` | 1 |  | `PUP/_BUICK/day2.txt:190` |
| `hitwalker` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:197`, `CST/_EXTRA/kidgang1/Script.txt:217` |
| `horse` | 1 |  | `PUP/_NED/day2.txt:263` |
| `horsey` | 1 |  | `CST/_EXTRA/horse1/Script.txt:96` |
| `hostile` | 1 |  | `PUP/_OONA/day1.txt:61` |
| `hotdist` | 3 | arg | `CST/_EXTRA/bounty1/Script.txt:668`, `CST/_EXTRA/kidgang1/Script.txt:791`, `PRP/_INVEN/setcursor _arg__1.txt:166` |
| `hub` | 1 |  | `PUP/_BLOOD/day4.txt:27` |
| `idle` | 12 |  | `BOOT/_BOOTFILE/Script 1.txt:144`, `CST/_TARGET/target1/Script.txt:32`, `CST/_TARGET/target2/Script.txt:32` |
| `idle1` | 1 |  | `PRP/_FIGHT/setcursor _arg__54.txt:209` |
| `idle2` | 1 |  | `PRP/_FIGHT/setcursor _arg__54.txt:214` |
| `idlefx` | 13 |  | `PUP/_DELL1/day1.txt:106`, `PUP/_DELL2/day1.txt:89`, `PUP/_DOC/day2.txt:154` |
| `indextopiece` | 1 | num | `FLT/_SALGAMES/initgame.txt:301` |
| `infoyoself` | 35 |  | `PRP/_INVEN/initprop_132.txt:62`, `PRP/_INVEN/initprop_149.txt:44`, `PRP/_INVEN/initprop_157.txt:42` |
| `initactor` | 39 |  | `CST/_EXTRA/bird1/Script.txt:10`, `CST/_EXTRA/birdcage/Script.txt:10`, `CST/_EXTRA/bounty1/Script.txt:418` |
| `initall` | 1 | newname, newset | `FLT/_NEW/setcursor _arg_.txt:206` |
| `initbird` | 1 |  | `CST/_TARGET/birdtarg/Script.txt:78` |
| `initgame` | 2 |  | `FLT/_CHECKERS/setcursor _arg_.txt:13`, `FLT/_SALGAMES/initgame.txt:3` |
| `initglobals` | 1 |  | `FLT/_CHECKERS/setcursor _arg_.txt:41` |
| `inithandle` | 1 |  | `FLT/_SALGAMES/initgame.txt:158` |
| `initprop` | 67 |  | `PRP/_HOUSE/initprop_16.txt:3`, `PRP/_HOUSE/initprop_174.txt:3`, `PRP/_HOUSE/initprop_196.txt:3` |
| `initprops` | 7 |  | `PRP/_FLUTE/setcursor_1.txt:8`, `PRP/_HOUSE/setcursor _arg__1.txt:8`, `PRP/_HUB/setcursor _arg__1.txt:20` |
| `initslotprops` | 1 |  | `FLT/_SALGAMES/initgame.txt:17` |
| `initxyz` | 4 |  | `CST/_EXTRA/bounty1/Script.txt:101`, `CST/_EXTRA/kidgang1/Script.txt:97`, `CST/_EXTRA/pig/Script.txt:84` |
| `inruby` | 1 |  | `PUP/_TROTTER/day2.txt:143` |
| `intruder` | 2 |  | `PUP/_MAYOR/day2.txt:210`, `PUP/_MWIFE/day2.txt:466` |
| `invenmovie` | 1 | thename | `PRP/_INVEN/setcursor _arg__1.txt:155` |
| `isadj` | 1 | cr, cc, nr, nc | `CST/_EXTRA/pig/Script.txt:160` |
| `isaofxs` | 1 |  | `SET/_SALLOWER/Scene D1.txt:107` |
| `isaoidle` | 1 |  | `CST/_GANG/Isao/Script.txt:91` |
| `isbuild` | 2 | x2, y2 | `CST/_EXTRA/bounty1/Script.txt:637`, `CST/_EXTRA/kidgang1/Script.txt:760` |
| `isking` | 1 | srow, scol | `PRP/_CHECKERS/automove_1.txt:190` |
| `ismine` | 1 | row, col | `PRP/_CHECKERS/automove_1.txt:200` |
| `isyunni` | 1 | what | `PRP/_INVEN/setcursor _arg__1.txt:427` |
| `jail` | 1 |  | `PUP/_MAYOR/day3.txt:27` |
| `jailbird` | 2 |  | `PUP/_DELL1/day2.txt:50`, `PUP/_DELL2/day2.txt:50` |
| `jiggle` | 1 | slotnum | `FLT/_SALGAMES/initgame.txt:203` |
| `jones8` | 1 |  | `PUP/_JONES/day1.txt:293` |
| `jonescomment` | 1 |  | `PUP/_FLIPPO/day2.txt:184` |
| `jonesidle` | 1 |  | `CST/_GANG/Jones/Script.txt:202` |
| `keydown` | 128 | arg | `BOOT/_BOOTFILE/Script 1.txt:66`, `FLT/_NEW/openflat.txt:52`, `SET/_APOTH/Boot Script.txt:8` |
| `keyrepeat` | 1 | arg | `BOOT/_BOOTFILE/Script 1.txt:90` |
| `kickme` | 1 |  | `PRP/_HOUSE/initprop_174.txt:130` |
| `kid` | 2 |  | `PUP/_HELP1/day3.txt:114`, `PUP/_HELP2/day3.txt:114` |
| `kidbad` | 1 |  | `PUP/_KID/day1.txt:179` |
| `kidgangloop` | 1 |  | `CST/_EXTRA/kidgang1/Script.txt:24` |
| `kidwin` | 1 |  | `PUP/_KID/day1.txt:160` |
| `killblood` | 1 |  | `PRP/_TUMBLE/setcursor _arg__1.txt:71` |
| `kneelfire` | 1 |  | `CST/_EXTRA/bounty1/Script.txt:350` |
| `knife` | 1 |  | `PRP/_FIGHT/knife_2.txt:3` |
| `lastsound` | 1 |  | `SET/_HOTROOM/Scene B1.txt:78` |
| `laurelidle` | 1 |  | `CST/_GANG/Laurel/Script.txt:72` |
| `leroyidle` | 1 |  | `CST/_GANG/Leroy/Script.txt:127` |
| `lightwait` | 1 |  | `PUP/_GUS/day1.txt:379` |
| `lilfly` | 1 | name, x, y | `CST/_EXTRA/bird1/Script.txt:228` |
| `lilmove` | 1 | name, x, y | `CST/_EXTRA/bird1/Script.txt:211` |
| `limiter` | 3 | orig, newd | `PRP/_CRACK/mousedown _arg__2.txt:34`, `PRP/_SNAKE/setcursor _arg__1.txt:93`, `PRP/_SUNDIAL/setcursor _arg__1.txt:57` |
| `listlength` | 1 | list | `PRP/_CHECKERS/automove_1.txt:273` |
| `livehere` | 1 |  | `PUP/_BUICK/day1.txt:149` |
| `lockapoth` | 2 |  | `SET/_NITE/Scene G9.txt:50`, `SET/_TOWN/Scene G9.txt:50` |
| `lockback` | 2 |  | `SET/_NITE/Scene D10.txt:44`, `SET/_TOWN/Scene D10.txt:44` |
| `lockbank` | 2 |  | `SET/_NITE/Scene G6.txt:46`, `SET/_TOWN/Scene G6.txt:43` |
| `lockchin` | 2 |  | `SET/_NITE/Scene G12.txt:84`, `SET/_TOWN/Scene G12.txt:86` |
| `lockcourt` | 2 |  | `SET/_NITE/Scene G4.txt:42`, `SET/_TOWN/Scene G4.txt:42` |
| `lockdine` | 1 |  | `SET/_MAYHALL/Scene C3.txt:124` |
| `lockdoctor` | 2 |  | `SET/_NITE/Scene G5.txt:51`, `SET/_TOWN/Scene G5.txt:51` |
| `lockdoor` | 9 |  | `SET/_APOTH/Scene C2.txt:38`, `SET/_DOCTOR1/Scene B1.txt:102`, `SET/_DOCTOR2/Scene A1.txt:82` |
| `lockexit` | 1 |  | `SET/_MAYROOM/Scene A2.txt:41` |
| `lockfront` | 1 |  | `SET/_MAYHALL/Scene C4.txt:65` |
| `lockhall` | 2 |  | `SET/_MAYDINE/Scene D2.txt:56`, `SET/_MAYSTUDY/Scene B2.txt:60` |
| `lockhorse` | 1 |  | `SET/_LIVERY/Scene D2.txt:42` |
| `lockhotel` | 3 |  | `SET/_HOTLOWER/Scene A1.txt:72`, `SET/_NITE/Scene G5.txt:75`, `SET/_TOWN/Scene G5.txt:78` |
| `lockjail` | 2 |  | `SET/_NITE/Scene G12.txt:105`, `SET/_TOWN/Scene G12.txt:110` |
| `locklaurel` | 1 |  | `SET/_HOTUPPER/Scene C2.txt:35` |
| `locklivery` | 2 |  | `SET/_NITE/Scene J6.txt:63`, `SET/_TOWN/Scene J6.txt:63` |
| `lockmayor` | 2 |  | `SET/_NITE/Scene J9.txt:69`, `SET/_TOWN/Scene J9.txt:65` |
| `lockpadre` | 2 |  | `SET/_NITESCHO/Scene A2.txt:51`, `SET/_SCHOOL/Scene A2.txt:51` |
| `lockpaper` | 2 |  | `SET/_NITE/Scene D8.txt:52`, `SET/_TOWN/Scene D8.txt:52` |
| `lockrice` | 18 |  | `SET/_BANK/Scene D2.txt:36`, `SET/_CHIN/Scene A2.txt:38`, `SET/_COURT/Scene C3.txt:50` |
| `lockroom` | 1 |  | `SET/_MAYUPPER/Scene B1.txt:40` |
| `lockruby` | 1 |  | `SET/_SALUPPER/Scene A1.txt:120` |
| `locksaloon` | 2 |  | `SET/_NITE/Scene G8.txt:55`, `SET/_TOWN/Scene G8.txt:50` |
| `lockstage` | 2 |  | `SET/_NITE/Scene G8.txt:73`, `SET/_TOWN/Scene G8.txt:71` |
| `lockstore` | 4 |  | `SET/_NITE/Scene B11.txt:52`, `SET/_NITE/Scene G10.txt:50`, `SET/_TOWN/Scene B11.txt:29` |
| `lockstudy` | 1 |  | `SET/_MAYHALL/Scene C3.txt:106` |
| `lockundertak` | 2 |  | `SET/_NITE/Scene A7.txt:50`, `SET/_TOWN/Scene A7.txt:50` |
| `lockvoice` | 2 |  | `SET/_NITE/Scene J6.txt:87`, `SET/_TOWN/Scene J6.txt:87` |
| `lookidle` | 1 |  | `CST/_GANG/Bolivar/Script.txt:241` |
| `lookleft` | 1 |  | `CST/_EXTRA/dog/Script.txt:67` |
| `lookright` | 1 |  | `CST/_EXTRA/dog/Script.txt:55` |
| `loopactor` | 2 | arg | `SET/_NITE/Scene G14.txt:266`, `SET/_TOWN/Scene G14.txt:337` |
| `loopprop` | 2 | arg | `SET/_NITE/Scene G14.txt:333`, `SET/_TOWN/Scene G14.txt:404` |
| `loopson` | 1 |  | `SET/_MINE/Boot Script.txt:68` |
| `lower` | 9 |  | `CST/_TARGET/dummytarg/Script.txt:68`, `CST/_TARGET/target1/Script.txt:37`, `CST/_TARGET/target2/Script.txt:37` |
| `lowfly` | 1 | name, x, y, z | `CST/_EXTRA/bird1/Script.txt:277` |
| `lowmove` | 1 | name, x, y, z | `CST/_EXTRA/bird1/Script.txt:257` |
| `lowprop` | 1 | arg | `PRP/_FLUTE/setcursor_1.txt:17` |
| `luck` | 1 |  | `PUP/_BUICK/day2.txt:278` |
| `mainbet` | 1 |  | `PUP/_MEZ/makebets.txt:63` |
| `mainbetbj` | 1 |  | `PUP/_JAN/makebets.txt:5` |
| `mainloop` | 5 |  | `PUP/_BOLIVAR/DAY1.txt:80`, `PUP/_GUS/day1.txt:12`, `PUP/_HELP1/day1.txt:53` |
| `mainrack` | 2 |  | `PUP/_PETE/Boot Script.txt:5`, `PUP/_ZEB/Boot Script.txt:5` |
| `makebet` | 3 | firstbet | `PUP/_MEZ/playscript.txt:6`, `PUP/_PETE/playscript.txt:5`, `PUP/_ZEB/playscript.txt:5` |
| `makebull` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:705`, `CST/_EXTRA/kidgang1/Script.txt:835` |
| `makeface` | 7 | what | `FLT/_FIGHT/openflat.txt:55`, `FLT/_FLUTE/openflat.txt:24`, `FLT/_FLUTE/setcursor _arg_.txt:35` |
| `makeflatter` | 2 |  | `PUP/_MWIFE/day2.txt:104`, `PUP/_MWIFE/day3.txt:152` |
| `makeinsult` | 2 |  | `PUP/_MWIFE/day2.txt:123`, `PUP/_MWIFE/day3.txt:171` |
| `makemove` | 4 | x, y | `CST/_EXTRA/bounty1/Script.txt:526`, `CST/_EXTRA/kidgang1/Script.txt:649`, `CST/_MINE/skeleton/Script.txt:47` |
| `makesherrif` | 1 |  | `PUP/_MAYOR/day2.txt:47` |
| `makeup` | 1 |  | `PUP/_JONES/day3.txt:201` |
| `mangle` | 1 |  | `PRP/_SNAKE/setcursor _arg__1.txt:163` |
| `marie2` | 1 |  | `PUP/_MARIE/day1.txt:81` |
| `marieidle` | 1 |  | `CST/_GANG/Marie/Script.txt:128` |
| `maskgiving` | 1 |  | `PUP/_MARIE/day1.txt:161` |
| `mayor` | 1 |  | `PUP/_BUICK/day2.txt:259` |
| `mayoridle` | 1 |  | `CST/_GANG/Mayor/Script.txt:132` |
| `menuselect` | 1 | arg | `BOOT/_BOOTFILE/Script 1.txt:197` |
| `menustate` | 1 |  | `BOOT/_BOOTFILE/Script 1.txt:194` |
| `menuvolume` | 1 | arg | `BOOT/_BOOTFILE/Script 1.txt:272` |
| `mezday1` | 1 |  | `PUP/_MEZ/Boot Script.txt:50` |
| `mezday2` | 1 |  | `PUP/_MEZ/Boot Script.txt:71` |
| `mezday3` | 1 |  | `PUP/_MEZ/Boot Script.txt:101` |
| `mightdie` | 1 |  | `PUP/_TROTTER/day1.txt:77` |
| `mining` | 1 |  | `PUP/_BLOOD/day1.txt:314` |
| `momcomment` | 1 |  | `PUP/_MARIE/day1.txt:42` |
| `money` | 1 |  | `PUP/_FEAR/day1.txt:104` |
| `morehelp` | 2 |  | `PUP/_HELP1/day1.txt:197`, `PUP/_HELP2/day1.txt:199` |
| `moresex` | 1 |  | `PUP/_OONA/day1.txt:222` |
| `mousedown` | 254 | thepoint | `BOOT/_BOOTFILE/Script 1.txt:98`, `CST/_EXTRA/birdcage/Script.txt:53`, `CST/_EXTRA/bounty1/Script.txt:466` |
| `mouselater` | 1 |  | `CST/_GANG/Bolivar/Script.txt:292` |
| `move` | 1 |  | `PRP/_SALGAMES/setcursor _arg__1.txt:170` |
| `moveactor` | 40 | where | `CST/_EXTRA/bird1/Script.txt:15`, `CST/_EXTRA/birdcage/Script.txt:15`, `CST/_EXTRA/birdcage/Script.txt:45` |
| `moveit` | 1 | x, y | `CST/_EXTRA/bird1/Script.txt:163` |
| `movestar` | 1 |  | `PRP/_HOUSE/initprop_2.txt:129` |
| `moveto` | 1 | x, y, z | `CST/_EXTRA/bird1/Script.txt:237` |
| `moveyoself` | 34 |  | `PRP/_INVEN/initprop_132.txt:40`, `PRP/_INVEN/initprop_149.txt:26`, `PRP/_INVEN/initprop_157.txt:32` |
| `mrs1` | 1 |  | `PUP/_MARIE/day1.txt:59` |
| `mrs3` | 1 |  | `PUP/_MARIE/day1.txt:129` |
| `mrs4` | 1 |  | `PUP/_MARIE/day1.txt:111` |
| `mustappologize` | 2 |  | `PUP/_HELP1/day1.txt:129`, `PUP/_HELP2/day1.txt:130` |
| `mwifeidle` | 1 |  | `CST/_GANG/Mwife/Script.txt:140` |
| `myidle` | 1 |  | `CST/_TARGET/dummytarg/Script.txt:39` |
| `namesup` | 1 |  | `PRP/_CREDITS/openshop_1.txt:38` |
| `nametodeg` | 1 | name | `PRP/_TUMBLE/setcursor _arg__1.txt:97` |
| `nametodegblood` | 1 | name | `PRP/_TUMBLE/setcursor _arg__1.txt:114` |
| `narrcomm` | 1 |  | `FLT/_NEW/death.txt:28` |
| `nedidle` | 1 |  | `CST/_GANG/Ned/Script.txt:114` |
| `nedtalk` | 1 |  | `PUP/_QUIST/day1.txt:100` |
| `newgame` | 2 |  | `FLT/_CHECKERS/setcursor _arg_.txt:18`, `FLT/_SALGAMES/initgame.txt:165` |
| `newposition` | 1 | deg | `FLT/_CRACK/setcursor _arg_.txt:94` |
| `nextflat` | 1 |  | `FLT/_CREDITS/openstage.txt:35` |
| `nextsound` | 1 |  | `SET/_HOTROOM/Scene B1.txt:72` |
| `nightfxs` | 2 |  | `SET/_NITE/Scene G14.txt:150`, `SET/_TOWN/Scene G14.txt:150` |
| `no` | 1 |  | `PUP/_ISAO/day1.txt:164` |
| `noface` | 7 |  | `FLT/_FIGHT/openflat.txt:70`, `FLT/_FLUTE/openflat.txt:30`, `FLT/_FLUTE/setcursor _arg_.txt:41` |
| `nomomoney` | 1 | quitgame | `PUP/_JAN/makebets.txt:224` |
| `notrich` | 1 |  | `PUP/_BUICK/day1.txt:133` |
| `offerobject` | 74 | what | `CST/_EXTRA/birdcage/Script.txt:58`, `CST/_EXTRA/dog/Script.txt:95`, `CST/_EXTRA/horse1/Script.txt:137` |
| `ominous` | 1 |  | `PUP/_ISAO/day1.txt:174` |
| `onstreet` | 1 |  | `PUP/_WATSON/day1.txt:211` |
| `oonaidle` | 1 |  | `CST/_GANG/Oona/Script.txt:125` |
| `open` | 1 |  | `PRP/_TARGET/endball _arg__33.txt:14` |
| `openactor` | 6 |  | `CST/_EXTRA/bird1/Script.txt:289`, `CST/_EXTRA/bounty1/Script.txt:441`, `CST/_EXTRA/chicken1/Script.txt:115` |
| `openfight` | 2 |  | `SET/_NITE/Boot Script.txt:102`, `SET/_TOWN/Boot Script.txt:112` |
| `openflat` | 10 |  | `FLT/_FIGHT/openflat.txt:3`, `FLT/_FLUTE/openflat.txt:3`, `FLT/_FLUTE/setcursor _arg_.txt:14` |
| `openidle` | 1 |  | `PRP/_TARGET/endball _arg__33.txt:21` |
| `openkid` | 2 |  | `SET/_NITE/Scene G5.txt:131`, `SET/_TOWN/Scene G5.txt:137` |
| `openprop` | 6 |  | `PRP/_HOUSE/initprop_213.txt:42`, `PRP/_HOUSE/initprop_507.txt:33`, `PRP/_HOUSE/initprop_530.txt:61` |
| `openscene` | 61 |  | `SET/_COURT/Boot Script.txt:61`, `SET/_HOTLOWER/Scene A1.txt:58`, `SET/_HOTLOWER/Scene A2.txt:16` |
| `openset` | 29 |  | `SET/_APOTH/Boot Script.txt:20`, `SET/_BANK/Boot Script.txt:23`, `SET/_CHIN/Boot Script.txt:20` |
| `openshop` | 6 |  | `PRP/_CREDITS/openshop_1.txt:3`, `PRP/_FIGHT/setcursor _arg__1.txt:8`, `PRP/_HUB/setcursor _arg__1.txt:8` |
| `openstage` | 5 |  | `FLT/_CRACK/setcursor _arg_.txt:80`, `FLT/_CREDITS/openstage.txt:3`, `FLT/_HOTPLATE/setcursor _arg_.txt:38` |
| `orocity` | 1 |  | `PUP/_MEZ/Boot Script.txt:463` |
| `otherdialogue` | 1 |  | `PUP/_PETE/Boot Script.txt:46` |
| `outsidesaloon` | 1 |  | `PUP/_JONES/day1.txt:17` |
| `overdoing` | 1 |  | `PUP/_BUICK/day1.txt:189` |
| `payoff` | 1 | total | `FLT/_SALGAMES/initgame.txt:265` |
| `payup` | 1 |  | `PUP/_SOPHIE/day3.txt:79` |
| `pecktime` | 2 |  | `CST/_EXTRA/chicken1/Script.txt:102`, `CST/_TARGET/chicken1targ/Script.txt:21` |
| `phase2` | 1 |  | `PUP/_FEAR/day1.txt:27` |
| `phase4` | 1 |  | `PUP/_FEAR/day1.txt:60` |
| `phase5` | 1 |  | `PUP/_FEAR/day1.txt:180` |
| `phase6` | 1 |  | `PUP/_FEAR/day1.txt:204` |
| `pickpieces` | 1 |  | `FLT/_SALGAMES/initgame.txt:127` |
| `pigblock` | 1 |  | `CST/_EXTRA/pig/Script.txt:309` |
| `pity` | 1 |  | `PUP/_RUBY/day2.txt:182` |
| `playagame` | 1 | thelook | `SET/_STORE/Scene D2.txt:60` |
| `playcheckers` | 1 |  | `FLT/_CHECKERS/playcheckers.txt:3` |
| `playerahead` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:544`, `CST/_EXTRA/kidgang1/Script.txt:667` |
| `playerbj` | 1 |  | `PUP/_JAN/makebets.txt:272` |
| `playerisat` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:608`, `CST/_EXTRA/kidgang1/Script.txt:731` |
| `playone` | 1 | sname | `SET/_HOTUPPER/Scene C4.txt:211` |
| `pointinabe` | 1 | arg | `SET/_STAGE/Scene A1.txt:52` |
| `pointinapoth` | 2 | arg | `SET/_NITE/Scene G9.txt:74`, `SET/_TOWN/Scene G9.txt:77` |
| `pointinarm` | 1 | arg | `SET/_MAYROOM/Scene B2.txt:55` |
| `pointinback` | 2 | arg | `SET/_NITE/Scene D10.txt:59`, `SET/_TOWN/Scene D10.txt:59` |
| `pointinbank` | 2 | arg | `SET/_NITE/Scene G6.txt:73`, `SET/_TOWN/Scene G6.txt:73` |
| `pointinbed` | 2 | arg | `SET/_MAYROOM/Scene B2.txt:63`, `SET/_MAYSTUDY/Scene A3.txt:52` |
| `pointinbell` | 1 | arg | `SET/_HOTLOWER/Scene A1.txt:86` |
| `pointinbone` | 1 | arg | `SET/_DOCTOR2/Scene A1.txt:139` |
| `pointinbox` | 4 | arg | `SET/_CHIN/Scene A1.txt:29`, `SET/_CHIN/Scene B1.txt:29`, `SET/_CHIN/Scene B3.txt:29` |
| `pointinbreak1` | 1 | arg | `SET/_HOTLOWER/Scene B3.txt:86` |
| `pointinbreak2` | 1 | arg | `SET/_HOTLOWER/Scene B3.txt:94` |
| `pointincase` | 1 | arg | `SET/_MAYSTUDY/Scene B3.txt:36` |
| `pointinchest` | 1 | arg | `SET/_DOCTOR2/Scene A1.txt:107` |
| `pointinchin` | 2 | arg | `SET/_NITE/Scene G12.txt:147`, `SET/_TOWN/Scene G12.txt:155` |
| `pointincigar` | 1 | arg | `SET/_STORE/Scene C2.txt:44` |
| `pointincourt` | 2 | arg | `SET/_NITE/Scene G4.txt:70`, `SET/_TOWN/Scene G4.txt:73` |
| `pointincow` | 1 | arg | `SET/_MAYSTUDY/Scene A3.txt:44` |
| `pointincrate` | 1 | arg | `SET/_APOTH/Scene A2.txt:54` |
| `pointindesk` | 2 | arg | `SET/_NITESCHO/Scene A2.txt:86`, `SET/_SCHOOL/Scene A2.txt:86` |
| `pointindine` | 1 | arg | `SET/_MAYHALL/Scene C3.txt:158` |
| `pointindip` | 2 | arg | `SET/_BANK/Scene D3.txt:47`, `SET/_DOCTOR1/Scene B1.txt:148` |
| `pointindoctor` | 2 | arg | `SET/_NITE/Scene G5.txt:115`, `SET/_TOWN/Scene G5.txt:121` |
| `pointindoor` | 12 | arg | `SET/_APOTH/Scene C2.txt:52`, `SET/_DOCTOR1/Scene B1.txt:132`, `SET/_DOCTOR2/Scene A1.txt:115` |
| `pointinexit` | 1 | arg | `SET/_MAYROOM/Scene A2.txt:92` |
| `pointinfire` | 3 | arg | `SET/_MAYSTUDY/Scene A2.txt:52`, `SET/_NITE/Scene G14.txt:51`, `SET/_TOWN/Scene G14.txt:51` |
| `pointinflute` | 1 | arg | `SET/_FLUTE/Scene B4.txt:51` |
| `pointinfront` | 1 | arg | `SET/_MAYHALL/Scene C4.txt:111` |
| `pointingrave1` | 2 | arg | `SET/_NITE/Scene C5.txt:45`, `SET/_TOWN/Scene C5.txt:45` |
| `pointingrave2` | 2 | arg | `SET/_NITE/Scene C5.txt:57`, `SET/_TOWN/Scene C5.txt:57` |
| `pointingrave3` | 2 | arg | `SET/_NITE/Scene C5.txt:69`, `SET/_TOWN/Scene C5.txt:69` |
| `pointingrinder` | 1 | arg | `SET/_STORE/Scene C2.txt:60` |
| `pointingun` | 1 | arg | `SET/_SALROOM/Scene B1.txt:93` |
| `pointinhall` | 3 | arg | `SET/_HOTUPPER/Scene C4.txt:187`, `SET/_MAYDINE/Scene D2.txt:105`, `SET/_MAYSTUDY/Scene B2.txt:88` |
| `pointinhard` | 2 | arg | `SET/_NITE/Scene H11.txt:41`, `SET/_TOWN/Scene H11.txt:41` |
| `pointinhexbut` | 1 | arg | `SET/_SNAKE/Scene B3.txt:21` |
| `pointinhome` | 1 | arg | `SET/_MAYHALL/Scene C4.txt:103` |
| `pointinhorse` | 1 | arg | `SET/_LIVERY/Scene D2.txt:66` |
| `pointinhotel` | 2 | arg | `SET/_NITE/Scene G5.txt:123`, `SET/_TOWN/Scene G5.txt:129` |
| `pointinjail` | 2 | arg | `SET/_NITE/Scene G12.txt:139`, `SET/_TOWN/Scene G12.txt:147` |
| `pointinjug` | 1 | arg | `SET/_APOTH/Scene A2.txt:38` |
| `pointinlivery` | 2 | arg | `SET/_NITE/Scene J6.txt:121`, `SET/_TOWN/Scene J6.txt:121` |
| `pointinlock` | 1 | arg | `SET/_MAYSTUDY/Scene B2.txt:96` |
| `pointinmayor` | 2 | arg | `SET/_NITE/Scene J9.txt:98`, `SET/_TOWN/Scene J9.txt:94` |
| `pointinnews` | 2 | arg | `SET/_NITE/Scene D8.txt:89`, `SET/_TOWN/Scene D8.txt:89` |
| `pointinnude` | 3 | arg | `SET/_SALLOWER/Scene C1.txt:29`, `SET/_SALLOWER/Scene C2.txt:21`, `SET/_SALLOWER/Scene C3.txt:21` |
| `pointinout` | 2 | arg | `SET/_NITE/Scene D8.txt:97`, `SET/_TOWN/Scene D8.txt:97` |
| `pointinpaper` | 2 | arg | `SET/_NITE/Scene D8.txt:81`, `SET/_TOWN/Scene D8.txt:81` |
| `pointinpic1` | 2 | arg | `SET/_HOTLOWER/Scene C3.txt:61`, `SET/_MAYUPPER/Scene B2.txt:29` |
| `pointinpic2` | 2 | arg | `SET/_HOTLOWER/Scene C3.txt:69`, `SET/_MAYUPPER/Scene B2.txt:37` |
| `pointinpict` | 6 | arg | `SET/_HOTLOWER/Scene B3.txt:102`, `SET/_HOTLOWER/Scene C3.txt:77`, `SET/_MAYDINE/Scene D2.txt:113` |
| `pointinpig` | 1 | arg | `SET/_APOTH/Scene A2.txt:46` |
| `pointinpodium` | 1 | arg | `SET/_TBIRD/Scene B2.txt:30` |
| `pointinpool` | 4 | arg | `SET/_COURT/Scene C3.txt:75`, `SET/_COURT/Scene C5.txt:68`, `SET/_NITECOUR/Scene C3.txt:75` |
| `pointinpost` | 10 | arg | `SET/_HOTLOWER/Scene A2.txt:53`, `SET/_HOTLOWER/Scene C3.txt:50`, `SET/_JAIL/Scene B2.txt:21` |
| `pointinpot` | 2 | arg | `SET/_CHIN/Scene A3.txt:29`, `SET/_DOCTOR1/Scene B1.txt:140` |
| `pointinpots` | 1 | arg | `SET/_STORE/Scene C2.txt:68` |
| `pointinpres` | 1 | arg | `SET/_JAIL/Scene A2.txt:45` |
| `pointinrice` | 18 | arg | `SET/_BANK/Scene D2.txt:50`, `SET/_CHIN/Scene A2.txt:52`, `SET/_COURT/Scene C3.txt:67` |
| `pointinroom` | 1 | arg | `SET/_MAYUPPER/Scene B1.txt:72` |
| `pointinruby` | 1 | arg | `SET/_SALUPPER/Scene A1.txt:146` |
| `pointinrules` | 3 | arg | `SET/_NITE/Scene G14.txt:43`, `SET/_SALLOWER/Scene B4.txt:50`, `SET/_TOWN/Scene G14.txt:43` |
| `pointinsafe` | 1 | arg | `SET/_JAIL/Scene A1.txt:63` |
| `pointinsaloon` | 2 | arg | `SET/_NITE/Scene G8.txt:124`, `SET/_TOWN/Scene G8.txt:125` |
| `pointinscale` | 1 | arg | `SET/_STORE/Scene C2.txt:52` |
| `pointinshoe` | 2 | arg | `SET/_LIVERY/Scene D2.txt:74`, `SET/_LIVERY/Scene D3.txt:21` |
| `pointinsign` | 27 | arg | `SET/_BANK/Scene D1.txt:33`, `SET/_BANK/Scene D3.txt:39`, `SET/_COURT/Scene B4.txt:21` |
| `pointinskel` | 1 | arg | `SET/_DOCTOR2/Scene A1.txt:131` |
| `pointinslot` | 1 | arg | `SET/_SALLOWER/Scene D3.txt:38` |
| `pointinstagex` | 2 | arg | `SET/_NITE/Scene G8.txt:116`, `SET/_TOWN/Scene G8.txt:117` |
| `pointinstore` | 4 | arg | `SET/_NITE/Scene B11.txt:73`, `SET/_NITE/Scene G10.txt:74`, `SET/_TOWN/Scene B11.txt:50` |
| `pointinstove` | 2 | arg | `SET/_DOCTOR1/Scene B1.txt:124`, `SET/_DOCTOR2/Scene A1.txt:99` |
| `pointinstrip` | 1 | arg | `SET/_DOCTOR2/Scene A1.txt:147` |
| `pointinstudy` | 1 | arg | `SET/_MAYHALL/Scene C3.txt:150` |
| `pointinsundial` | 4 | arg | `SET/_HUB/Scene C4.txt:60`, `SET/_HUB/Scene D3.txt:60`, `SET/_HUB/Scene D5.txt:60` |
| `pointintable` | 1 | arg | `SET/_DOCTOR2/Scene A1.txt:123` |
| `pointinteller` | 1 | arg | `SET/_BANK/Scene D3.txt:55` |
| `pointinundertak` | 2 | arg | `SET/_NITE/Scene A7.txt:91`, `SET/_TOWN/Scene A7.txt:91` |
| `pointinwant` | 1 | arg | `SET/_JAIL/Scene A2.txt:37` |
| `pointinwell` | 2 | arg | `SET/_NITE/Scene E12.txt:37`, `SET/_TOWN/Scene E12.txt:37` |
| `pointinwind` | 1 | arg | `SET/_MAYROOM/Scene A1.txt:25` |
| `pointinwindow` | 1 | arg | `SET/_HOTROOM/Scene A1.txt:46` |
| `popdown` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:332`, `CST/_EXTRA/kidgang1/Script.txt:417` |
| `popup` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:324`, `CST/_EXTRA/kidgang1/Script.txt:409` |
| `postgame2nite` | 1 |  | `PUP/_MEZ/Boot Script.txt:365` |
| `postgame2pm` | 1 |  | `PUP/_MEZ/Boot Script.txt:332` |
| `postgame3nite` | 1 |  | `PUP/_MEZ/Boot Script.txt:498` |
| `postgame3pm` | 1 |  | `PUP/_MEZ/Boot Script.txt:446` |
| `postgameday1` | 1 |  | `PUP/_MEZ/Boot Script.txt:233` |
| `postgameday1nite` | 1 |  | `PUP/_MEZ/Boot Script.txt:245` |
| `postgameday2` | 1 |  | `PUP/_MEZ/Boot Script.txt:319` |
| `postgameday3` | 1 |  | `PUP/_MEZ/Boot Script.txt:428` |
| `postmovie` | 1 |  | `FLT/_NEW/setcursor _arg_.txt:71` |
| `premovie` | 1 |  | `FLT/_NEW/setcursor _arg_.txt:65` |
| `problems` | 1 |  | `PUP/_JONES/day1.txt:235` |
| `propdone` | 1 | num | `PRP/_CREDITS/openshop_1.txt:56` |
| `proptocol` | 1 | theprop | `PRP/_CHECKERS/automove_1.txt:243` |
| `proptorow` | 1 | theprop | `PRP/_CHECKERS/automove_1.txt:247` |
| `punch` | 1 |  | `PRP/_FIGHT/setcursor _arg__54.txt:113` |
| `punch2` | 1 |  | `PRP/_FIGHT/setcursor _arg__54.txt:132` |
| `putdownactor` | 39 |  | `CST/_EXTRA/bird1/Script.txt:39`, `CST/_EXTRA/birdcage/Script.txt:38`, `CST/_EXTRA/bounty1/Script.txt:434` |
| `putdownprop` | 4 |  | `PRP/_HOUSE/initprop_2.txt:10`, `PRP/_HOUSE/initprop_530.txt:11`, `PRP/_INVEN/initprop_370.txt:26` |
| `puzzletime` | 1 |  | `PRP/_HOUSE/setcursor _arg__678.txt:67` |
| `quisthere` | 1 |  | `PUP/_NED/day2.txt:206` |
| `quistidle` | 1 |  | `CST/_GANG/Quist/Script.txt:83` |
| `quistmeet` | 1 |  | `PUP/_NED/day2.txt:186` |
| `quitfight` | 1 |  | `FLT/_FIGHT/openflat.txt:27` |
| `quitgame` | 2 |  | `FLT/_CHECKERS/setcursor _arg_.txt:30`, `FLT/_SALGAMES/initgame.txt:323` |
| `quittalk` | 1 |  | `PUP/_MEZ/Boot Script.txt:221` |
| `quiz` | 2 |  | `PUP/_MARIE/day2.txt:270`, `PUP/_MARIE/day3.txt:85` |
| `raise` | 9 |  | `CST/_TARGET/dummytarg/Script.txt:47`, `CST/_TARGET/target1/Script.txt:25`, `CST/_TARGET/target2/Script.txt:25` |
| `raisebet` | 1 |  | `PUP/_MEZ/makebets.txt:130` |
| `randomloc` | 2 |  | `PRP/_HOUSE/initprop_213.txt:26`, `PRP/_HOUSE/setcursor _arg__202.txt:58` |
| `readboard` | 1 | row, col | `PRP/_CHECKERS/automove_1.txt:235` |
| `realdist` | 4 | propname | `PRP/_HOUSE/setcursor _arg__165.txt:41`, `PRP/_HOUSE/setcursor _arg__498.txt:46`, `PRP/_HOUSE/setcursor _arg__678.txt:42` |
| `recoil` | 1 |  | `PRP/_HOUSE/setcursor _arg__270.txt:54` |
| `relax` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:361`, `PRP/_HOUSE/setcursor _arg__270.txt:88` |
| `remember` | 1 |  | `PUP/_MEZ/Boot Script.txt:303` |
| `resetactor` | 39 |  | `CST/_EXTRA/bird1/Script.txt:3`, `CST/_EXTRA/birdcage/Script.txt:3`, `CST/_EXTRA/bounty1/Script.txt:411` |
| `resetallvars` | 1 |  | `FLT/_NEW/setcursor _arg_.txt:316` |
| `rest` | 1 |  | `PRP/_FIGHT/setcursor _arg__54.txt:155` |
| `resteyes` | 1 |  | `PRP/_INVEN/initprop_83.txt:92` |
| `retort` | 1 |  | `PUP/_OONA/day1.txt:33` |
| `ring` | 2 |  | `PUP/_ISAO/day1.txt:136`, `PUP/_SOPHIE/day1.txt:112` |
| `ringer` | 2 |  | `PUP/_HELP1/day1.txt:172`, `PUP/_HELP2/day1.txt:174` |
| `rollback` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:311`, `CST/_EXTRA/kidgang1/Script.txt:389` |
| `rollout` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:299`, `CST/_EXTRA/kidgang1/Script.txt:367` |
| `romance` | 1 |  | `PUP/_LAUREL/day2.txt:251` |
| `room3` | 1 |  | `PUP/_FEAR/day1.txt:86` |
| `roomsound` | 1 |  | `SET/_HOTROOM/Scene B1.txt:66` |
| `rough` | 1 |  | `PUP/_SOPHIE/day3.txt:135` |
| `rowcol2move` | 1 | srow, scol, erow, ecol | `PRP/_CHECKERS/setcursor _arg__2.txt:120` |
| `runblackjack` | 1 |  | `SET/_SALLOWER/Scene B4.txt:12` |
| `runclock` | 1 |  | `SET/_MAYDINE/Scene E2.txt:3` |
| `runcredits` | 1 |  | `SET/_TOWN/Scene G14.txt:307` |
| `runeat` | 1 | speed, turn | `CST/_EXTRA/pig/Script.txt:102` |
| `runmazie` | 1 |  | `SET/_SALUPPER/Scene A1.txt:154` |
| `runpig` | 1 | speed, turn | `CST/_EXTRA/pig/Script.txt:114` |
| `runpoker` | 1 |  | `SET/_SALLOWER/Scene C2.txt:33` |
| `runyoself` | 129 |  | `PUP/_BLOOD/Boot Script.txt:5`, `PUP/_BLOOD/day1.txt:5`, `PUP/_BLOOD/day2.txt:5` |
| `sad` | 1 |  | `PUP/_ISAO/day1.txt:184` |
| `saferun` | 1 |  | `CST/_EXTRA/pig/Script.txt:319` |
| `savethiscode` | 1 |  | `PUP/_BLOOD/day2.txt:290` |
| `saybet` | 3 |  | `PUP/_MEZ/playscript.txt:194`, `PUP/_PETE/playscript.txt:217`, `PUP/_ZEB/playscript.txt:293` |
| `saybye` | 1 |  | `PUP/_MWIFE/day2.txt:217` |
| `saydbljump` | 1 |  | `PRP/_CHECKERS/setcursor _arg__2.txt:152` |
| `sayflatter` | 2 |  | `PUP/_MWIFE/day2.txt:146`, `PUP/_MWIFE/day3.txt:194` |
| `sayhello` | 1 |  | `PUP/_MWIFE/day2.txt:184` |
| `sayinsult` | 2 |  | `PUP/_MWIFE/day2.txt:166`, `PUP/_MWIFE/day3.txt:212` |
| `sayjump` | 1 |  | `PRP/_CHECKERS/setcursor _arg__2.txt:165` |
| `scamgirl` | 1 |  | `PUP/_JONES/day1.txt:124` |
| `score` | 1 |  | `FLT/_SALGAMES/initgame.txt:222` |
| `scorp` | 1 |  | `FLT/_SCORP/setcursor _arg_.txt:52` |
| `scrollnames` | 1 |  | `PRP/_CREDITS/openshop_1.txt:11` |
| `secondchance` | 2 |  | `PUP/_HELP1/day1.txt:82`, `PUP/_HELP2/day1.txt:83` |
| `seebet` | 3 |  | `PUP/_MEZ/playscript.txt:260`, `PUP/_PETE/playscript.txt:283`, `PUP/_ZEB/playscript.txt:359` |
| `seeshaman` | 1 |  | `SET/_HUB/Boot Script.txt:122` |
| `selhandbevel` | 1 |  | `PRP/_INVEN/setcursor _arg__1.txt:259` |
| `sendquit` | 1 |  | `PRP/_FIGHT/sendquit_87.txt:3` |
| `setcursor` | 207 | arg | `CST/_GANG/Fear/Script.txt:3`, `CST/_GANG/Gus/Script.txt:3`, `CST/_GANG/Jones/Script.txt:3` |
| `setup` | 1 |  | `PUP/_OONA/day1.txt:163` |
| `setupactor` | 39 | where | `CST/_EXTRA/bird1/Script.txt:20`, `CST/_EXTRA/birdcage/Script.txt:23`, `CST/_EXTRA/bounty1/Script.txt:3` |
| `setupprop` | 48 | where | `PRP/_HOUSE/initprop_174.txt:12`, `PRP/_HOUSE/initprop_2.txt:17`, `PRP/_HOUSE/initprop_213.txt:10` |
| `setupstar` | 1 |  | `PRP/_HOUSE/initprop_2.txt:27` |
| `sfx` | 1 |  | `PUP/_KID/day1.txt:148` |
| `shackit` | 1 |  | `PUP/_COBB/day2.txt:33` |
| `shamanidle` | 1 |  | `CST/_EXTRA/shaman/Script.txt:41` |
| `shop` | 4 |  | `PUP/_BLOOD/day2.txt:145`, `PUP/_MAYOR/day2.txt:156`, `PUP/_NED/day2.txt:135` |
| `showstep` | 1 | arg | `PRP/_FLUTE/setcursor_1.txt:23` |
| `silicon` | 1 |  | `PUP/_LAUREL/day2.txt:126` |
| `simple` | 1 |  | `CST/_GANG/Bolivar/Script.txt:287` |
| `sleep` | 2 |  | `SET/_HOTROOM/Scene A1.txt:69`, `SET/_MAYROOM/Scene B2.txt:44` |
| `slow` | 1 |  | `CST/_TARGET/pigtarg/Script.txt:19` |
| `smoke` | 2 |  | `PRP/_HOUSE/setcursor _arg__270.txt:71`, `PUP/_OONA/day2.txt:113` |
| `snortme` | 1 |  | `CST/_EXTRA/pig/Script.txt:256` |
| `snortsound` | 1 | vol | `CST/_EXTRA/pig/Script.txt:298` |
| `solved` | 2 |  | `PRP/_SNAKE/setcursor _arg__1.txt:210`, `PRP/_TUMBLE/setcursor _arg__1.txt:58` |
| `sonoma` | 1 |  | `PUP/_JONES/day2.txt:311` |
| `sonomaidle` | 1 |  | `CST/_GANG/Sonoma/Script.txt:105` |
| `sorry` | 1 |  | `PUP/_LAUREL/day3.txt:146` |
| `sorrybol` | 1 |  | `PUP/_BOLIVAR/DAY1.txt:414` |
| `soundfx` | 6 |  | `PUP/_DELL1/day1.txt:111`, `PUP/_DELL2/day1.txt:94`, `PUP/_DOC/day2.txt:159` |
| `SOUNDFXS` | 1 |  | `SET/_CHIN/Boot Script.txt:41` |
| `soundfxs` | 4 |  | `SET/_HOTLOWER/Scene A2.txt:61`, `SET/_MAYDINE/Scene D2.txt:85`, `SET/_MAYSTUDY/Scene A2.txt:29` |
| `southstar` | 1 |  | `PRP/_HOUSE/initprop_2.txt:42` |
| `spinall` | 1 | spin | `PRP/_SNAKE/setcursor _arg__1.txt:53` |
| `spinone` | 1 | name, spin, times | `PRP/_SNAKE/setcursor _arg__1.txt:77` |
| `spizall` | 1 | thetarg, spin | `PRP/_SNAKE/setcursor _arg__1.txt:187` |
| `spotmovie` | 2 | thename | `FLT/_NEW/setcursor _arg_.txt:58`, `FLT/_SUNDIAL/offerobject _what_.txt:105` |
| `stand` | 1 |  | `CST/_EXTRA/kidgang1/Script.txt:462` |
| `standfire` | 1 |  | `CST/_EXTRA/bounty1/Script.txt:340` |
| `startgood` | 1 |  | `PUP/_OONA/day1.txt:84` |
| `startnoise` | 1 |  | `PRP/_SUNDIAL/setcursor _arg__1.txt:99` |
| `statloop` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:79`, `CST/_EXTRA/kidgang1/Script.txt:77` |
| `statuschange` | 1 | arg | `PUP/_BLOOD/day1.txt:478` |
| `stay` | 1 |  | `PUP/_SONOMA/day3.txt:87` |
| `stdgreet` | 1 |  | `PUP/_MEZ/Boot Script.txt:197` |
| `stdlook` | 1 |  | `CST/_GANG/Bolivar/Script.txt:297` |
| `stdmouse` | 2 | what, arg | `PRP/_HOUSE/setcursor _arg__1.txt:24`, `PRP/_INVEN/setcursor _arg__1.txt:88` |
| `stdquit` | 1 |  | `PUP/_MEZ/Boot Script.txt:504` |
| `steady` | 3 |  | `CST/_TARGET/water1/Script.txt:3`, `CST/_TARGET/water2/Script.txt:3`, `CST/_TARGET/water3/Script.txt:3` |
| `stillblack` | 1 |  | `SET/_HUB/Boot Script.txt:69` |
| `stop` | 18 |  | `CST/_TARGET/bottle1targ/Script.txt:14`, `CST/_TARGET/can1targ/Script.txt:19`, `CST/_TARGET/can2targ/Script.txt:19` |
| `subrack1` | 3 |  | `PUP/_DELL1/day1.txt:9`, `PUP/_DELL2/day1.txt:9`, `PUP/_JONES/day1.txt:79` |
| `subrack2` | 3 |  | `PUP/_DELL1/day1.txt:32`, `PUP/_DELL2/day1.txt:29`, `PUP/_JONES/day1.txt:167` |
| `subrack3` | 3 |  | `PUP/_DELL1/day1.txt:53`, `PUP/_DELL2/day1.txt:44`, `PUP/_JONES/day1.txt:203` |
| `subrack4` | 2 |  | `PUP/_DELL1/day1.txt:74`, `PUP/_DELL2/day1.txt:60` |
| `subrack5` | 2 |  | `PUP/_DELL1/day1.txt:90`, `PUP/_DELL2/day1.txt:75` |
| `subrackbye` | 1 |  | `PUP/_MWIFE/day1.txt:190` |
| `subracknasty` | 1 |  | `PUP/_LAUREL/day1.txt:45` |
| `subracksex` | 1 |  | `PUP/_OONA/day1.txt:180` |
| `tail` | 1 |  | `CST/_EXTRA/horse1/Script.txt:125` |
| `takeroom` | 1 |  | `PUP/_FEAR/day1.txt:123` |
| `talent` | 1 |  | `PUP/_SOPHIE/day1.txt:67` |
| `talk` | 1 |  | `PUP/_OONA/day2.txt:84` |
| `talk2` | 1 |  | `PUP/_KID/day1.txt:36` |
| `talk3` | 1 |  | `PUP/_KID/day1.txt:63` |
| `talk4` | 1 |  | `PUP/_KID/day1.txt:90` |
| `talk5` | 1 |  | `PUP/_KID/day1.txt:118` |
| `taxes` | 1 |  | `PUP/_SIDE/day2.txt:148` |
| `tbird` | 1 |  | `PUP/_BLOOD/day4.txt:12` |
| `teach` | 1 |  | `PUP/_SONOMA/day3.txt:72` |
| `tellsall` | 1 |  | `PUP/_BLOOD/day1.txt:343` |
| `thanks` | 1 |  | `PUP/_MEZ/Boot Script.txt:160` |
| `thehotel` | 1 |  | `PUP/_BLOOD/day1.txt:104` |
| `thirdchance` | 2 |  | `PUP/_HELP1/day1.txt:103`, `PUP/_HELP2/day1.txt:104` |
| `threeam` | 15 |  | `PUP/_BLOOD/day3.txt:22`, `PUP/_DEAD/day1.txt:185`, `PUP/_DOC/day3.txt:27` |
| `threenite` | 9 |  | `PUP/_BUICK/day3.txt:171`, `PUP/_FLIPPO/day3.txt:138`, `PUP/_JONES/day3.txt:150` |
| `threepm` | 17 |  | `PUP/_BUICK/day3.txt:115`, `PUP/_DEAD/day1.txt:236`, `PUP/_DOC/day3.txt:114` |
| `threepuzzle` | 1 |  | `PUP/_DOC/day3.txt:57` |
| `todayspaper` | 1 |  | `FLT/_HOTPLATE/setcursor _arg_.txt:26` |
| `toddidle` | 1 |  | `CST/_GANG/Todd/Script.txt:78` |
| `toidle` | 1 |  | `CST/_GANG/Leroy/Script.txt:121` |
| `toolong` | 1 |  | `PRP/_CHECKERS/automove_1.txt:386` |
| `toonear` | 2 | dist | `SET/_NITE/Boot Script.txt:74`, `SET/_TOWN/Boot Script.txt:84` |
| `tothink` | 1 |  | `CST/_GANG/Mayor/Script.txt:114` |
| `townstreet` | 1 |  | `PUP/_BLOOD/day1.txt:19` |
| `trackbut` | 4 | arg | `FLT/_NEW/death.txt:212`, `FLT/_NEW/openflat.txt:75`, `FLT/_SUNDIAL/offerobject _what_.txt:11` |
| `trade` | 1 |  | `PUP/_MARIE/day3.txt:155` |
| `treasure` | 1 |  | `PUP/_MARIE/day3.txt:260` |
| `trigger` | 8 |  | `FLT/_SCORP/setcursor _arg_.txt:13`, `SET/_HOTUPPER/Scene C4.txt:195`, `SET/_MAYDINE/Scene D2.txt:68` |
| `triggerx` | 2 |  | `SET/_NITE/Boot Script.txt:89`, `SET/_TOWN/Boot Script.txt:99` |
| `trotteridle` | 1 |  | `CST/_GANG/Trotter/Script.txt:111` |
| `tryopen` | 1 |  | `FLT/_CRACK/setcursor _arg_.txt:27` |
| `turnfire` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:244`, `CST/_EXTRA/kidgang1/Script.txt:273` |
| `twoam` | 13 |  | `PUP/_BLOOD/day2.txt:23`, `PUP/_DEAD/day1.txt:65`, `PUP/_DOC/day2.txt:28` |
| `twonite` | 8 |  | `PUP/_BUICK/day2.txt:215`, `PUP/_JONES/day2.txt:264`, `PUP/_LAUREL/day2.txt:223` |
| `twopm` | 18 |  | `PUP/_BLOOD/day2.txt:195`, `PUP/_COBB/day2.txt:78`, `PUP/_DEAD/day1.txt:131` |
| `unmangle` | 2 |  | `PRP/_SNAKE/setcursor _arg__1.txt:222`, `PRP/_TUMBLE/setcursor _arg__1.txt:84` |
| `unsure` | 1 |  | `PUP/_MWIFE/day1.txt:156` |
| `update` | 1 |  | `FLT/_NEW/openflat.txt:44` |
| `updatebetbevel` | 1 |  | `PUP/_MEZ/makebets.txt:204` |
| `updatenums` | 1 |  | `FLT/_CRACK/setcursor _arg_.txt:119` |
| `updateraisebevel` | 1 |  | `PUP/_MEZ/makebets.txt:218` |
| `updatescreen` | 1 | board | `FLT/_CHECKERS/setcursor _arg_.txt:49` |
| `upstairs` | 1 |  | `PUP/_BUICK/day2.txt:297` |
| `valuetoprop` | 1 | value | `FLT/_CHECKERS/setcursor _arg_.txt:74` |
| `viewcards` | 1 |  | `PUP/_MEZ/makebets.txt:183` |
| `voiceone` | 2 | thename | `FLT/_NEW/death.txt:144`, `SET/_HUB/Boot Script.txt:114` |
| `waithide` | 1 |  | `PRP/_HOUSE/initprop_174.txt:40` |
| `wakeup` | 3 |  | `PUP/_BUICK/day3.txt:39`, `PUP/_JONES/day2.txt:64`, `PUP/_MARIE/day2.txt:25` |
| `walk` | 2 |  | `CST/_TARGET/chicken1targ/Script.txt:34`, `CST/_TARGET/gilatarg/Script.txt:7` |
| `walkcloser` | 2 |  | `CST/_EXTRA/bounty1/Script.txt:474`, `CST/_EXTRA/kidgang1/Script.txt:597` |
| `walkloop` | 3 |  | `CST/_EXTRA/bounty1/Script.txt:40`, `CST/_EXTRA/kidgang1/Script.txt:39`, `CST/_MINE/skeleton/Script.txt:57` |
| `walkout` | 1 |  | `CST/_GANG/Leroy/Script.txt:116` |
| `wander` | 1 |  | `PUP/_JONES/day2.txt:141` |
| `wanttoplay` | 1 |  | `PUP/_MEZ/Boot Script.txt:176` |
| `watidle1` | 1 |  | `CST/_GANG/Watson/Script.txt:127` |
| `watidle2` | 1 |  | `CST/_GANG/Watson/Script.txt:132` |
| `watsongone` | 1 |  | `PUP/_DOC/day3.txt:155` |
| `watsonidle` | 1 |  | `CST/_GANG/Watson/Script.txt:142` |
| `weststar` | 1 |  | `PRP/_HOUSE/initprop_2.txt:71` |
| `whatdate` | 1 |  | `PUP/_LEROY/day1.txt:232` |
| `whenready` | 1 |  | `PUP/_FEAR/day1.txt:159` |
| `whoareyou` | 1 |  | `PUP/_ISAO/day1.txt:70` |
| `why` | 1 |  | `PUP/_MEZ/Boot Script.txt:482` |
| `win` | 1 | person | `PRP/_CHECKERS/automove_1.txt:141` |
| `wine` | 1 |  | `PUP/_BLOOD/day1.txt:458` |
| `winner` | 3 |  | `PUP/_MEZ/playscript.txt:279`, `PUP/_PETE/playscript.txt:304`, `PUP/_ZEB/playscript.txt:380` |
| `withact` | 1 | amount | `PUP/_TELLER/day1.txt:286` |
| `withbig` | 1 |  | `PUP/_TELLER/day1.txt:317` |
| `withdraw` | 1 |  | `PUP/_TELLER/day1.txt:252` |
| `withlil` | 1 |  | `PUP/_TELLER/day1.txt:297` |
| `writeboard` | 1 | row, col, person | `PRP/_CHECKERS/automove_1.txt:239` |
| `xtocol` | 1 | x | `PRP/_CHECKERS/automove_1.txt:251` |
| `ytorow` | 1 | y | `PRP/_CHECKERS/automove_1.txt:262` |
| `yunni` | 1 |  | `PUP/_BLOOD/day1.txt:384` |
| `zeroaccount` | 1 |  | `PUP/_TELLER/day1.txt:145` |
| `zerocash` | 1 |  | `PUP/_TELLER/day1.txt:157` |
| `zeroslotprops` | 1 |  | `FLT/_SALGAMES/initgame.txt:39` |
