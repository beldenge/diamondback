# DF.EXE script VM — semantics recovered with Ghidra

This is the rulebook for the DreamFactory interpreter inside Dust's
`DF.EXE` (SHA-1 `54558d7b47b627e9770932be0afa9efd2fadce00`), read out of a
Ghidra 12.1.3 headless decompile of the whole `.text` section
(`dustdecompile/ghidra/`, output under `dustdecompile/out/ghidra/DF/`).
Addresses are VAs, image base `0x400000`. `FUN_xxxxxxxx` names are
Ghidra's. Everything here is **proven in the binary** unless a line says
*inferred*.

Companion docs: [findings.md](findings.md) (opcode table, movies,
projector, walk), [handbook.md](handbook.md) (per-verb call sites).

## 0. Map of the interpreter

| Function | Role |
|---|---|
| `FUN_004246f0` | Main loop. Pumps Windows messages, dispatches queued input events to the **boot record** (`DAT_004607a0`) and the **window record** (`DAT_0046081a`) |
| `FUN_00408610` | Boot-record event handler: event → script message (`mousedown(...)`, `keydown("...")`, `idle()`, `boot()`, …) |
| `FUN_0041b560` | **Text → token compiler.** Engine messages are built as text and compiled at runtime |
| `FUN_004177f0` | Call a user procedure across a chain of script records (message send) |
| `FUN_00417910` / `FUN_004179e0` | Find `code name (params)` in one record; bind params as locals |
| `FUN_00417b90` | Statement executor (`if`/`switch`/`for`/`while`/assignment/return/…) |
| `FUN_004098b0` / `FUN_0040a080` | Expression parser (operator precedence) / primary evaluator |
| `FUN_00409af0` | Binary operator semantics |
| `FUN_00431dd0` | Command dispatcher (ids 12001–12088 and field **set** forms 16001–16053) |
| `FUN_00404320` | Function dispatcher (field **get** forms 16001–16053 and functions 20001–20108) |
| `FUN_0040fe00` | Pump: walk jobs, ball jobs, `makeloop` timers, then one display frame |
| `FUN_0040d500` / `FUN_0040e140` | Frame end: `frame()` counter, sprite draw, wait until the 60 Hz tick advanced by `framerate` |

`dustdecompile/out/ghidra/DF/opmap.tsv` (built by `ghidra/fn.py`-style
parsing of the two dispatchers) lists every opcode id → handler.

## 1. Values and types

A script value is 8 bytes: `u16 type`, `u32 payload`, `u16 0`.

| type | Meaning | Payload |
|---|---|---|
| 2 | **boolean** (`true`/`false`, comparisons, `not`) | 0 / 1 |
| 3 | **string** (Pascal, max 255 chars) | slot in a 20-entry temp pool (`FUN_004097a0`; error `0x36` when exhausted) |
| 4 | **integer**, 32-bit signed | the number |

A **point** is an integer: `x << 16 | (y & 0xffff)` (`makepoint`
`FUN_004068e0`, `pointx` `FUN_00406820` reads the high half). Engine
`mousedown(...)` passes the packed point as a decimal literal.
`hasattention` calls `mousedown (0)` = point (0,0).

`type (v)` returns `"logic"`, `"text"`, `"number"` or `"unknown"`.

## 2. Expressions (`FUN_004098b0`, `FUN_0040a080`, `FUN_00409af0`)

Primary: string / integer literal, `true`/`false`, `me`/`target`
(Pascal strings at record +30/+62), `( … )`, unary `-` (int only, error
`0xe` otherwise), `not` (**bool only**), a variable, a user call
`name ( … )`, or an opcode in `16000…20109` (dispatched to
`FUN_00404320`).

Binary operators reduce left-to-right inside each precedence class,
tightest first (`FUN_00409ff0`):

| Class | Operators |
|---|---|
| 0 | `*` `/` |
| 1 | `+` `-` |
| 2 | `@` |
| 3 | `>` `<` `>=` `<=` |
| 4 | `=` `!=` |
| 5 | `&` / `and` |
| 6 | `\|` / `or` |

So `a < b = c < d` is `(a < b) = (c < d)`, and `=` binds looser than
`<`. Names `!=`, `>=`, `<=` are the Mac Roman glyphs `≠ ≤ ≥` (bytes
0xAD/0xB2/0xB3) in the table — 307 names, 305 ids, in both `DF.EXE` and
`MOVPLAY.EXE`.

