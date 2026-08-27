# Extract performance

How a full `python cli.py` dump went from ~15 minutes to a couple of
minutes, what must not regress, and what is left.

Measured 2026-08-19 on this machine: Python 3.14, Pillow 12.3, 32
logical CPUs, Windows.

## What actually cost time

A default run walks **411** Dust files. Scripts, JSON, and the
`LPPALPPA` reader are cheap (`TOWN.SET` is ~60 MB / 3,111 containers
and parses in ~40 ms). Audio (v40/v41 ADPCM in Python) is tens of
seconds at most.

Almost all wall-clock was **SET + MOV stills**:

| Kind | PNG count | Notes |
|---|---|---|
| SET | 13,703 | Walk/turn strips, mostly 512×264 |
| MOV | 12,365 | Cutscenes; same indexed codec |
| PUP/CST/PRP sprites | ~6,600 | Transparent-sprite codec; small |
| WAV | ~4,300 | Not the bottleneck |

TOWN and NITE write **3,155** stills each. The next SET is TARGET
(~1,126). The fat MOVs are INTRO3 (~1,475), LUPRE (~1,341), then a
long tail of 247 MOV dests.

The still codec (`decode_indexed_image`) already emits **8-bit
indices** plus a 256-color palette. The writer then expanded every
pixel to RGBA in Python (`still_rgba` per index) and asked Pillow to
compress ~540 KB of RGBA per 512×264 frame. That path was ~33 ms/frame
vs ~11 ms to decode a TOWN still (~2.3 ms for a typical MOV delta
frame). SET+MOV stills were ~95% of a full run.

cProfile on TOWN decode (after the write tax) is interpreter overhead
in a tight loop: `_decode_delta_span` (nested `u32`/`set_u32`), the
row dispatcher, `_copy_back` (hundreds of thousands of slice copies
per file), and `need()` / `len()` millions of times. Offset 5 of a
SET strip is slower than 0–4 (~22 ms vs ~8.5 ms in one sample).

Z-scanlines after the color image were parsed and discarded. They are
not written. The extract path no longer decodes them (`decode_z=False`).

## What we changed

### Paletted still PNGs (`image.write_indexed_png`)

Stills are PNG **color type 3**. `PLTE` is `Palette.still_plte`: the
stored ColorPalette with DFET VGA ends (**index 0 black, index 255
white**). A viewer / `ImageBitmapLoader` expands that the same way
`still_rgba` used to. PUP/CST sprites stay RGBA; they have real
per-pixel alpha.

On 240 TOWN stills: write dropped from ~33 ms/frame to ~1.5 ms; files
were ~19 KB vs ~38 KB. RGB round-trip is tested
(`test_indexed_png_roundtrip_matches_still_rgba` on O7 skull
`1640_5`).

Do **not** put the raw stored palette in `PLTE`. Dust keeps 255 as
`(0,0,0)`; without the white override the ox skull dumps as a hole.

### Parallelism (`cli.py`, `set.py`)

- **`--jobs` / `-j`**: `0` (default) = auto, up to 8 file workers when
  frames or audio run; `1` = one file at a time; scripts-only stays
  serial (process spawn would cost more than the work).
- Files are independent. Workers take **paths**, not pickled
  `DFFile` objects (TOWN is ~60 MB of slices).
- SET strips with **64+** transitions (TOWN / NITE / TARGET) use up to
  **4** processes. Each strip of 6 keeps its own `prior` framebuffer.
  Adjacent records can share a container id (O7→N7 walk vs an N7
  turn, both 1640); sharing one buffer was a real decode bug.
- MOV frames inside one file stay serial (`prior` is the codec).
  Parallelize across MOV files, not inside INTRO3.
- Nested pools are OK here (a file worker may start strip workers).
  Windows `spawn` works because entry points are behind
  `if __name__ == "__main__"` plus `freeze_support()`.

### Always overwrite

PNG and WAV are rewritten every run so a decode/palette fix actually
lands. There is no “skip if exists” resume. Delete `out/` only if you
want a clean tree.

PRP frames and MOV audio used to skip existing files; that is gone.

### Other small cuts

- Magic check reads **40 bytes**, not `path.read_bytes()[:40]` (which
  loaded all of TOWN twice).
- `_copy_back` no longer wraps the source slice in `bytes()`; a
  bytearray slice is already a copy, so overlapping src/dst stays
  safe.

