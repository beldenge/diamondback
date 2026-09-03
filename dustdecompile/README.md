# dustdecompile

Recover structure from Dust's engine binaries (`DF.EXE`, `MOVPLAY.EXE`,
`CHECKERS.DLL`, the Win16 launcher) so a remake agent can implement the
same behaviour without guessing.

It inventories the PE/NE files, parses Dust’s packed opcode table out of
`DF.EXE` (not Titanic’s 4.0 list), and writes a handbook of working
protocols (dialogue, clicks, plugins, travel). It does **not**
auto-translate x86 into TypeScript.

`ghidra/` holds a headless Ghidra script (`ExportDecomp.java`) that dumps
the decompiled C, a function table, strings and data refs for each
binary, plus `fn.py` to pull one function out of that dump. The VM
semantics in [`docs/vm.md`](docs/vm.md) were read out of it:

```
<ghidra>/support/analyzeHeadless <proj> DustProj -import DF.EXE \n  -scriptPath dustdecompile/ghidra -postScript ExportDecomp.java out/ghidra/DF
python dustdecompile/ghidra/fn.py DF 0x417b90
```

What we proved, how, and vs prior work:
[`docs/findings.md`](docs/findings.md).
Agent rulebook: [`docs/handbook.md`](docs/handbook.md).
VM semantics recovered with Ghidra (types, precedence, statements, hooks,
timing, dialogue, mixer, save layout): [`docs/vm.md`](docs/vm.md).

Isolated from `src/` on purpose, same idea as `dfextract/`. Do not import
this from the browser client.

## Run

From the **repo root** (needs `sources/dust.dbgl/`):

```
python -m dustdecompile
```

Or from this directory:

```
python cli.py
```

Output lands in `out/` (gitignored). That tree is **generated**. Do not
hand-edit it; change this package and re-run.

```
out/inventory.json
out/opcodes.json
out/opcodes.ts
out/plugins.json
out/report.md
out/handbook.md      # agent rulebook (also copied to docs/handbook.md)
out/handbook.json
out/rsrc/            # cursors, Win32 menu, string tables, CLUTs
```

Flags only narrow: `--inventory`, `--opcodes`, `--plugins`, `--handbook`, `--rsrc`.
`-o DIR` sets the output folder. Pass a `WIN31/DUST` directory or a
specific EXE/DLL to override the default install path.

The handbook reads `dfextract/out` if present, so run the extractor first
if you want call-site counts.

## Tests

From this directory:

```
python -m unittest discover -s tests -v
```

Need the Dust tree under `sources/dust.dbgl/` (and `dfextract/out/` for call-site tests). Tests pin this install’s `DF.EXE` SHA-1; a different SKU (DreamCatcher’s build, another CPU pack) should fail those assertions on purpose.

SHA-1 / opcode-count / alias / protocol tests are the regression net for [`docs/findings.md`](docs/findings.md).

## What this is for

`dfextract` already prints DreamFactory **scripts**. The remaining holes
are engine **semantics** (what `puppetspeak` actually does), native
plugins (`pluginfx("checkmove", …)`), and `MOVPLAY` (holds, A/B mixer,
framebuffer, palettes — findings.md §7). Those live in the binaries this
tool reads. Pipeline toward TypeScript:
[`docs/pipeline.md`](docs/pipeline.md). Which files we touch:
[`docs/targets.md`](docs/targets.md).