Operand rules (`FUN_00409af0`), error `0xe` = type mismatch:

- `+ - *`: both int. `/`: both int, truncating; divide by zero is error `0x37`.
- `&` `|`: both **bool**, bitwise on 0/1. Both sides are always evaluated (no short circuit).
- `@`: both **strings** (an int must go through `numtostring`); result > 255 chars is error `0x1a`.
- `=` `!=`: **different types compare unequal** (no error). Same type: ints/bools by value; strings **case-insensitive** (fold table `DAT_00445450` maps A–Z to a–z only).
- `> < >= <=`: both int.

The expression stack holds 39 entries (error 3 beyond that).

## 3. Statements (`FUN_00417b90`)

Every statement ends at a BREAK token (else error `0x1b`). After each
statement, if `keyaborts` is on and the abort key is down, the script
stops with error `0x35`.

- `global a, b` / `local a, b` — declare in the globals table
  (`DAT_00460bd8`) or the procedure's locals table. Declaring an existing
  name is a no-op. Undeclared names are error 9 on read **and** on write.
- Assignment `name = expr` requires `=` after the name (error `0x10`).
  Locals are searched before globals (`FUN_0041c200`), so a parameter or
  local shadows a global of the same name. Token byte 6–7 caches the slot.
- `if expr` — the value **must be bool** (error `0xe`). `else`/`endif`
  nest; an unmatched closer is error `0x1d`.
- `while expr` / `endwhile` — bool condition, re-evaluated at `endwhile`
  from the saved position. Depth ≤ 19.
- `for v = a to b [step s]` / `endfor` — ints; `v` is created as a local
  if missing; the body runs while `v <= b` (or `v >= b` when `s < 0`),
  inclusive; `v += s` at `endfor`. `step 0` never terminates.
- `switch expr` — the value must be **int or string** (a bool is error
  `0xe`). `case expr` values are compared with matching types (mismatch
  is error `0xe`); strings case-insensitively. **A matched case whose body
  is empty falls through** into the next `case` label(s) (`FUN_00418aa0`
  skips consecutive labels); a non-empty body ends at the next `case`
  (no C-style fallthrough). No match skips to `endswitch`. `endif` is not
  accepted as a switch closer by the engine — the extractor tolerates it.
- `return expr` — error 5 when no value was expected. Falling off
  `endcode`/`exitcode` when a value **was** expected is error 6.
- `exitcode` — return with no value.
- `passcode` — returns code 4 (“procedure not found”) from this
  procedure; see §4.
- `dumpglobal name` / `dumplocal name` — debug print.
- A statement that starts with an opcode id in `12000…16054` goes to the
  command dispatcher (field opcodes used as statements are the **set**
  forms). A function opcode (20xxx) as a statement is a syntax error.

Errors print a dialog (`FUN_0040b4d0`, string table) and abort the
current message; the game continues.

## 4. Procedures, messages, `passcode` (`FUN_004177f0`)

A **script record** is 78 bytes: `+0` last-in-chain flag, `+8` container,
`+16` file, `+20` token pointer, `+30` `me` (Pascal), `+46` kind label,
`+62` `target` (Pascal). A message runs against a **chain** of records:

| Send | Chain (first tried first) | `me` in each record |
|---|---|---|
| `sendtoactor` | actor script → **cast** script | actor name; cast name |
| `sendtoprop` | prop script → **shop** script | prop name; shop name (`target` = prop) |
| `sendtoscene` | scene script(s) → **set** script | scene index as text; set name (`target` = scene) |
| `sendtoflat` | flat script → **stage** script | flat name; stage name (`target` = flat) |
| `sendtobutton` | button → flat → stage | button; flat; stage (`target` = button) |
| `sendtoset` / `sendtostage` / `sendtoboot` / `sendtocast` / `sendtoshop` / `sendtopuppet` | one record | that object's name |

`sendtopuppet ("day1", …)` runs only the named PUP script container.

