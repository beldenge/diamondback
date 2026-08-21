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
| Dust opcode dictionary (304 names, ids matching script tokens) | A script VM that names every token Dust actually uses |
| Id bands (`4xxx` language … `20xxx` returns a value) | Which names are statements vs functions vs fields |
| Dialogue protocol | `puppetclear` → `puppetbevel(label, id)*` → `arg = puppetevent(-1)` |
| Click protocol | boot `hittest` → `result()` → `sendto*` ; `pointx`/`pointy` in 512×264 |
| Object messages | `sendtoactor("JENIX", …)` runs a call *on* that actor |
| Virtual FS | `path(n, "dust:data:")` slots |
| Plugin ABI | `LoadLibrary` + one export `PlugProc` + verb string (`checkmove`) |
| Checkers AI hook | `pluginfx("checkmove", board, lookahead, mode)` → comma-separated moves |
| Travel / movies | `spotmovie` / `gototown` / `gotointerior` / `advanceday` are **game scripts** in `new.flt`, wrapping `playmovie` / `opensetfile` |

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
- MOVPLAY also contains the **same 304-name opcode table** as `DF.EXE`. The standalone player is a DF subset, not a separate movie format.
- Still holds, group-A/group-B mixer, and the single framebuffer are **solved** (see §7). dfextract `--video` encodes at 60 fps from those rules.

### `CHECKERS.DLL`

- PE32, linker **2.55**, image base `0x10000000`.
- Installed build timestamp **1995-07-25 05:07:38 UTC**, export name **`Checkers.486.release.dll`**. ALT31 build is **~1.5 minutes earlier**, export name **`Checkers.386.release.dll`**. Same size, same `PlugProc` RVA `0x22d0`, different bytes (CPU-tuned).
- `.text` virtual size **9522**. **KERNEL32 only** — no GDI, no USER, no WINMM. The DLL is compute, not drawing.
- One export: **`PlugProc` ordinal 1 @ RVA `0x22d0`**.
- Verb **`checkmove`** is a C string inside the DLL, not an export. Scripts call `pluginfx("checkmove", mainboard, count, 0)` and `pluginfx("checkmove", mainboard, 0, 1)`.
- Return value is a **string**. Empty = no moves. Non-empty is comma-separated moves; each move is word-split with `findword`. Mode `0` = AI/automove list; mode `1` = player jump list (as used in `PRP/_CHECKERS/automove_1.txt`).
- Legal step/jump tests also exist **in scripts** (`goodmove`, `goodjump`, board as 64 space-separated cells, kings `"2"`/`"-2"`). The DLL is the search/AI (and jump generator), not the only copy of the rules.

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
- **304** names, **304** unique names, **302** unique ids.

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
| `8xxx` operator | 12 | `+ - * / & | @ = != > <` (and `and`/`or`) |
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
`voicesound`. One Jones site uses two args: `puppetspeak("jones.33", 101)`
in place of a bevel. Blocking is **inferred**, not proven in the EXE.

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

`framerate(3)` at boot: **units unknown**. Do not treat as 3 fps.
SET walks at ~24 fps come from play, not this call.

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
Different A slots overlap. A new scene can fire its first line while
the previous scene’s line is still playing (INTRO `clip_325` vs
`clip_423`); the extract **holds** that new cue until the previous
line’s original end so the two don’t stack. `0x40B820` / `0x40B840`
are **ret stubs** in MOVPLAY (in-game `DF.EXE` may use them for
click/action).

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
**opt-in** (default `python cli.py` is scripts/audio/frames only). With
`--video` it encodes **every** Dust v1 MOV that has stills — not just
`is_reel_movie` `playmovie` stems — at 60 fps with duplicated holds,
`timeline.json` (`channel` `A1`… / `B`), scene palettes, and the
cross-scene A hold. Mixed 512×384 / 512×264 (TIPRE) is letterboxed onto
one canvas; odd sizes (NITEWARN 516×265) pad even for libx264. This
install: **247** `movie.mp4` files (all `LPPALPPA` MOVs; 11 `ZUNUSED`
skipped). Close to original playback; not proven 1-to-1 against a
capture.

---

## 8. What we have **not** gotten out of the EXEs yet

Do not pretend these are done:

- C recovery of the VM (Ghidra on `DF.EXE` `.text` — readable PE32 C,
  not done here).
- Handler/function-pointer table next to the name table — we looked;
  the 6-byte records are `{name, id}` only. Dispatch is elsewhere
  (search / switch on id).
- `PlugProc` calling convention and `checkmove` search internals
  (9.5 KB of code; scripts already consume the result string).
- MOVPLAY **B playlist wrap** (`header+0x8BE` last-item next pointer) —
  sequential play of the `+0x83E` list is implemented; whether the
  theme loops the list after the last entry is not pinned.
- `singlesound` / `dualsound` / `multiplesound` **VM** handlers (game
  SND, not MOV reels). Reel mixing is the A-slot + B-playlist path in §7.
- `walktostar` blocking vs async; `actorxyz` units.
- Save blob format.
- Mouth/`animLogic` visemes (integer on PUP lines, not in this table).
- Cursor/bevel bitmaps (`cursor("touch")` is a name, not a resource dump
  from `DF.EXE` in this pass).
- Z-buffer use at runtime (patent + Appleton; extract still skips Z).

---

## 9. How an agent should use this

1. Read [`handbook.md`](handbook.md) for each verb before implementing it.
2. Translate Titanic names when reading `dfextract/out/**/*.txt` (§5).
3. Treat `new.flt` as part of the game (travel, movies, day advance),
   not as something to re-invent in TypeScript from first principles —
   **port those procedures**.
4. Implement native `pluginfx("checkmove")` as a function that matches
   the string protocol; port `goodmove`/`goodjump` from the PRP scripts.
5. Never guess `unknown` rows (delay units, save format, MOV timing).

Regenerate dumps:

```
python -m dustdecompile          # out/*.json, out/handbook.md
python -m dustdecompile --opcodes
python -m dustdecompile --handbook
```

Tests: `python tests/test_pe.py`, `test_opcodes.py`, `test_scripts.py`,
`test_handbook.py`, `test_cli.py`. Need `sources/dust.dbgl/`.
