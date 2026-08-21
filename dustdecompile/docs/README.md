# dustdecompile documentation

| Document | Contents |
|---|---|
| [../README.md](../README.md) | How to run and test |
| [findings.md](findings.md) | **What we proved from the EXEs** — hashes, table layout, protocols, vs prior work |
| [handbook.md](handbook.md) | Agent rulebook — opcode meanings, library, hooks, aliases, call sites |
| [pipeline.md](pipeline.md) | How this becomes TypeScript (and what it will not do) |
| [targets.md](targets.md) | Which EXE/DLL files we read, and which we ignore |

`python -m dustdecompile --rsrc` writes `out/rsrc/` (cursors, Win32
menu, string tables including the `*.rtd` save filter, `CLUT.BLACK`).

The extractor for assets and scripts is still [`dfextract/`](../../dfextract/README.md).
This tool is the engine-binary counterpart.