Lookup: `FUN_00417910` scans `code` headers in the record; a hit binds
params (too few args = error `0x1c`, too many = error 2) and runs the
body. Not found returns 4, and `passcode` also returns 4. On 4 the
chain **advances to the next record**. On the last record, 4 is
silently OK when the name is one of 31 **hook names**
(`FUN_00418b70`, table at `0x445af0`): `opencast openactor closecast
closeactor openflat openstage closeflat closestage endwalk endturn
endball endloop openshop openprop closeshop closeprop openpuppet
closepuppet menustate boot idle menuselect keydown keyrepeat mousedown
openset openfloor openscene closeset closefloor closescene`. Any other
missing procedure is error 4 (dialog). A `passcode` inside a nested user
call propagates up through the callers until a chain boundary.

The `*fx` variants (`sendtoactorfx`…) are the same with a result slot.
`sendtoactor(name, …)` needs an existing actor (`FUN_00427c90`), else
error.

## 5. Engine hooks and events

Main loop (`FUN_004246f0`) every iteration: **event 9** to the boot
record → `boot()` once (first tick), then **`idle()` every frame** while
no script error is latched. Boot's `idle` calls `forceupdate` — that is
what pumps walks, loops and the 20 Hz frame wait during normal play.

Input events are queued (16 max, `FUN_00435260`; classes: 2 mouse down,
4 mouse up, 8 key down, 0x10, 0x40, 0x80). Dispatch: mouse down →
`mousedown(<point int>)`; key → `keydown("<char>")` with 0x1c–0x1f
mapped to `"leftarrow"`, `"rightarrow"`, `"uparrow"`, `"downarrow"`;
key repeat → `keyrepeat("…")`; menu → `menuselect("<item>")`; WM_INITMENU
→ `menustate()`. Keys with Ctrl/Alt are not sent to scripts.

**Event 8** fires to both records when **no input event arrived for 20
ticks** (1/3 s) and then every iteration. For the SET it drives
`FUN_0040d660`: prefetch the next forward strip, then show the
**standing HQ still** (`frame0 + 5` of the forward walk from the current
pose, else of the right turn), then `FUN_00421d10` container cache. So
the HQ plate appears ≈333 ms after the last key/click, never while a key
repeats.

File hooks, in engine order:

| Opcode | Hooks run |
|---|---|
| `opensetfile` | `openset()` → `<scene>, openfloor()` → `"<scene>", openscene()`; spawn pose from SET header +48/+50/+52 |
| `closesetfile` | `closeset()` → `closefloor()` → `closescene()` |
| `currentscene ("strait"/"left"/"right"/"backwards")` | `closescene()` **first, unconditionally** (even if the move is rejected or a strip is running); the strip; then `openscene()` when the 5th plate lands (`FUN_0040dd90`) — for **turns too** |
| `currentscene ("scene xx")` | `closescene()`, jump, `openscene()` (no-op if already there) |
| `currentdir ("north"…)` | same close/open pair around the facing change |
| `openstagefile` | `openstage()` → `"<flat 0>", openflat()`; error `0xb` if a stage is already open |
| `closestagefile` | `closestage()` → `"<flat>", closeflat()` |
| `gotoflat` | `closeflat()` on the old flat → switch → `openflat()` |
| `opencastfile` | `"<cast>", opencast()` → `"<actor>", openactor()` for every actor of that cast (this is where `bird2…5`, `bounty2…5`, `horse2…3`, `kidgang2…5` are `actorinstance`d) |
| `closecastfile` | `closecast()` → `closeactor()` each |
| `openshopfile` | `"<shop>", openshop()` → `"<prop>", openprop()` each |
| `closeshopfile` | `closeshop()` → `closeprop()` each |
| `openpuppetfile` | `"<boot script>", openpuppet()`; `closepuppetfile` → `closepuppet()` |

`actorscript` / `propscript` / `puppetscript` (`FUN_00426e60`,
`FUN_004143d0`, `FUN_00430060`) are **authoring-tool no-ops** in the
runtime: they only clear `result()`. Cast libraries call them under
`optionkey()` (open the editor) and in default `setupactor` /
`putdownactor` / `endwalk`.

## 6. Timing

- Tick = `timeGetTime() * 3 / 50` → **60 Hz** (`FUN_00438210`).
- `delay (n)`: busy-wait n ticks (`FUN_00438240`), pumping messages.
- `framerate (n)`: clamp 0…60 into `DAT_004608ce`; the frame end waits
  until the tick advanced by n (boot 3 → 20 Hz game frames).
