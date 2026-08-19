# dfextract documentation

This folder documents the Dust-only DreamFactory extractor in
`tools/dfextract/`. It is written so a person who has never seen this
session can reproduce the extract, understand every offset we rely on,
and know what is still wrong.

| Document | Contents |
|---|---|
| [../README.md](../README.md) | **From-scratch setup** (install Python, run, wipe `out/`) |
| [reproducing.md](reproducing.md) | Inventory, CLI flags, tests, expected scale |
| [output-catalog.md](output-catalog.md) | **What each file in `out/` is and where to look** |
| [reconstruction-gaps.md](reconstruction-gaps.md) | **What a remake agent still has to invent** |
| [container-format.md](container-format.md) | `LPPALPPA` file header and container table |
| [scripts.md](scripts.md) | 8-byte script tokens and the opcode table |
| [audio.md](audio.md) | Dust v1 ADPCM (`v40` / `v41`) |
| [images.md](images.md) | Palette, transparent sprites, SET/MOV stills |
| [file-types.md](file-types.md) | PUP, CST, SND, BOOT, SET, FLT, PRP, MOV |
| [findings.md](findings.md) | Sources, what we proved, limits, vs DFET |

The extractor is isolated from the Three.js remake on purpose. DFET
(GPL-3) is the reference implementation for shared codecs. Dust-only
layouts (SET grid, FLT/PRP/MOV v1) were reverse-engineered here.
