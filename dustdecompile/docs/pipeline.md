# Pipeline: binaries → TypeScript

## Do we have a shot?

Yes, with a bounded meaning of "faithful."

Dust's engine is small, 1995–96 **pure C** (Bill Appleton), compiled as
PE32 Win32s. `DF.EXE` is 346 KB with ~272 KB of `.text`. Checkers is one
exported `PlugProc` in 9.5 KB of code. We already have ~640 pretty-printed
scripts, the asset graph, and a punch list in
[`dfextract/docs/reconstruction-gaps.md`](../../dfextract/docs/reconstruction-gaps.md).

What modern tools buy us:

- **Ghidra** on PE32 MSVC 4.x C is actually readable, not the soup you
  get from a 2015 C++ game.
- **The scripts are the spec for control flow.** The decompile answers
  *verb semantics*, not "what does Jenix say on day 1."
- **Plugins are FFI.** `CHECKERS.DLL` is a weekend of Ghidra, not a
  rewrite of the whole engine.

What they do not buy us: a clean automated C-to-TypeScript transpiler.
Ghidra output is `FUN_0040xxxx`, Win32 GDI, and packed structs. Naive
translation would be unmaintainable and still wrong on timing. The
working pattern is OpenRCT2 / DreamCatcher: recover behaviour, reimplement
it, play-verify.

## Stages

0. **Inventory + opcode table.** PE/NE catalog, Dust name/id table from
   `DF.EXE`, plugin exports, `opcodes.ts`. Writeup: [`findings.md`](findings.md).
1. **Handbook (done).** [`handbook.md`](handbook.md) — what the important
   verbs *do*, Titanic-vs-Dust name aliases, engine hooks, `new.flt`
   library (`spotmovie`, `gototown`, …), call sites from `dfextract/out`.
   Marked proven / inferred / unknown. Do not invent the unknown rows.
2. **Native plugins / MOVPLAY / rsrc.** Checkers `PlugProc` / `checkmove`
   encoding is in play (`src/play/checkers.ts`, findings.md §3).
   Movie holds, A/B mixer, framebuffer + per-scene palettes
   (findings.md §7). Cursors/menu/strings from `DF.EXE` `.rsrc`
   (`--rsrc`). dfextract `--video` implements the mux (opt-in).
   `.rtd` container order is recovered ([vm.md](vm.md) §12). B playlist
   wrap is still open.
2b. **Full decompile (done).** `dustdecompile/ghidra/` runs Ghidra
   headless over all three binaries and writes decompiled C plus function,
   string and data-ref tables. [vm.md](vm.md) is the read-out: value
   types, operator precedence, statement forms, `passcode` record chains,
   hook order, timing, dialogue, the mixer and the save layout.
3. **TypeScript remake, one subsystem at a time,** using scripts + this
   handbook so an agent does not guess verb meanings.
4. **Play-verify.** Jenix money, one door, checkers, one death, day
   change.

## Relationship to the remake

`SPEC.md` now says the browser client interprets extracted Dust **tokens**
in a TypeScript VM (not a C port of `DF.EXE`, not a hand-port of 541
scripts). This tool is the opcode/protocol oracle that VM implements.
Do not import `dustdecompile` from `src/`.

## Opcode table (stage 0 fact)

Records are packed 6 bytes, grouped, NUL-terminated, first record of each
group 4-byte aligned. Dust names are not Titanic's: `makeball` not
`makecricket`, `sendtofloor` not `sendtopainting`, `findfile` not
`fileexists`, plus `rowcoltoscene` / `scenebuild` / `setwidth` / …
`and`/`or` exist alongside `&`/`|` (same ids 8005/8006).