- `frame ()` = `DAT_00460898`, +1 per pump. `tick ()` = 60 Hz tick.
- `screentoblack / blacktoscreen (layer, n)`: n palette steps, one per
  tick (`FUN_0040b430`). `mixclut (from, to, lo, hi, amount)` blends
  palette entries `lo…hi` by `amount/255` and applies immediately.
  `blackscreen ()` fills the window black at once. `clut (name)` applies a
  named palette at once.
- `makeloop (kind, who, proc, n)`: kind `actor|prop|scene|flat`; **one
  loop per (kind, who)** — a new one replaces the old
  (`FUN_00410330` calls stoploop first); 32 slots. Each pump decrements
  `n`; at ≤0 the loop is **deleted** (one-shot) and
  `sendto<kind>("<who>", <proc>())` is compiled and run. `pauseloop`
  keeps a **nesting count** per loop (`true` +1, `false` −1, floor 0);
  `"all"` hits every loop of that kind. `stoploop (kind, "all")` clears
  the kind.
- `forceupdate ()` = one `FUN_0040fe00` pump: 16 walk jobs, 16 ball jobs,
  32 loop timers, then `FUN_0040d500` (frame counter, sprite draw, frame
  wait). `visualeffect (effect, n)` = redraw + **one pump** + the
  transition `effect` (`plain`, `wipeleft`…, `24001…24014`) over `n`
  ticks (clamped 1…1000).
- `puppetspeak` of a line with **no audio** waits `len(text)/2 + 60`
  ticks with the text drawn.

## 7. Dialogue (`puppet*`)

State: `DAT_00460992` puppet open, bevels `DAT_0045d2f0` (count, max 5,
260-byte records `{int id; Pascal label}`), `DAT_0045d2e8` lines spoken
since the last `puppetevent` (max 3 kept), `DAT_0045dd20` skip flag.

- `openpuppetfile (name)` (`FUN_0042f320`): error `0x2d` if one is open.
  Loads container 0 (lines table, 0x138 records at `+0x870`, count at
  `+0x86e`), container 1 (player-voice table; the PUP header flag `+0x20`
  is 0 in every Dust PUP so it never plays), container 2 (scripts),
  container 3 (11 layer tables). When `puppetgrab` is **true** the
  **Background layer (0) is not loaded** — the SET still shows behind the
  head. Resets bevels, spoken list and skip flag, then runs `openpuppet()`.
- `puppetclear ()`: bevel count = 0 (speech untouched).
- `puppetbevel (label, id)`: append (error `0x2e` past 5; id must be int).
- `puppetscramble ()`: if ≥2 bevels, swap two random slots `5 × count` times.
- `countbevels ()`: int.
- `puppetspeak (line)`: **one string argument** (a second argument is a
  syntax error — `puppetspeak ("jones.33", 101)` errors in the original).
  Looks the line up by **name or text** (`FUN_00430f60`). If the skip flag
  is set the line is skipped. Otherwise `FUN_00430890`: start the WAV on
  the voice channel, draw the subtitle only when `puppetparam (7)` is
  non-zero (and the line is not `idle 1…4`, not blank, not starting with
  `*`), animate mouth frames at 30 Hz (`tick/2`, capped at the line's
  frame count), and wait for the voice to finish. Only **Ctrl+Q / Ctrl+.**
  interrupt a line: voice halted **and the skip flag set**, so every
  following `puppetspeak` is skipped until the next `puppetevent`,
  `openpuppetfile`, or a face click (below). Mouse clicks during a line
  are queued and flushed at `puppetevent`.
- `puppetevent (n)` (`FUN_0042fab0` / `FUN_00431330`): int argument; `n
  < 0` waits forever, else returns **-2** after `n` ticks. Clears the
  skip flag, arrow cursor, flushes input, draws the five bevels
  (`FUN_00431040`: rects `top = (i+11)*24`, height 24, full 512 width —
  the 264…384 HUD band). Four idle timers use the **PUP header**: mins at
  `+0x83a` (4 ints), maxes at `+0x84a` (4 ints), in ticks; each timer
  fires at `min + random (max − min)` ticks and plays `idle 1…4` (line
  name), re-rolling after each play. A missing idle line never fires;
  `puppetparam (8)` non-zero disables all four. Loop until
  `FUN_00431680` returns: a click on a bevel returns its **id** (the
  bevel highlights; a player line named like the label would play if the
  PUP had player voice); a click **on the picture** (0…264) after at least
  one spoken line **replays the up-to-3 lines spoken since the last
  event**; **Ctrl+Q / Ctrl+.** returns **-1**; Ctrl+0…9 set `wavevolume`;
  Ctrl+T toggles the text flag. The spoken-lines list is cleared when
  `puppetevent` returns.
