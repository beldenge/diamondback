# Findings from Dust’s executables

This is the record of what we pulled out of the **original programs**
(`DF.EXE`, `MOVPLAY.EXE`, `CHECKERS.DLL`, `DUST.EXE`), and what that
lets a remake actually *do*. Asset/script decoding stays in
[`dfextract/docs/findings.md`](../../dfextract/docs/findings.md). Verb
meanings for an agent: [`handbook.md`](handbook.md).

Nobody published a working parse of Dust’s opcode table from `DF.EXE`
before this. mrxstudios showed the ASCII names were in the file.
DFET ships a **Titanic 4.0** name list. DreamCatcher patches a
**different** `DF.EXE` at runtime and did not publish the table. This
document is the Dust-from-binary writeup.

Reproduce: `python -m dustdecompile` from the repo root, with
`sources/dust.dbgl/` and (for call sites) `dfextract/out/`.

---

## 1. What “working functionality” means here

We did **not** transcribe 1996 MSVC C into TypeScript. We recovered
the **contracts** the engine already exposes, so a remake can implement
the same behaviour:

| Recovered | You can now implement without guessing |
|---|---|
| Dust opcode dictionary (307 names, ids matching script tokens) | A script VM that names every token Dust actually uses |
| VM semantics from a Ghidra decompile of `.text` ([vm.md](vm.md)) | Expression precedence, statements, `passcode` chains, hooks, timing, dialogue, mixer, save layout |
| Id bands (`4xxx` language … `20xxx` returns a value) | Which names are statements vs functions vs fields |
| Dialogue protocol | `puppetclear` → `puppetbevel(label, id)*` → `arg = puppetevent(-1)` |
| Click protocol | boot `hittest` → `result()` → `sendto*` ; `pointx`/`pointy` in 512×264 |
| Object messages | `sendtoactor("JENIX", …)` runs a call *on* that actor |
| Virtual FS | `path(n, "dust:data:")` slots |
| Plugin ABI | `LoadLibrary` + one export `PlugProc` + verb string (`checkmove`) |
| Checkers AI hook | `pluginfx("checkmove", board, lookahead, mode)` → comma-separated moves |
| Travel / movies | `spotmovie` / `gototown` / `gotointerior` / `advanceday` are **game scripts** in `new.flt`, wrapping `playmovie` / `opensetfile` |
| CST/PRP world → still X | Focal 310, tile 256, lens setback 64 (§7a). O7 N Leroy still-x 354. Engine Y is the same `0x40dcd0`; play does not use it for placement |

Scripts remain the storyboard (what Jenix says). The EXEs + this parse
are the rulebook (what those verbs *do*).

---

## 2. Prior work (and what it did not do)