### Timing on the CLI

Each `OK` / `FAIL` line includes **that file’s** extract time
(measured in the worker). `Done.` is **wall-clock** for the job, so
with workers it can be less than the sum of the per-file times.
Skips are silent. Formats: `<0.01s`, `3.13s`, `10.8s`, `1m 12s`.

## Numbers from this box

| Run | Time |
|---|---|
| Old full dump (RGBA stills, one core) | ~15 minutes (README budget) |
| TOWN stills, 3,155 PNGs, strip pool | **10.8 s** |
| TOWN + BANK, 2 file workers | **11.3 s** |
| APOTH + BANK + NITEFOUN, 2 workers | **4.0 s** |

A full dump should now be **a couple of minutes** (often well under
that). TOWN / NITE are still the long pole, not INTRO3, once writes
are paletted.

The remake does not parse PNG by hand (`StillsView` /
`ImageBitmapLoader`). Paletted stills are still PNG; the browser
expands `PLTE` on load. GPU textures stay 512×264 truecolor.

## Constraints (do not “speed this up” by reverting)

1. **VGA still ends** in `still_rgba` / `still_plte`. Sprites use
   `rgba` (no override).
2. **One `prior` per SET strip**, never one buffer for the whole SET
   in container-id order. Output names are `{frame0}_{offset}.png`.
3. **MOV `prior` is ordered** through that file’s containers.
4. **Always overwrite** media. Timing a killed run is not a reason to
   skip writes.
5. Keep `dfextract/` isolated (GPL-3 codec ports from DFET).

## Further improvements (not done)

Ranked by likely gain vs risk. The dump is already fast enough for
day-to-day remake work; these are for “re-dump after every codec
tweak should feel instant.”

1. **Cython / mypyc on the still decoder** (`decode_indexed_image`,
   `_decode_delta_span`, `_copy_back`). After paletted PNG this is
   the remaining CPU on TOWN (~11 ms/frame of bytecode). A 10–50×
   inner loop is realistic. Needs a build step and a pure-Python
   fallback; do not rewrite the bit logic while Yunni-box / right-edge
   artifacts are still open. Same optional pass on v40/v41 ADPCM and
   `decode_trans_sprite` — those are already small.
2. **Decoder micro-opts in CPython** if you do not want Cython:
   inline `need` / `u32` / `set_u32` (millions of calls), avoid
   `bytes([x]) * n` fills. Tens of percent, not another 10×. Leave
   the delta-span control flow alone unless you have a golden frame
   to diff.
3. **Raise or expose strip/file worker caps.** Auto is 8 file workers
   and 4 strip workers. This box has 32 threads; `--jobs 16` is
   already legal. A `--strip-jobs` flag would help TOWN-only dumps
   without nested-pool surprises. Watch NTFS + Defender when 20+
   processes write tens of thousands of tiny PNGs.
4. **MOV is still one chain per file.** You cannot slice INTRO3
   without changing the codec. File-level parallel already overlaps
   the fat MOVs with everything else.
5. **Do not switch the interpreter** (PyPy, GraalPy) as a first
   lever. Pillow is a C extension; the hot code is a few hundred
   lines in `image.py`. Numba is a poor fit (bytes + branches). The
   3.14 JIT (`PYTHON_JIT=1` if present) is a free experiment, not a
   plan. DFET is C++ and **refuses Dust SET/MOV v1**.
6. **`read_df_file` copies every container** out of the file blob.
   ~40 ms and extra RAM on TOWN. Only worth it if you Cython the
   decoder and this copy shows up.
7. **PNG `compress_level`.** Default zlib is ~1.5 ms and smaller
   files. Level 1 was ~0.6 ms and fatter. Prefer smaller dumps unless
   extract time comes back.
8. **Correctness stills, not speed:** Yunni-box (`BOXOPEN` /
   `BOXCLOSE`) and the thin right-edge stripe. Re-dump after any
   decode change. Do not inpaint skip-coded holes.
9. **Z PNG previews** (default dump) for occlusion. Decode is required.
   `--z` without `--frames` writes depth without rewriting color stills.
   Play fetches `FRAMES/z/` next to the HQ still.

Threading the decoder will not help (GIL). Threading Pillow after
paletted PNG is ~1.5 ms and not worth a pool.