- `closepuppetfile ()`: `closepuppet()` hook, unload, arrow cursor, redraw.
- `puppetparam (i[, v])`: 1 `DAT_0046089c`, 2 (0x80), 3 text color 250,
  4 highlight color 251, 5 font 888, 6 size 12, 7 **subtitles (default
  0)**, 8 idle-disable (default 0). `puppetsubtitle (text)` draws the
  40 px black bar (`y 224…264`) with `text`, wrapped once at 496 px.
- `puppetgrab (bool)` → `DAT_004608ac` (see `openpuppetfile`).
- `puppetvisible`, `puppetbase`: show/hide, base rect.

## 8. Sound (`FUN_0040207x…`)

Four mixer channels: 0 voice, 1 and 2 effects, 3 theme. A clip record
(0x68 bytes) carries its SND **container index** at `+0x39`; that number
is the "priority" the effect channels compare. `sounddone ()` = both fx
channels idle; `voicedone ()` = channel 0 idle. Names come back as
`"None"` when idle (compare is case-insensitive).

- `voicesound (name)`: always replaces channel 0 (same channel as
  `puppetspeak` audio and `playmovie` group A).
- `singlesound (name)`: pick the effect channel with the lower index; play
  only if `clip.index > that channel's index` and `≠` the other channel's
  index. A free channel is 0, so a free channel always accepts. **The same
  clip already playing is not restarted**, and a clip lower than both
  busy channels is dropped.
- `dualsound` = `singlesound`. `multiplesound`: `≥` instead of `>` (a
  playing copy of the same clip **is** restarted). `bothsound`: always
  replaces the lower channel.
- `haltsound ()` stops channels 1 **and** 2 (one-shots included);
  `halttheme` channel 3; `haltvoice` channel 0.
- `playtheme (name)`: channel 3. `themevol (track, 0…255)`: sets the volume
  of **every clip of that SND file** (`FUN_00403840`) and applies to
  playing channels — this is how scripts duck `saloonsep.snd` by distance
  and drop beds to 32 during talk. `soundvol (name, 0…255)` per clip;
  `soundloop (name, bool)` per clip. `wavevolume (0…9)` is the master.
- `currentvoice ()`, `currentsound ()`, `currenttheme ([1|2])`: playing
  clip name or `"None"`; `currenttheme (2)` returns the theme's **track
  file name**.
- `opentrackfile` appends a track (0x26 records, `DAT_004608f8`);
  `closetrackfile (name)` removes it and its clips.

## 9. Pointer, hit test, cursor

- `mouse ()`: packed point in window coordinates (the 512×384 stage).
  `button ()` / `stilldown ()`: bool.
- `hittest (point)` (`FUN_00405f50`): sprites first, **topmost drawn
  first**, with a per-pixel test (Z-buffer aware for world sprites) —
  actor → `result "actor"`, prop → `"prop"`; else inside the SET plate
  (512×264) → `"scene"` and the current scene name; else inside the stage
  → `"button"` + name or `"flat"` + current flat; else `"none"`.
- `pointinset` / `pointinstage` / `pointinactor` / `pointinprop` /
  `pointinbutton`: bool.
- `cursor ("arrow"|"watch"|<name>)`: system arrow, busy cursor, or the
  `CURS.<NAME>` resource. `hidecursor` / `showcursor` count nesting.

## 10. Strings and numbers (`FUN_00407xxx`)

- `random (n)`: `(rand15 * n) / 0x7fff + 1` → **1…n** (`FUN_0040b060`).
- `numtostring (int)`; `stringtonum (s)`: `sscanf ("%ld")` — leading
  whitespace and a sign are fine, trailing junk is ignored, anything else
  is 0.
- `stringlength (s)`; `substring (s, sub)`: 1-based index of the first
  case-insensitive match, **-1** when missing or `sub` is empty.
