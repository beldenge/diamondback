# dustdecompile

Recover structure from Dust's engine binaries (`DF.EXE`, `MOVPLAY.EXE`,
`CHECKERS.DLL`, the Win16 launcher) so a remake agent can implement the
same behaviour without guessing.

This is **not** a Ghidra wrapper, and it does **not** auto-translate x86
into TypeScript. It inventories the PE/NE files, parses Dust’s packed
opcode table out of `DF.EXE` (not Titanic’s 4.0 list), and writes a
handbook of working protocols (dialogue, clicks, plugins, travel).

What we proved, how, and vs prior work:
[`docs/findings.md`](docs/findings.md).
Agent rulebook: [`docs/handbook.md`](docs/handbook.md).

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

Output lands in `out/` (gitignored):

```
out/inventory.json
out/opcodes.json
out/opcodes.ts
out/plugins.json
out/report.md
out/handbook.md      # agent rulebook (also copied to docs/handbook.md)
out/handbook.json
```

Flags only narrow: `--inventory`, `--opcodes`, `--plugins`, `--handbook`.
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
