# Agent rules

## Generated output is read-only

**Never edit extracted or decompiled output in place.** That includes:

- `dfextract/out/**` (scripts, JSON, PNG, WAV, `catalog.json`, …)
- `dustdecompile/out/**` (handbook dump, opcode JSON, rsrc, Ghidra decompile, …)
- `dustdecompile/docs/handbook.md` — written by `handbook.py` on every run,
  not by hand. Change `dustdecompile/facts.py` and re-run instead.

Those trees are produced by Python. A re-run wipes local patches. Hand-editing a dumped `actordeg`, still, sprite, or token JSON to make the remake look right is forbidden.

If the dump is **wrong as a decode** (bad offset, token, palette, path): change `dfextract/` (or `dustdecompile/`) and re-extract.

If the dump is **faithful and playback is wrong** (compass, projector, idle, doors): change `src/`. Do not rewrite the dump to match a mistaken interpreter.

Pretty-printed `Script.txt` and runtime `Script.json` are both generated. Do not “fix” one without the generator.

Playback book: [`src/play/README.md`](src/play/README.md).  
Extractor: [`dfextract/README.md`](dfextract/README.md).  
Gaps: [`dfextract/docs/reconstruction-gaps.md`](dfextract/docs/reconstruction-gaps.md).

White specks / HUD pinholes on sprites are extract, not authored dust.
Sprites 8-bit-blit onto the SET/FLT still: **pal 0 is VGA black** (not
GDI unused-white). **Unwritten** codec skip is the hole (ring center,
gun outline). **Written** index 255 is VGA white (bone/ring highlights)
— do not treat every 255 as skip. Do not key pal 0. Do not remap INVEN
black to white. Book:
[`dfextract/docs/images.md`](dfextract/docs/images.md) § Pal 0 vs codec
skip 255. Tests: `dfextract/tests/test_palette_blit.py`.