| Source | What it gave us | What it did not |
|---|---|---|
| [mrxstudios 2021-03-05](https://mrxstudios.home.blog/2021/03/05/reverse-engineering-dust-uncovering-game-scripts/) | 8-byte tokens, Pascal strings, *idea* that names live in `DF.EXE`, Jenix gold listing | No table layout, no id↔name dump from the EXE |
| [mrxstudios 2022-04-25](https://mrxstudios.home.blog/2022/04/25/reverse-engineering-dust-game-locations-and-map-layout/) | SET grid / waypoints / 6-frame walks | Engine VM |
| DFET (M3tox), DreamFactory **4.0** | Pretty-printer + 351 Titanic names | Dust’s own names (22 ids differ). No PE parse |
| [DreamCatcher](https://github.com/JamesK89/DreamCatcher) (JamesK89) | Win10 loader via DLL inject + Ghidra | Published `DF.EXE` SHA-1 `97462977fc15277ba186a64baffe978d658413a9` — **not this install**. No opcode table |
| Bill Appleton (via DreamCatcher / handbook) | Dust is **pure C**; scenes have a depth buffer | No source |

dfextract prints scripts using DFET’s 4.0 names. Until this parse, a
remake agent would implement `currentview`, `fileexists`, `makecricket`,
`sendtopainting` — Titanic words for Dust ids.

---

## 3. Which files are the engine

Only Cyberflix code. Not `WINDOWS\`, Acrobat, or InstallShield.

### Hashes (this install)

| File | Role | Kind | Size | SHA-1 | SHA-256 |
|---|---|---|---|---|---|
| `WIN31/DUST/DF.EXE` | Runtime | PE32 | 346624 | `54558d7b47b627e9770932be0afa9efd2fadce00` | `d8a22e266c7307e550bd7284d2743947765303348a6b33cda48534c467aa95fe` |
| `WIN31/DUST/MOVPLAY.EXE` | Movie player | PE32 | 168448 | `f6560e384c0ea910b6e373b224829806b1047fad` | `10e4955ab85b6d1d3e998525e4159f5334c616221cf84e956e1fe0f77a9484c9` |
| `WIN31/DUST/PLUGINS/CHECKERS.DLL` | Checkers plugin | PE32 | 32256 | `9a1bb62b452fc6214d56c255ba254fc08a6216e7` | `0b26dd9a9169dd9b734d30934e452611ad7664a2e0978b9a20302eddc0c33273` |
| `WIN31/DUST/DUST.EXE` | Installed launcher | NE16 | 69632 | `96a4ea3b9881d5cbf771108d445e81a86389cdca` | `02fa664baa21c2fbac34b1a2d2b829edd3c70f2e6ed7e481e402cc4e13dd6434` |
| `DUSTCD/DUST.EXE` | CD launcher | NE16 | 69632 | `12a55c1bfce0a2422748bb3f5f0e540045b6fec7` | `cde322effd1c98142b04d71564346205875cf180659bdf14b2182eb1bfff1ef4` |
| `DUSTCD/INSTALL/ALT31/CHECKERS.DLL` | 386 checkers | PE32 | 32256 | `af665602ffef3d0b89c74a63d07d52bc99ad42f0` | `ddf77536d8f1d969ce4960dd4fa1c1e84514c7e7b64cf8926427f63c7df4a23a` |

The two `DUST.EXE` copies and the two `CHECKERS.DLL` copies are **not**
byte-identical. Hash before comparing notes with anyone else.

### `DF.EXE` (the VM)

- PE32 (machine `0x14C`), **not** 16-bit. Runs as Win32s on Windows 3.1.
- Linker **3.0**, timestamp **1996-02-21 19:22:28 UTC**, “Microsoft Visual C++” string, no Rich header.
- Image base `0x400000`, OEP RVA `0x3BDE0`.
- `.text` virtual size **271579** (~265 KiB of code). `.data` virtual 118572, **initialized raw only 16384** (rest BSS). Opcode names and the table live in that initialized `.data`.
- **No exports.** Plugins are loaded with `LoadLibraryA` / `GetProcAddress`.
- Imports: `WINMM` (waveOut* + `timeGetTime` + `sndPlaySoundA`), `KERNEL32` (files, heap, `LoadLibraryA`), `USER32` (window/input/menu), `GDI32` (BitBlt, palette, font), `comdlg32` (open/save dialogs).
- Palette APIs (`CreatePalette`, `AnimatePalette`, `SetSystemPaletteUse`) match 8-bit stills. `waveOut*` match streamed ADPCM, not just `sndPlaySound`. `GetOpenFileNameA` / `GetSaveFileNameA` match `opengame` / `savegame`.

### `MOVPLAY.EXE`

- PE32, linker **2.55**, timestamp **1995-08-21 21:39:49 UTC**.
- `.text` virtual size **109710**. Separate process/tool from `DF.EXE`.
- Same Win32 surface (KERNEL/USER/GDI/WINMM/comdlg32), no save dialog.
- **ASCII verbs in the image** (these are the movie player’s own command names, not the Dust script table): `playmovie`, `playtheme`, `voicesound`, `singlesound`, `dualsound`, `multiplesound`, `soundloop`, `delay`, `actionframe`, `framerate`, `machinespeed`.
- MOVPLAY also contains the **same 307-name opcode table** as `DF.EXE`. The standalone player is a DF subset, not a separate movie format.
- Still holds, group-A/group-B mixer, and the single framebuffer are **solved** (see §7). dfextract `--video` encodes at 60 fps from those rules.

### `CHECKERS.DLL`

- PE32, linker **2.55**, image base `0x10000000`.
- Installed build timestamp **1995-07-25 05:07:38 UTC**, export name **`Checkers.486.release.dll`**. ALT31 build is **~1.5 minutes earlier**, export name **`Checkers.386.release.dll`**. Same size, same `PlugProc` RVA `0x22d0`, different bytes (CPU-tuned).
- `.text` virtual size **9522**. **KERNEL32 only** — no GDI, no USER, no WINMM. The DLL is compute, not drawing.
- One export: **`PlugProc` ordinal 1 @ RVA `0x22d0`** (VA `0x100022d0`).
- Verb **`checkmove`** is a C string at `0x10005009`. Play writes the Pascal length at `0x10005008` during opcode 0 (register).

**PlugProc ABI** (cdecl, returns `int16` error; `0` = ok):

```
short PlugProc(PluginMsg *msg, EngineCallback cb);
```

`cb` is stored at `0x10004184` and used for engine memcpy / atoi / itoa / strcat (opcodes `0x1f4`, `0x1fe`, `0x1ff`, `0x200`, `0x201`). Type tags: `0x3e8` none/int, `0x3e9` int, `0x3ea` string.

`msg->op` at `+0`:

| op | Meaning |
|---|---|
| 0 | Register: return Pascal `"checkmove"`, type `0x3ea` |
| 1 | Shutdown |
| 2 | Invoke. Args: string board `+4`, int lookahead `+0xa`, int mode `+0x10`. Result string written back over the board pointer |

**`checkmove` (`FUN_10001000`)** — play copy is [`src/play/checkers.ts`](../../src/play/checkers.ts).

- Skip the Pascal length byte, then parse 64 cells: spaces skipped; `'-'` plus one digit is −1/−2; else one digit. Stored as `int16[8][8]` at `.bss` `0x10004000`, index `row*8+col`.
- Mode `0` = him (positive, maximise, init score −999). Mode `1` = me (negative, minimise, init 999).
- Generate jumps (`FUN_10001b30`) first; only if that list is empty, steps (`FUN_100019f0`). Scan row 0..7, col 0..7, codes 1–4 then 5–8. `goodjump` / `goodstep` are `FUN_10001e60` / `FUN_10001c70` (same tests as the PRP scripts).
- Lookahead `0`: return the first list entry (and the static eval). Depth `>0`: full minimax, **no alpha-beta**. Equal scores keep the earlier move. Recurse with the other side and `depth-1`. A jump applies its **first** continuation chain (same first-match rule) before the child node.
- Eval: each cell adds `piece * 100`, plus a four-diagonal neighbour term (empty ±1, enemy `|piece|`, friend 0). Scores are 16-bit.
- Return string: `numtostring(row) @ numtostring(col) @ numtostring(code)` then `","`. Jump codes `<=4` then `FUN_100015d0` appends the continuation chain the same way. Empty string = no moves. `findword(list, ",", n)` / `findword(word, "", 3)` is how scripts split it.
- Codes match `decodemove`: `1`=(−2,+2), `2`=(+2,+2), `3`=(+2,−2), `4`=(−2,−2), `5`=(−1,+1), `6`=(+1,+1), `7`=(+1,−1), `8`=(−1,−1).

Legal step/jump tests also exist **in scripts** (`goodmove`, `goodjump`). The DLL is the search / jump generator / encoding, not the only copy of the rules.

Play trap (not this DLL): `automove` holds the comma list in `global move`; `makemove (move, person)` then `move = decodemove (…)` is the **parameter**. `setVar` must write that local (`src/vm/runtime.ts`). Preferring the global made `delrow` the packed triple (`216`) and `writeboard` padded `mainboard` off the 8×8 — Bolivar’s man vanished and jumps never captured. Overlay / click patches do not fix that. Book: [`src/play/README.md`](../../src/play/README.md) § Store checkers.

### `DUST.EXE`

- Win16 **NE**, 17 segments, target OS 2 (Windows), imports `KERNEL GDI USER SHELL`.
- Launcher only. Do not decompile this for VM semantics.

---

## 4. Opcode table — how we recovered it

mrxstudios noted `puppetspeak` ASCII at file offset **277700**. That is
the **string**, not the table. The string’s VA on this build is
`0x004460C4` (initialized `.data`: VA `0x45000`, raw `273408` →
`0x45000 + (277700 - 273408)`).

The table is a pointer to that string plus the token id, packed.

### Layout (proven)

```
#pragma pack(2)   /* inferred from packing; pointers are often unaligned */
struct OpcodeRec {
    char *name;          /* 4 bytes, VA of a C string in .data */
    unsigned short id;   /* 2 bytes, matches script token cmd */
};                       /* 6 bytes */
```

- **Groups** of these records. The **first** record of a group is
  4-byte aligned (so the first pointer is naturally aligned).
- Following records are at **+6** (so later pointers are *unaligned*
  in the file — MSVC still stores a 32-bit VA).
- A group ends with `{ NULL, 0 }`.
- Then optional padding to 4-byte align the next group.
- Groups are roughly alphabetical (`&` … `|`, then `actor*`, …, `wipeup`).
- File range on this `DF.EXE`: **279984 … 281890** (last record start).
- **307** names, **307** unique names, **305** unique ids.
- Three operator names are single **Mac Roman** glyphs (the table was authored
  on a Mac): `0xAD` ≠ (id 8009), `0xB2` ≤ (8013), `0xB3` ≥ (8012). The scanner
  prints them as `!=`, `<=`, `>=`. Missing them was why earlier runs found 304.

Two ids have two spellings (both in Dust, not a Titanic mismatch):

| Id | Names in `DF.EXE` |
|---|---|
| 8005 | `&` and `and` |
| 8006 | `|` and `or` |

`puppetspeak` record: file **281240**, id **12043**, name VA `0x004460C4`.

Script tokens are still 8 bytes `{u16 cmd, u32 info, u16 unknown}` as in
[`dfextract/docs/scripts.md`](../../dfextract/docs/scripts.md). The `cmd`
field **is** this `id`. Special cmds 3–6 (STRING/INTEGER/VARIABLE/BREAK)
are not in the name table.

### Id bands (observed, not a documented enum)

`family = (id / 4000) * 4000`:

| Band | Count | Role in scripts |
|---|---|---|
| `4xxx` language | 29 | `code`/`if`/`switch`/`return`/`true`/`me`/`passcode`… sequential 4001–4029 |
| `8xxx` operator | 15 | `+ - * / & | @ = != > < >= <=` (and `and`/`or`) |
| `12xxx` command | 88 | statements: `puppetspeak`, `playmovie`, `sendto*`, `delay` |
| `16xxx` field | 53 | get/set: `path`, `actorstar`, `currentscene`, `framerate` |
| `20xxx` function | 108 | returns a value: `pluginfx`, `puppetevent`, `pointx`, `hittest` |
| `24xxx` transition | 14 | `plain`, `wipe*`, `scroll*`, `barndoor*` |

`plugin` is 12027 (command). `pluginfx` is 20098 (function). That is why
scripts write `plugin("writestats", …)` for side effect and
`move = pluginfx("checkmove", …)` for a result.

### Recovery algorithm (what the tool does)

1. Parse PE32; map RVAs through sections.
2. Scan **non-executable** initialized sections only (`.data`, not `.text`).
3. At every 4-aligned offset, try a record: pointer must be a C-string
   **start** (previous byte is `NUL`), name opcode-like (lowercase
   identifier length ≥ 2, or an operator), id in `1` or `4000…25000`.
4. Walk packed +6 until `{0,0}` or a bad record.
5. Drop CRT leftovers (`frexp`, `y1`, …) if a run ever looks like libc.
6. Reject `id == 1` unless the name is a single space (DFET used id 1
   for `" "`; this Dust table does not include it).

### False paths (do not repeat)

- Treating the engine as Win16 because the *launcher* is NE.
- 8-byte `{char*, u16, pad}` or 10/12-byte `{char*, id, handler}` —
  the extra “handler” bytes were the **next** packed pointer overlapping.
- Scanning `.text` for the same 6-byte pattern. Packed x86 produces
  junk hits (we saw `name='o'` id `5515` twice).
- Taking DFET 4.0 names as Dust’s names.
- Treating `spotmovie` / `gototown` / `gotointerior` as opcodes.
  They are **not** in `DF.EXE`. They are `code` procedures in `new.flt`.

---

## 5. Dust names vs Titanic 4.0 (dfextract `.txt`)

Same token id, different ASCII in this `DF.EXE` vs DFET’s table.
**When you read a pretty-printed script, apply this map.**

| Id | Name in `.txt` (Titanic) | Name in `DF.EXE` (Dust) |
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

Every other printed name we checked matches Dust’s table. Dust has **no**
ids that DFET lacks; DFET’s extras are Titanic-only (`net*`, `cricket*`
as names, `painting*`, …).

Dangerous ones for a remake: `currentview` **is** facing (`currentdir`);
`actorexists` in a `.txt` is **not** an exists test, it is Dust
`scenerow`; `currentcd` in a `.txt` is Dust `actorhitbox`.

---

## 6. Functionality recovered from scripts + the table

The table gives names. **Behaviour** comes from how Dust’s own scripts
call them (BOOT, `new.flt`, PUP, SET). Full writeup with examples:
[`handbook.md`](handbook.md). Summary of protocols that are solid enough
to implement:

### Dialogue (proven in PUP/_JENIX, PUP/_JONES)

```
puppetclear ()
puppetbevel ("Yes, here is the money.", 101)
puppetbevel ("No.", 102)
arg = puppetevent (-1)
switch arg
case -1    → player dismissed (exitcode)
case 101   → that choice
case 55555 → inventory-hand bevel (with addhandbevel)
```

`puppetbevel` does **not** wait. `puppetevent` **does**. `-1` is what
Dust always passes in; its meaning inside `DF.EXE` is unproven (allow
dismiss / sentinel). Do not invent other arguments.

`puppetspeak("jenix.5")` is almost always one string (line id →
`PUP/_JENIX/AUDIO`). Scripts never poll `currentvoice()` after it, unlike
`voicesound`. Blocking is **proven**: `FUN_00430890` waits for the clip.

One Jones site really does pass two arguments
(`puppetspeak ("jones.33", 101)`, `PUP/_JONES/day1`). The handler parses
**one** expression and the dispatcher then demands `)`, so the engine
raises script error 2 there — an authored-data bug that fires when
`actorvalue ("laurel") > 0`, not a second calling form. The remake speaks
the line and ignores the extra argument.

### Clicks and the 512-pixel plate (proven in BOOT)

Boot `mousedown (thepoint)`:

1. If a puppet is open, close it.
2. `thename = hittest(thepoint)` then `switch result()`:
   `actor` / `prop` / `button` / `scene` / `flat` / `none`.
3. On a kind, `sendto<kind>(thename, mousedown(thepoint))`.
4. On `none`: `pointy < 0` → up (walk); `pointx < 0` → left;
   `pointx > 512` → right. Clicks **off the still** are navigation.

SET hotspots use exclusive pixel tests, e.g. APOTH Scene A2:

```
pointx(arg) > 228 & pointy(arg) > 127 & pointx(arg) < 299 & pointy(arg) < 231
```

Outdoor stills are 512×264. `pointinset(thepoint)` is “on the plate.”

`setcursor` / `idle` use the same hit-test to pick cursor art
(`arrow`, `touch`, `watch`, `sight`, `gostrait`, `goleft`, `goright`).
The bitmaps themselves are **not** in the scripts.

### `sendto*` is message-send (proven)

`sendtostage(spotmovie("apothpig.mov"))` does **not** mean “filename =
spotmovie.” It means: evaluate `spotmovie(...)` **in the stage
(new.flt) context**.

`sendtoactor("JENIX", putdownactor())` — first arg is a short actor
name (`JENIX`, `watson`), not `jenix.pup`. `putdownactor` /
`setupactor` / `resetactor` are **CST user procedures**, not opcodes.

`target` (id 4027) is the object a `sendto*` is addressing (INVEN
`propview(target)`).

### Virtual paths (proven in BOOT)

```
path(1, path(1) @ "local:")
path(2, "dust:data:")
path(3, "dust:movies:")
path(4, "dust:puppets:")
path(5, "dust:under:")
path(8, "dust:inven:")
```

`@` (8007) is string concat. Boot refuses to run if
`findfile("town.set")` is false (printed `fileexists` in `.txt`).
A browser remake maps these slots to `dfextract/out/`.

### Engine hooks (string-named `code` blocks)

The VM looks up procedures by name. If a file defines one, Dust calls it:

| Hook | Who defines it | When |
|---|---|---|
| `boot` | BOOTFILE | Startup |
| `keydown` / `keyrepeat` | boot + SET | Keys. arg is `"uparrow"` / `"leftarrow"` / `"rightarrow"` after boot remap |
| `mousedown` / `setcursor` / `idle` | boot + SET + PRP | Pointer |
| `openset` / `closeset` | SET | Location load/unload |
| `offerobject` | SET / FLT | Use-item; often empty |
| `runyoself` | almost every PUP | Conversation entry |
| `menuselect` | boot | Menu string (`quit`, `volume 3`, …) |

`exitcode` returns from the current `code` block. `passcode` (inferred)
means “I did not handle this event; let the default continue.” SET
mousedown: handle pig → `exitcode`; else `passcode`.

### Game library — `new.flt` (not the EXE)

Boot: `openstagefile("new.flt")`. That FLT is Dust’s standard library.
Extractor dump: `dfextract/out/FLT/_NEW/setcursor _arg_.txt` (several
`code` blocks in one file).

| Procedure | What it actually does |
|---|---|
| `spotmovie(name)` | `premovie` fade → **`playmovie(name)`** → `postmovie` fade to set or puppet |
| `gotointerior(set)` | Remember `townscene` if on town, then `gotospecial` |
| `gototown(dir)` | `nite.set` if `clock=3` else `town.set`, restore `townscene` |
| `gotospecial(set, scene, dir)` | Fade, `closesetfile`, `opensetfile`, optional scene/facing, fade up |
| `advanceday()` | Advance `clock`, or `day` when clock was 3; play `d1nd2m` / `d2md2a` / … ; `initall`; day-1 cash **5** (999 if `debugging`) |
| `initall(name, file)` | Stop loops/walks, switch SET, re-init `gang` + `inven` |
| `canadvance()` | Sleep/advance gates (day-2 gun/boots/bullets, day-3 ring+pages, later mask+book+flute) |

`playmovie` / `opensetfile` / `closesetfile` **are** `DF.EXE` opcodes.
Travel and inspect-movies are script on top.

Boot’s first `sendtostage(advanceday())` after `day=1; clock=2; phase=1`
is what forces the real start slot (library sets day-1 clock to **3**).

`addinven` lives in `PRP/_INVEN`, not `new.flt`. Boot gives `helpbut`
at startup.

### Voice vs puppet speech (proven contrast)

`voicesound("bol.102")` is **async**. Scripts wait with
`while currentvoice() != "none"`. Checkers banter uses this.
`puppetspeak` is never waited that way.

### Time

`day`, `clock` (1/2/3), `phase` are globals. Clock does **not** tick
in real time. `advanceday` and scripted events advance it — same rule
the remake already uses.

`framerate(3)` at boot is 3 ticks of the 60 Hz counter per display
pump (`0x40e1d2`) → **20 Hz**. Not 3 fps. SET walks are 5 plates at
that rate (`0x40dd90` inc).

`delay(n)`: used (30 after fades, 45 in checkers). Unit unknown.
Inferred blocking.

### Save

`savegame("Dust 0.3")` on quit if the player agrees. `opengame` exists
in the table. **File layout unknown.** `comdlg32` open/save is how the
EXE asks for a path. `dumpglobal` prints a global (checkers debug list).

---

## 7. MOV timing (recovered from `MOVPLAY.EXE`)

Dust v1 `.MOV` reels are **not** a constant 14 fps. That number was
2467 stills / ~178 s wall-clock for the three intros. Local pacing was
wrong (saloon run too slow) because every still got the same duration.

### Tick clock (proven in `MOVPLAY` and `DF.EXE`)

Both EXEs contain the same sequence:

```
call  timeGetTime
lea   eax, [eax + eax*2]   ; * 3
mov   ecx, 50
div   ecx                  ; tick = ms * 3 / 50
```

At the `3` that matches boot `framerate (3)` this is **60 Hz**
(one tick = 50/3 ms ≈ 16.67 ms). The `3` is an immediate in the binary,
not read from the script at this site.

### Frame table (proven)

Play loop at `MOVPLAY` VA `0x40BCF7`:

```
lea eax, [eax + eax*4]
shl eax, 4                      ; * 80
lea esi, [eax + header + 0x8C2] ; frame i
mov ecx, 20
rep movsd                       ; copy 80-byte record
```

- Table origin **2242** (`0x8C2`).
- Record size **80** bytes.
- Count is `u16` at header **+24**. `2242 + count*80` equals the
  scene-header container size on INTRO / INTRO2 / INTRO3.
- Container index of the still is `u16` at record **+28**, **relative
  to the scene header’s container index**.
- Hold: `max(dword header+0x26, dword record+2)` ticks, then
  `jle` so a zero extra uses the scene default.

Each reel is one or more **scene headers** (container 0, plus later
blocks that start `00 00 01 00`, are not audio, and have 264×512 or
384×512 at +34). Audio clips for a scene sit immediately after its
header. `u16` at +26 and +28 sum to that scene’s clip count
(INTRO scene 0: 3+5=8 clips in containers 1–8, stills from 9).

### Measured (this install)

| Reel | Stills | Ticks | Seconds | Avg fps | Audio sum |
|---|---|---|---|---|---|
| INTRO | 638 | 2529 | 42.15 | 15.1 | 75.4 s (overlaps) |
| INTRO2 | 354 | 1116 | 18.60 | 19.0 | 28.5 s |
| INTRO3 | 1475 | 6078 | 101.30 | 14.6 | 106.7 s |
| **three intros** | 2467 | | **162.1** | | |
| SALUP (stairs) | 30 | 104 | 1.73 | 17.3 | 0 |
| D2MD2A | 199 | 1653 | 27.55 | 7.2 | 38.6 s |

Old `--video` used 14 fps → 176 s for the three intros. Engine ticks
give **162 s**. The leftover gap vs a remembered “≈2:58” is fades /
`clut("black")` around `playmovie`, and memory. Stairs at 1.7 s matches
“saloon/stairs were too slow at 14 fps.”

### Audio mixer (proven)

One `waveOut` PCM device (open via register-indirect IAT at `0x40EF62`,
write at `0x40F3D1`). Software mix; `sndPlaySoundA` is imported and unused
on this path.

Scene load (`0x40B933`) reads the header pointer at `[0x41E8D4]`:

- `u16 header+0x1A` = **group A** count (voice slots). Allocates
  `n_a * 104` bytes at `[0x41E8F4]`. Container `scene+1 .. scene+n_a`.
- `u16 header+0x1C` = **group B** count (theme). Allocates
  `n_b * 104` bytes at `[0x41E854]`. Containers after A.
  If `n_b == 0`, the previous B playlist **keeps playing** (`je 0x40BBA3`).
- `u16 header+0x34` + table at **`+0x83E`**: 1-based indices into B,
  copied into a linked playlist (`next` at object `+0x55`). Sequential
  theme, one channel. `0x40FA90` submits the head every frame (mixer
  mode 3). INTRO scene 0 playlist
  `(1,4,2,5,4,3,4,5,4,4,5,4,5,4,4,5,4,5)` into the five B clips.

Group A is **not** started at scene load. The play loop calls
`0x40C1A0(slot)` → `0x40FB60` when the current 80-byte record’s
**`u16 +32` is 1-based and non-zero**. Same slot again **restarts**
that object (INTRO2 A2 is retriggered many times ~9 ticks apart).
Different A slots overlap.

**rec+0x1A bit 0 (proven in `DF.EXE` and `MOVPLAY.EXE`)** — after
`start_A` and the rec+0 command pass, `test byte [esp+0x56], 1` then
`call 0x4026F0` / `0x40FA00`. That function busy-waits
`GetMessage`/`mix_go` until mixer channel 0 (`obj+0x39` at
`[0x448F19]` / `[0x431401]`) is idle (`mix_poll` head==tail). Then the
hold spin. If the wait overruns the rec’s hold, the deadline is already
past and the playhead advances immediately. `dog1.mov` sets this on recs
2 and 4 (the still after each A1 stamp): growl 1 finishes on the first
close still, then rec 3 stamps A1 again. Two full growls, two mouth
pairs, one 59-tick table. Not a remake double-pass. After the last
WAVEHDR `WOM_DONE`s, queued count `[0x43131c]` is 0 (`0x40EE46`). The
next A start’s `waveOutWrite` does Pause/Write/Restart (`0x40F3B4`).
`dwBufferLength` is **0x4000** (`0x40F069`), device 22050 Hz 8-bit —
one header is 0x4000/22050 ≈ 0.74 s. That empty-device write is the
pause between dog1’s two growls (the 0x200/0x400/0x800 values at
`0x40F5D6` are mix grains, not the waveOut header). `dog2.mov` rec 5
is the same wait after its single A1. 71 reels in this install use the
bit (often last stills of day-change cuts). INTRO2 A2 retriggers do
**not**.

A new scene can fire its first line while
the previous scene’s line is still playing (INTRO `clip_325` vs
`clip_423`); the extract **holds** that new cue until the previous
line’s original end so the two don’t stack. `0x40B820` / `0x40B840`
are **ret stubs** in MOVPLAY. In-game `DF.EXE` `0x4196a0` runs rec+0
**commands** at rec+0x24. Type 2 is 16 bytes: Mac rect, A-slot at +10
(`0x419530` starts that 104-byte voice object), dest-frame at +14.
`0x40ac60` is mouse-in-rect. last 0/1 stay (click-to-play). last>1
plays and jumps (`0x419b73` writes the dest rec into the playhead).
Pots/bells have rec+32 = 0; SFX live on those last>1 A-slots. Rec 1 of
`bell.mov` is three bell rects (A1→rec 2, A2→rec 22, A3→rec 43) plus a
full-frame dismiss to rec 64. Rec 1 and rec 9 of `grocpots.mov` both
jump A1 to rec 2 — rec 9 is replay, not a second clang. Linear extract
schedules each unique `(slot, dest)` at the dest rec’s start tick.
Inspect wait is type 2 slot 0 last 2, not rec+0≠0.
Type 4 (48 bytes, Mac rect + Pascal `.mov` at +16) pushes a nested
playmovie (`0x419ba3`) while depth `< 5`. When rec+0 cmd count is 0,
rec+0x16 is an end-kind: **3** copies rec+0x30 into the current movie
name (`0x419a24`) so `playmovie("towerup.mov")` continues through
`towertop.mov` then `towerdn.mov`. `intro2.mov` chains `intro3.mov`
the same way; `intro.mov` does not (boot names intro2).

`singlesound` / `dualsound` / `multiplesound` are VM opcodes in the
shared table; reel playback does not dispatch them. The reel mixer is
this A-slot + B-playlist split.

### Framebuffer (proven — the “delta stills”)

SET/MOV stills are **deltas into one 512×264 buffer** (DFET
`getRawImageData` already documented this). MOVPLAY never `memset`s
the buffer at a scene header. Scene headers are palette + frame table,
not images.

dfextract used to treat a failed still-decode as “clear prior”. Scene
headers fail that decode, so the first still of the next scene was
composited onto **black**. Most scene-starts are keyframes (INTRO 9,
147, …). INTRO still **461** (first still after scene 457) is a real
delta: 300 pixels stay from the previous scene. Clearing prior punches
holes. Skip scene headers **without** clearing prior.

Each scene header also **loads a new palette** (256 × 8-byte
`ColorPalette` at **`+0x3E`**, MOVPLAY copy at `0x40BC9A`). The
framebuffer is indices; RGB must use the current scene’s palette.
Painting later INTRO scenes with container 0’s match-lighting palette
made a full still look like a residual (black holes, posterized grain).

### dfextract mux

`dfextract/mov.py` `parse_reel_timeline` + `_collect_reel`. `--video` is
**opt-in** (default `python cli.py` is scripts/audio/frames/z; no mp4). With
`--video` it encodes **every** Dust v1 MOV that has stills — not just
`is_reel_movie` `playmovie` stems — at 60 fps with duplicated holds,
`timeline.json` (`channel` `A1`… / `B`), scene palettes, and the
cross-scene A hold. Mixed 512×384 / 512×264 (TIPRE) is letterboxed onto
one canvas; odd sizes (NITEWARN 516×265) pad even for libx264. This
install: **247** `movie.mp4` files (all `LPPALPPA` MOVs; 11 `ZUNUSED`
skipped). Close to original playback; not proven 1-to-1 against a
capture.

---

## 7a. World → still (CST dest-rect, this install)

Playback book (cameras, oracle, dead ends):
[`src/play/README.md`](../../src/play/README.md) § World → still.
This install’s `DF.EXE` is SHA-1 `54558d7b47b627e9770932be0afa9efd2fadce00`
(DreamCatcher’s published hash is a **different** build).

Capstone on `.text` (not Ghidra). Addresses are VAs, image base
`0x400000`.

| Site | What it is |
|---|---|
| `0x40dcd0` | World → screen. First `ret` at `0x40dd48` is **forward ≤ 0** (`test esi,esi / jg 0x40dd49`). X/Y math is the continuation. Point `{x,y,z}` at `esi+2/+4/+6`. Subtract camera `0x460978/97a/97c`. Rotate by `[0x4494b8]` / `[0x4494d0]` (TRIG sin/cos, 16384). `cdq; and edx, 0x3fff; add; sar 14` (toward 0). Else `imul` both axes by focal `[0x460958]`, `idiv` forward. Store `y` at out+0 (`centerY − up*focal/forward`), `x` at out+2 (`centerX + right*focal/forward`). Returns lens-forward in `ax`. |
| `0x40d255` / `0x40d488` | `mov word [0x460958], 0x136` — focal **310**. View centers are half of `[0x460950]`×`[0x460952]` (512×384 stage; still is 512×264 → centerY **132**). |
| `0x40dd90` | SET filmstrip camera. `0x4493dc` is the motion index (`-1` idle; `0..4` during the strip). Adds `[0x4494b0]` (**frame0** container, not a pose table) and `0x40e550` **loads that still**. Feet = current tile `*256+128`. Walk (`[0x460962] == [0x460968]`): look-deg stays cardinal, XY `+= index*64` along the axis (`shl 8 / sar 2`). Turn: XY stays, look-deg `+= index*16` (`shl 6 / sar 2`, 0..64 = 90°). Then `0x40e081` setback on that heading. Tail (`0x40e0d0`): `inc [0x4493dc]`; if index hits 5, dest tile/facing is copied and index set to `-1`. One plate per display pump (`0x40e1d2` / `framerate (3)` → **20 Hz**; five plates = 250 ms). Dest HQ is not a sixth timed plate. |
| `0x40d920` | Start a walk/turn (`currentscene ("strait"/"left"/"right")`). If `[0x4493dc] >= 0` **return** — no queue. Else `0x40eae0` dest + `0x40db50` lookup; on miss, revert dest. On hit, store frame0 and set index to 0 (if `[0x4493cc]==3`) or 1. |
| `0x40ddac` | `shl ax, 8; add ax, 0x80` — feet = `tile * 256 + 128`. Not 255. |
| `0x40e640` / `0x40e670` | `calcvect`: `TRIG[deg & 255] * dist / 16384`. 640 = sin table `[0x44953c]`, 670 = cos `[0x4493d4]`. Setback: `camX -= sin*sb`, `camY -= cos*sb`. |
| `0x40e081` / `0x40e08e` | `camX/Y -= calcvect(look-deg, [0x46094c])` — draw-lens setback. |
| `0x40e720` | Wrapper: PRP draw `0x427fa0` then CST `0x415040`. Called with the filmstrip still already loaded. Sprites reproject every motion frame. |
| `0x40eae0` | Apply walk/turn command → dest pose. Arg `1` left, `2` right, `3` forward, `4` back. Facing codes **1=N, 2=S, 3=E, 4=W** (spawn +52 and framelist `dir_*`). Left from N writes dest facing **4**. |
| `0x415170` | CST per-actor. `actor+0x12 == 0` is a **2D** path (no `0x40dcd0`; uses `actor+0x18` as a deg). Non-zero is world projection. Record stride **0x9e**. |
| `0x415213` | World path calls `0x40dcd0`. Then `bx = forward - actor+0x4c - setback + 128`; clamp `< 0` to 0; skip if `> 0x600` (6×256) or scale divisor `< 0x20`. `sar bx, 6` is the 24-level sprite Z (patent US5729669). O7 N Leroy lens-forward 240, zclip 32: `(240-32-64+128)>>6 = 4`. |
| `0x415271` | Dest size: `actorscale * setInfo+0x2a / 1000`, then `idiv` by **lens-forward** (`[esp+0x12]` is the `ax` from `0x40dcd0`; skip if `< 32`). Dest Mac Rect at out+0x10: top/left = projected hotspot minus scaled header hotspot. Clip `0x40ab50`. GANG +0x2a = **114**; INVEN jug = **96**. |
| `0x427fa0` / `0x4280d0` | PRP draw / per-prop helper. Clone of CST (`prop+0x4e` zclip, `prop+0x2c` scale). Record stride **0xa4**. Same `0x40dcd0`. |
| `0x411d50` / `0x411d20` | `calcdeg` / `atan2(dy, dx)` on the 256-circle (**0=E**, 64=S, 128=W, 192=N). +x east, +y south. CST `0x4151e0` wanted is `actordeg −` this bearing to the draw lens. Walk-table look-deg uses the same numbers (N=`0xC0`). `0xC0` is **north**, not west. |
| `0x423e59` | ColorPalette 8.8 → GDI. `mov dx,[esi+2]` R, `mov ax,[esi+4]` G, `mov cx,[esi+6]` B; `sar dx,8` / `sar ax,8`. Unused slot is `0xFFFF`; arithmetic shift keeps `0xFF` in the low byte (**white**) in the GDI struct. Sprites 8-bit-blit onto the current SET/FLT still, whose VGA index 0 is **black** (Help’s legs, crow bodies, door pal-0, gun grain). Dumping pal 0 as that GDI white was the salt. Trans-sprite **skip** is the unwritten run, not pal 0 and not every index 255 — copy/repeat of 255 is VGA white (bone/ring highlights). |

SET container 0 (every Dust map we dumped):

| Offset | Town / Nite | Meaning |
|---|---|---|
| +24 | 64 | Draw-lens setback (constant on all SETs) |
| +26 | 62 (town/nite); 72 (target); 90–260 interiors | Camera Z / height |
| +42 / +44 | 512×264 | Still size |
| +48 / +50 / +52 | 6, 14, 1 | Spawn tile + facing (O7 N). Facing **1=N 2=S 3=E 4=W** (`0x40eae0`) |
| +60 | 32 (town); 64/128 interiors | Default `actorzclip` |

BSS words the projector and filmstrip actually touch (this build):

| VA | Role |
|---|---|
| `0x46094c` / `0x46094e` | setback (SET +24) / camZ (SET +26) |
| `0x460958` / `5a` / `5c` | focal 310 / centerY 132 / centerX 256 |
| `0x46095e` / `960` / `962` | current tile X, Y, facing (1–4) |
| `0x460964` / `966` / `968` | dest tile X, Y, facing |
| `0x46096a` | look-deg 0–255 (after the walk/turn step, before setback) |
| `0x460978` / `97a` / `97c` | draw-lens X, Y, Z (tile center, then setback) |
| `0x4493dc` | filmstrip index (`-1` idle) |
| `0x4494b0` | SET `frame0` container for the current strip |
| `0x4494b8` / `0x4494d0` | current sin/cos for `0x40dcd0` |

SET framelist records are **28 bytes**. The six shorts at +12 are a
duplicate of from/to pose, not extra camera xyz. `0x40e550` indexes
stills as `frame0 + index`.

**Not traced:** no `mov [0x46094c], 64` in `.text`. Play copies SET +24
into that slot because the engine *reads* `[0x46094c]` as setback, every
SET has 64 there, and 64 + focal 310 + 256-tiles puts O7 N Leroy at
still-x **354** (original midline **353**). Walk-table look-deg writes
(`0x40de2f` stores `0xC0` on facing-1 = N) are **0 = east** on the same
circle as `0x411d50` (`0xC0` = north). SET facing codes stay 1=N.
Turn jump table at `0x40e128` steps `index*16` but the per-facing start
deg is not mapped to shortest-path ±64.

Patents (web search “Cyberflix DreamFactory projection”, not a known
number): [US5644694](https://patents.google.com/patent/US5644694A)
production camera (256-unit cells, 5 frames / 4 equal steps, set-back
lens, height **72**); [US5729669](https://patents.google.com/patent/US5729669A)
24-level Z sprites. Dust’s setback is **64**, town camZ **62**. Prefer
EXE + SET.

### Play vs this EXE (do not collapse)

| Piece | `DF.EXE` | Play |
|---|---|---|
| Screen X | `0x40dcd0` pinhole | same |
| Screen Y | `0x40dcd0` pinhole `132 − 310*(objZ−62)/forward` | same. N7 E jug hotspot **279**. 1/z Y was a remake guess |
| Scale | `actorscale * field / 1000 / lens-forward` (`0x415271`, skip forward `< 32`). Field is setInfo +0x2a (**114** GANG, **96** INVEN jug) | same |
| Sprite Z | `(lensForward − zclip − setback + 128) >> 6` | same, then at most **one** SET plane closer if the hotspot is dirt. 1/z from the feet hid the N7 E jug (Z=4 on Z=3 dirt) |
| Filmstrip walk | `index*64` along the axis; 5 plates at 20 Hz; `0x40d920` no-ops while in strip | lerp camera XY, `t = index/4` on the 5 motion frames; dest HQ is the standing blit |
| Filmstrip turn | `index*16` look-deg + setback | yaw + reproject `0x40dcd0` every plate |
| Draw order | PRP then CST, both reproject every frame | far-to-near among world sprites; still Z vs sprite is per pixel |

`town.jug` is SET star **(1730, 3476)** — 66 east / 20 south of N7 feet
`(1664, 3456)`. N7 E: still-x **303**, hotspot Y **279**, sprite Z **3**
(dirt is Z=3). Facing south, engine Y is ~361 (under the HUD) — the
overlay drops out and the photographed jug remains. Do not one-off that
item; CST and PRP share `0x40dcd0`. Screenshots:
`screenshots/N7_east_original.png` vs `N7_east_ours.png` (1/z Y) vs
`N7_east_ours_next.png` (1/z Z).

---

## 7b. Walk (speed, route, pose)

Same `DF.EXE`, every CST actor and every SET. Do not use `speed * 24`,
BFS on camera tiles, or one CST cycle per 256-unit tile.

| Site | What it is |
|---|---|
| `0x410820` | `walktostar`. Parse `"x,y,z"` (`0x423ef0`) → beeline. Else star lookup, then `0x424000` for a named pair. |
| `0x424000` | If dest/current stars are the two names on a 50-byte waypoint record and +0x18 ≠ 0, load that SET container (`0x424400`). Reverse (`0x424470`) when going slot B→A. `resume` is `0x424160` + nearest-point splice `0x424250`. |
| Path container | `i32 count` @0, total length @4, points @16 as `{i16 x,y,z,seg}`. TOWN/NITE: 12 pairs (Leroy **262**, blood **260**, …). Interiors that authored a path: BANK, HOTLOWER, HOTUPPER, JAIL, LIVERY, MAYUPPER, SALLOWER, SALUPPER, STORE, TARGET. |
| `0x40fe00` | Walk-job pump (16 × 0x52 records at `0x449570`). `forceupdate` (`0x433740`) is one pump. |
| `0x410b80` | One job tick. Turn while record+4 ≥ 0 (`0x412100`, circle `0xFF`, min step 1). Then `acc +=` SET-actor speed word; lerp along the path (`0x411f50`) or the 3D beeline (`isqrt` `0x40b160`). |
| `0x438210` | `timeGetTime`; `*3/50` → 60 Hz **counter**. |
| `0x40e1d2` | Frame loop: draw CST (`0x415040`), then wait until the counter advanced by **`framerate`**. Boot `framerate (3)` → **20 Hz** game frames, not 60 Hz pumps. PRP+CST together are `0x40e720` (§7a). |
| `0x4154c0` | CST sprite pick on that draw. `actor+0x24` indexes **that pose’s** setInfo **+0x2e** (length **+0x70**). GANG 8-pose walk: 16 slots `[1,1,2,2,…,8,8]`. EXTRA pig/chicken walk: `[1,1,2,2]`. Stand is length 1. For each 44-byte frame, +8 must match that 0-based pose id; then `0x411f20` circular distance to wanted deg vs frame **+0x28**. Keep the smallest (exact 0 stops). `0x4151e0` wanted is `actordeg − calcdeg(actor, lens)` (`0x411d20`, 0=east); look-deg cancels. CST plate **32** is the west ¾; world `actordeg 32` is SE (L7 N → plate **224**). Dog street: 7 plates at 16° (`0,16,32,48,208,224,240`). |

`stdactor` copies `stdspeed` / `stdturn` of `actorset(who)`: town **3 / 7**, hotlower and sallower **4 / 8**, else **5 / 10** (GANG `Cast.txt`). Mine extra `stdspeed` is **4**. That many world units / deg-units per **20 Hz** game frame. Scripts wait with `while iswalk { forceupdate }`.

Play: `SET/_<PLACE>/paths.json` + `CST/_<CAST>/timing.json` for gang, extra, target, mine. Leftover: face dest before the first translate (record+4); resume snap.

---

## 8. What we have **not** gotten out of the EXEs yet

Do not pretend these are done:

- ~~C recovery of the VM (Ghidra on `DF.EXE` `.text`)~~ **done** —
  `dustdecompile/ghidra/` runs the headless decompile; the semantics are
  written up in [vm.md](vm.md). Ghidra output itself stays generated and
  gitignored under `out/ghidra/`.
- Handler/function-pointer table next to the name table — we looked;
  the 6-byte records are `{name, id}` only. Dispatch is elsewhere
  (search / switch on id).
- ~~`PlugProc` calling convention and `checkmove` search internals~~
  **done** — §3 CHECKERS.DLL. Play copy: `src/play/checkers.ts`.
- MOVPLAY **B playlist wrap** (`header+0x8BE` last-item next pointer) —
  sequential play of the `+0x83E` list is implemented; whether the
  theme loops the list after the last entry is not pinned.
- `singlesound` / `dualsound` / `multiplesound` **VM** handlers (game
  SND, not MOV reels). Reel mixing is the A-slot + B-playlist path in §7.
- `walktostar` **route** is the SET polyline at waypoint +0x18 (`0x424000` /
  `0x411f50`). `actorspeed` is units per **20 Hz** game frame (boot
  `framerate (3)` wait at `0x40e1d2`), not per 60 Hz counter tick. CST
  pose table is one slot per that same frame. Leftover: turn-then-walk
  (`walk` record +4 ≥ 0); resume snap (`0x424250`).
- Save blob format. Filter string is `Saved games (.RTD)!*.rtd`. No
  `.rtd` in this install.
- Mouth/`animLogic` visemes: integer is now in `texts.csv`; how it
  indexes jaw/mouth frames is still unproven (not a PUP container id).
- Bevel / inventory chrome layout (cursors **are** dumped: `python -m
  dustdecompile --rsrc` → `out/rsrc/cursors/`). Script `cursor("touch")`
  maps to `CURS.TOUCH`. RCDATA `TRIG1` / `TRIG2` are 256 int16s,
  `16384 * sin/cos(2π i / 256)` — `actordeg` / `calcvect`, not FOV.
- CST dest-rect **X, Y, size, sprite Z** and SET filmstrip camera are
  §7a (locked in play). Leftover: the `mov` that fills `[0x46094c]`
  from SET +24; walk-table look-deg vs facing 1=N; turn jump-table
  start deg (step size `index*16` is proven). Do not revive 1/z Y,
  1/z sprite Z, or frozen/screen-lerped pans.
- Z-buffer **use** at runtime is in play: CST pixels draw when
  `actorZ <= stillZ` (smaller = closer). Sprite Z is EXE
  `(lensForward − zclip − setback + 128) >> 6` (`0x41535c`), then at
  most one plane closer if the hotspot is dirt. 1/z from the feet hid
  the N7 E jug (Z=4 on Z=3 dirt). Unconditional `min(hotspot Z)` put
  Leroy through buildings. `actorzclip` 32 is part of the EXE formula,
  not a 24-level subtract on its own.

---

## 9. How an agent should use this

1. Read [`handbook.md`](handbook.md) for each verb before implementing it.
2. Translate Titanic names when reading `dfextract/out/**/*.txt` (§5).
3. Treat `new.flt` as part of the game (travel, movies, day advance),
   not as something to re-invent in TypeScript from first principles —
   **port those procedures**.
4. ~~Implement native `pluginfx("checkmove")`~~ **done** (`src/play/checkers.ts`
   plus extracted `goodmove`/`goodjump`).
5. Never guess `unknown` rows (delay units, save format, MOV timing).
6. CST world→still is §7a. Do not invent 90° FOV, `255`/tile, or a
   star nudge. Dead ends: [`src/play/README.md`](../../src/play/README.md).

Regenerate dumps:

```
python -m dustdecompile          # out/*.json, out/handbook.md
python -m dustdecompile --opcodes
python -m dustdecompile --handbook
```

Tests: `python tests/test_pe.py`, `test_opcodes.py`, `test_scripts.py`,
`test_handbook.py`, `test_cli.py`. Need `sources/dust.dbgl/`.