- `findword (s, sep, n)` (`FUN_004071c0`): 1-based word `n`. Empty `sep`
  = the n-th character (or `""`). Otherwise scan positions `1 … len −
  seplen + 1`; a separator match ends a word; **reaching the last position
  also ends the word at that position**, so an unterminated final word
  loses its last character (`findword ("abc", " ", 1)` = `"ab"`). Empty
  words count. Past the end = `""`. Dust's lists always carry a trailing
  separator (see `putword`).
- `putword (s, sep, n, w)` (`FUN_004074a0`): empty `sep` inserts `w` at
  character `n` (append when `n = len + 1`, else `""` out of range). With
  a separator it **first appends `sep` to `s`**, then replaces word `n`
  with `w`; if there is no word `n` the result is `""`.
- `sqrt (int)`: integer square root.

## 11. Variables by name, fields, misc

- `variable (name)` / `variable (name, value)` (`FUN_004070e0` /
  `FUN_00433e40`): read/write **the variable whose name is the string**,
  locals then globals, error 9 if undeclared. The bounty/kid-gang casts
  keep per-actor state in `global bounty1…5` / `kidgang1…5` this way.
- `path (n)` / `path (n, s)`: slots 1…8. `findfile (name)` tries `path(1) @
  name … path(8) @ name`.
- `currentdir ()`: `"east"|"south"|"west"|"north"` from look-deg 0/64/128/192,
  `"moving"` while a filmstrip is running, `"turning"` for a non-cardinal
  deg, `"nowhere"` with no SET. `currentscene ()`: scene name or `"None"`.
- `actionframe (1|2)`: bool from `DAT_004608d2` bits (set by movie
  command streams).
- `questiondialog (text)`: bool from a Yes/No box. `notedialog (text)`.
- `quit ()`: sets the exit flag; the main loop leaves after this iteration.
- `error ()`: script error `0x2f` (dialog), aborts the message.
- `message (s)`: debug caption. `keyaborts (bool)`, `menuvisible (bool)`.
- `drawstring (text, point, font, size)`: GDI text at `point`.
- `actorxyz`, `actordeg`, `actorstar`, `walktostar`, `turntodeg`,
  `iswalk`: see findings.md §7a/§7b. `actorpose (a, pose)` looks the pose
  up in the CST (error 10 if unknown), resets the frame counter.
- Field opcodes read with no set argument return the value; the set form
  (`FUN_00431dd0` side) returns nothing.

## 12. Save files (`savegame` / `opengame`, `FUN_0042d870` / `FUN_0042e050`)

`savegame (title)` refuses while a puppet is open (`0x2d`), asks for a
path with the `*.rtd` filter, then writes a DreamFactory container file
(type `RTDO`, creator `DFRT`) whose containers are, in order:

1. Open-file list (one 0x104 record per open SET/CST/PRP/FLT/PUP/SND
   file: kind + Pascal name), then the 8 `path` slots, current
   sound/theme names, and the 256-entry palette.
2. Engine state block `DAT_004607a0` (0x21e bytes: boot record, pose,
   framerate, puppet params, …).
3. Actor table (`DAT_004608d8`, 0xa4 per actor) and cast table (0x1c per cast).
4. Prop table (0x9e per prop) and shop table (0x1c per shop).
5. Track table (0x26 per SND) plus each track's three clip arrays (0x68 per clip).
6. Globals table (`DAT_00460bd8`) and its string heap.
7. Walk state (0x540), ball state (0x300), loop state (0x520), and each
   active walk job's path container.

`opengame` reads the same containers back. No original `.rtd` ships in
this install; the remake keeps its JSON save.

## 13. Corrections to earlier notes

- `delay (n)` is proven 60 Hz ticks (§6), not inferred.
- `puppetevent` idle spacing is authored per PUP in the header (§7); the
  remake's clip-length heuristic was a guess.
- `closescene` / `openscene` run around **every** walk and turn, and
  `closescene` runs even when the move is rejected.
- `openactor` (clones), `closestage` (credits theme, sundial track),
  `openstage` before `openflat`, `openshop` before `openprop`, `closeset`
  before `closescene` — engine order, see §5.
- `variable` is name-based, not an actor field. `actorscript` /
  `propscript` / `puppetscript` are no-ops.
- Subtitles are **off** by default (`puppetparam 7`), toggled by the
  score-flat check box.
- `findword` drops the last character of an unterminated final word;
  `putword` appends a separator.
- `themevol` / `singlesound` channel rules were unimplemented (§8).
