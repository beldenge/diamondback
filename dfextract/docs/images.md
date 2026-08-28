# Images

Two codecs. Palette is shared.

Implementation: `image.py`. PNG write uses Pillow. SET/MOV/FLT stills
are written as **8-bit paletted PNGs** (`IHDR` color type 3). The `PLTE`
chunk is the still palette with DFET VGA ends (index 0 black, 255 white),
so a viewer expands to the same RGB as `still_rgba`. PUP/CST/PRP trans
sprites stay RGBA because they have real per-pixel alpha (codec skip).

## Palette

`ColorPalette` is 8 bytes, 256 entries:

```
i16 index
i16 R, G, B     # 8.8 fixed point; we take the high byte
```

`R == G == B == -1` (`0xFFFF`) means “unused”. DF.EXE `0x423e59` does
`sar r16, 8` on those 8.8 channels, so the high byte is **255 (white)**
in the GDI palette struct. Sprites that **8-bit-blit onto a SET/FLT
still** share that still’s VGA ends: index **0 is black**, not unused
white. Dumping pal 0 as white was the salt on HOUSE door frames (court /
padreout), INVEN gun leather, Yunni-book grain, and HUB skeletons.
DFET’s unused `(0,0,0)` was the right *still-blit* color; treating it as
a HUD knockout (or as GDI white) was the miss. Codec skip (unwritten
index 255) stays transparent. HOUSE world overlays keep unused→black
and recolor from the SET palette. HOUSE reader chrome (`yunnibord`,
`histbord`, `pagebord`, `diarybord`, `curebord`) 8-bit-blits onto the
companion FLT still (YUNNI / HIST / PAGES / DIARY / CURE), not a town
SET. Scoring every DATA SET by chroma ties on TOWN and inverts the
leather (`yunnibord` dump `(88,80,62)` vs `yunnopen.mov` `(41,0,0)`).
Minigame PRPs (SALGAMES, CHECKERS, …) 8-bit-blit onto a sibling FLT
still; that FLT ColorPalette expands the indices. Using the PRP palette
(almost all unused-white) washes card faces to blank. CST with a
sibling SET (MINE, TARGET) uses the SET pal — MINE.CST’s own table is
an RGB cube and rainbows the skeletons.

SET/MOV/FLT **stills** follow DFET’s BMP VGA ends: index **0 is always
black**, index **255 is always white**. Dust stores 255 as `(0,0,0)` in
the ColorPalette; using that value made the O7 ox skull a black hole
while `_NITE` (which paints the skull with real tan/gray indices) looked
fine. CST world actors keep unused→black: they index-blit onto that
8-bit still (Help’s legs are pal 0). TARGET.CST / MINE.CST sprite
indices miss the CST ColorPalette (unused-black, or a dummy RGB cube);
dump those plates with the sibling SET ColorPalette, unused→**black**
(VGA still index 0). Unused-white turns `birdtarg` pal-0 bodies into
blank crows and door pal-0 into salt; bottles/plates use real SET slots
and stay colored. INVEN HUD items 8-bit-blit onto NEW.FLT the same way:
pal 0 is black grain, not white salt and not a hole. Codec skip
(unwritten index 255) stays transparent — Dust leaves the framebuffer
there (gun outline, butbevel hole). Do not key pal 0 through the HUD.

Where it lives:

| File | Offset in container 0 |
|---|---|
| PUP | 58 |
| CST | 36 |
| SET / FLT / PRP / MOV | first offset at which indices 0,1,2 appear on an 8-byte stride (`find_palette`) |

On SET, that search hits offset **80**.

## Pal 0 vs codec skip 255 (locked — do not re-debug)

White specks on doors, the INVEN gun, books, hub skeletons, and a
rainbow mine skeleton were **the same extract bug**, re-litigated as
HUD holes, GDI white, and CST cubes. This section is the book. Play
blit: [`src/play/README.md`](../../src/play/README.md) § Sprite palettes.
Tests: `tests/test_palette_blit.py`, `tests/test_frames.py`,
`src/play/occlude.test.ts`.

Dust is an **8-bit framebuffer**. Sprites do not RGB-composite through
the PRP/CST ColorPalette. They copy **indices** into the current SET or
FLT still. That still’s hardware palette has VGA ends (DFET BMP writer,
our `still_rgba` / `still_plte`):

| Index | In the ColorPalette file | On the still / 8-bit blit |
|---|---|---|
| **0** | almost always unused `0xFFFF` | **black** |
| **1–254** | 8.8 RGB, or unused `0xFFFF` | high byte, or unused fill |
| **255** (still pixel) | stored `(0,0,0)` | **white** (ox skull highlights) |
| **255** (trans-sprite codec) | not a color | **do not write** (leave the framebuffer) |

`DF.EXE` `0x423e59` `sar r16, 8` of unused `0xFFFF` yields **white in
the GDI `PALETTEENTRY`**. That is not the blit. Using it to expand
sprite PNGs painted pal 0 as salt. DFET’s unused `(0,0,0)` was the
right *still-blit* color; calling that “HUD black spots” and flipping
to white (or keying pal 0 through the leather) were the next two misses.

**Codec skip is the hole, not pal 0.** Trans-sprite decode fills the
buffer with 255, then writes only the runs the codec names. Unwritten
255 stays alpha 0 (gun outline, butbevel hole, ring center, reader
`*bord` page hole). Pal 0 is a **written** index. Help’s legs, TARGET
crow bodies, gun leather grain, door frames/studs, and hub-skeleton
specks are pal 0. They must stay **opaque black**. Keying pal 0 makes
Help legless and moth-eats the holster.

### Which palette expands the indices

| Sprite | File ColorPalette | Expand with | Unused 0xFFFF → |
|---|---|---|---|
| SET/MOV/FLT still | that file, + VGA ends | `still_plte` | pal 0 black, pal 255 white |
| CST GANG / EXTRA | CST +36 | CST pal | black (Help’s legs) |
| CST TARGET / MINE | often empty or an RGB cube | **sibling SET** | black |
| HOUSE world (doors, tables) | HOUSE unused-black | **mapped SET** (rice→CHIN, court→TOWN, …) | black |
| HOUSE `*bord` readers | HOUSE | **companion FLT** (not chroma-max TOWN) | black; hole is skip 255 |
| HUB skeletons / season props | HUB.PRP | **HUB.SET** | black |
| SALGAMES cards / handle | PRP almost all unused | **SALGAMES.FLT** | pal 0 unused (cards don’t sample it) |
| INVEN HUD items | INVEN, pal 0 unused | INVEN with unused→**black** | black grain |

MINE.CST’s own table is a full 6-bit RGB cube (idx 79 = `(153,204,204)`).
`cst_palette_misses_sprites` (unused-black ≥ 0.7) is **false** on that
cube, so “use the SET only when the CST pal is empty” kept the cube and
rainbowed the maze skeletons. Companion SET wins **whenever it exists**.
GANG.CST has no `GANG.SET`; it stays on the CST pal.

SALGAMES card “white specks” are not pal 0. The ace uses FLT cream
`(255,255,198)` / `(255,255,189)` — photographed paper dither. Pal 0
count on that sprite is 0.

### Worked examples (pal 0 is the salt)

| Sprite | Pal 0 of opaque | Wrong dump | Right dump |
|---|---|---|---|
| INVEN `Gun/large` c407 | ~10% (292 px) | white salt on leather | black grain; skip 255 = outline |
| INVEN `Yunnibook/large` | ~4% | white salt on the cover | black grain |
| HOUSE `door/court` (town mission) | ~16% | glowing white frame + studs | brown door, dark frame |
| HOUSE `door/padreout` (inside looking out) | ~20% | whitewashed frame | dark interior pal, pal 0 black |
| HOUSE `door/rice` (china shop inside) | ~0.7% | white flecks on the scroll | CHIN pal, pal 0 black specks |
| HUB `skeleton1/stand` | ~0.6% | white pelvis/thigh specks | HUB.SET rust, pal 0 black |
| MINE `skeleton/stand` c3 | (uses SET browns, not pal 0) | cyan/magenta RGB cube | MINE.SET rust + green eyes |
| SALGAMES `ah/full` | **0** | PRP unused-white wash | FLT cream paper |

Re-dump after a pal change: `python cli.py --type prp,cst --frames`.
Do not patch `out/**`. Play must not remap opaque black to white on
INVEN (`spriteBitsFromImageData` has no `unusedWhite`).

### Dead ends (do not retry)

| Approach | What we saw |
|---|---|
| GDI `sar 8` unused-white for sprite PNGs | Salt on court/padreout frames, gun leather, books, hub skeletons. Pal 0 is VGA black on the still blit. |
| DFET unused-black, then “fix” INVEN by keying pal 0 | Holes through the holster and Help’s legs. Pal 0 is written. Skip 255 is the knockout. |
| DFET unused-black, then remap every opaque black to white at blit | Same salt, now in `src/play` (`unusedWhite`). Extract black + blit white = gun spots again. |
| HOUSE unused-black without SET recolor | Silhouette doors and card tables. Indices belong to the SET. |
| SET pal unused-white when recoloring HOUSE | Pal 0 frame/studs become salt. `_palette_from_header` unused is black. |
| Chroma-max every DATA SET for HOUSE `*bord` | TOWN wins the tie; `yunnibord` leather inverts vs `yunnopen.mov` `(41,0,0)`. Lock the companion FLT. |
| SALGAMES PRP ColorPalette (unused-white or unused-black) | Faces wash to blank or invert. Expand with **SALGAMES.FLT**. Cream dither is authored, not pal 0. |
| CST pal when a sibling SET exists, but only if unused-black ≥ 0.7 | TARGET crows worked (empty pal). MINE skeletons rainbowed (full RGB cube). Always take the companion SET. |
| SET unused-white on TARGET pal 0 | `birdtarg` bodies blank. Pal 0 is crow black. |
| Treat pal 0 as photographed cream/whitewash | Unused `0xFFFF` has no authored RGB. The engine blits index 0 as black. |
| Hand-edit `out/**` PNGs to paint out the specks | Re-extract wipes it. Fix `dfextract/` (or play blit), then `--type prp,cst --frames`. |

## Transparent sprites (PUP faces, CST bodies, small PRP)

DFET: `writeTransPNGimage`. Simpler than the still codec.

Header (8 bytes):

```
i16 height
i16 width
i16 rawY     # DFET blit top-left: posY = 192 - rawY   (384/2)
i16 rawX     # DFET blit top-left: posX = 256 - rawX   (512/2)
# Codec hotspots sit at (256, 192). That is NOT the talking-head composite.
# Each viseme slot is 3×i16: frameIndex, hotspotY, hotspotX on the 512×264
# still (HUD at y=264). Play mode keeps the header offset from (256, 192)
# and moves that hotspot (`FRAMES/sprites.json` `rest`, live `at` on viseme
# frames). Do not bbox-center — open jaws are wider to one side.
```

Then one **row segment** per row:

```
i16 segmentSize
u8  payload[segmentSize]
```

Each payload byte `flag`:

| `flag & 3` | `count = flag >> 2` | Action |
|---|---|---|
| `bit0=1, bit1=1` | copy `count` unique palette indices from the stream (RGBA, alpha 255) |
| `bit0=1, bit1=0` | `count` transparent pixels (0,0,0,0) |
| `bit0=0, bit1=1` | repeat the **next** palette index `count` times |
| `bit0=0, bit1=0` | copy `count` pixels from the previous row |

Output is top-to-bottom RGBA. We clip a run that would overflow the
current row (a few Dust sprites do).

Proven: Bolivar `FRAMES/Background/frame_4.png` decodes at 512×264
and EXTRA writes Jenix `stand/frame_195.png`.

CST in-world bodies include a photographed **contact shadow** under the
feet. Detect **per actor** from stand frames: a dark maroon index
(`8 ≤ max(rgb) ≤ 50`) with ≥80% of its pixels in the bottom quarter.
Skip unused/black (`max(rgb) < 8`) — Help's **legs** are palette index 0
(unused 0xFFFF, collapsed to black on the SET still) and are clothes,
not a matte. The robe body is other greens. **INVEN** HUD items sample
unused pal 0 as VGA black (gun leather grain), same still-blit as CST.
Unused→white was the salt dump. Codec skip is the hole.
HOUSE avatar pupils stay. GANG Leroy/Jones use
index **131** RGB `(25, 17, 17)`; Todd/Oona/Watson use **132**. Flood-fill
from the bottom edge of the sprite; write that blob as translucent
black (`alpha` 120). Body pixels of the same index stay **opaque**
(Help's dark folds). Opaque maroon under the feet looks like studio
dirt (same family of mistake as a flat PUP Background fill). PUP
talking-heads do not use this. Re-dump: `python cli.py --type cst --frames`.

`pos_x` / `pos_y` are the top-left of the sprite on the **512×384**
DreamFactory stage (SET stills occupy y=0…264; HUD chrome is the
bottom 120). Frame dumps now write that placement next to the PNGs:

- PUP: `FRAMES/sprites.json` (`layers.<Part>[]`)
- CST: `sprites.json` (`actors.<Name>.<pose>[]`)
- PRP: `x`,`y`,`w`,`h` on each `props.json` row, plus `sprites.json` sidecar

Bolivar/Leroy backgrounds sit at `(0, 60)` — a 264-tall plate centered
on 384. Some plates are real rooms (Bolivar, Help2 shop); Leroy/Jenix are a
flat studio fill, so play mode keeps the SET still behind the puppet.
Outdoor Help1/Dell1/Cobb visemes set Background **`-1`** (no plate). That
index is authored per PUP viseme track — do not reuse another character’s
`idle 1` (`Background: 0` on Help1 is the shop interior PNG). Play:
[`src/play/README.md`](../../src/play/README.md) § PUP viseme tracks.
Paint **Body then Head** (table order). Head includes the beard; a
Body-over-Head composite left a front-facing beard ring that did not
turn. Face
parts (`Head`, `Jaw`, `Eyes`, `Nose`, `Eyebrows`) share that stage.
`Left` / `Right` / `Hands 1` / `Hands 2` are viseme-driven gesture overlays
(often `-1` / hidden at rest; some puppets rest with a hand up). Missing
face folders are skipped. CST frame records store **pose +8** and **deg
+0x28**; play picks the closest deg, not `octant % n`. Most strips are 8
facings at 32° per pose (front, ¾, side…). The dog is 7 plates at 16°
around south. Sidecar fields: `pose`, `deg`.

NEW.FLT button rects are Mac `{top, left, bottom, right}` in 512×384.
Mainpanel HUD: `map` (left), `horn` (skull), `self` (portrait).

## Indexed stills (SET walks, MOV cutscenes, FLT boards)

DFET: `getRawImageData`. In-house codec (mrxstudios called it Huffman-ish).
Used for 512×264 (sometimes 512×384) 8-bit images.

MOVPLAY (and DFET) keep **one framebuffer**. Skip spans and “copy from
prior” read whatever is already there. Mid-file MOV scene headers are
palette + frame table, not pictures — skip them **without** clearing
prior. INTRO still 461 is a delta from the previous scene; treating the
header as a failed image used to punch 300 black pixels.

Each MOV scene header also has its own 256-entry palette at offset
**62** (`0x3E`). MOVPLAY copies it into the hardware palette at scene
load. Export RGB / PNG with that scene’s palette, not container 0’s.

`--video` letterboxes mixed 512×384 / 512×264 reels (TIPRE) onto one
canvas and pads odd sizes even (NITEWARN 516×265) for x264. PNG
`FRAMES/` stay native size.

Header:

```
i16 height
i16 width
```

Then **one row command** (`param = next_byte >> 2`) followed by spans
until the row is `width` pixels.

Row `param`:

| param | Effect |
|---|---|
| 1 | Copy `width` raw pixels, then still compute lookup |
| ≤ 5 | `look = width * (6 - param)` |
| ≤ 9 | `look = width * (5 - param)` |
| 10 | Skip row (leave zeros / previous image) |
| ≤ 14 | Copy previous row at `width * (15 - param)` |
| ≤ 18 | Copy previous row at `width * (14 - param)` |
| else | Error |

Spans: `mode = byte & 7`, `count = byte >> 3`. If `count == 0`,
`count = 32 + next_byte`.

| mode | Effect |
|---|---|
| 2 | Skip (advance without write; zeros in a fresh buffer) |
| 3 | Copy `count` from `dst - look` (`look` may be **negative**: read *ahead* into not-yet-overwritten prior-frame rows). Skipping those writes speckled sky onto the L7 sheriff wall. |
| 4 | Repeat last pixel |
| 5 | Literal `count` bytes |
| 6 | Repeat next literal `count` times |
| 7 | Copy from `dst - u16` |
| 0 / 1 | Delta span (flag bitstream; mode 0 writes one literal first) |

Delta-span flag window matches DFET: load four peeked bytes as a 32-bit
word with the first two in the high half, consume two, refill when
`bitPos < 0`. This path is the fragile one. It decodes APOTH / TOWN /
most MOVs; it still fails some Yunni-box frames (`BOXOPEN.MOV`,
`BOXCLOSE.MOV`) and leaves a thin garbage stripe on the right edge of
some stills.

Optional Z-buffer after the color image: `height` × `u16` scanline
offsets, then runs of `(count, depth)`. **Offsets are from the start
of the Z table** (first offset is `height * 2`, i.e. just past the
table). DFET-style `data_start + offset` overshoots Dust stills.
`decode_indexed_image(..., decode_z=True)` parses that. A default
`python cli.py` writes `FRAMES/z/*.png` (8-bit grayscale) next to the
color stills. `--z` without `--frames` writes depth only. Dust Z is
1–24 (24 = sky; 0 unused). South-gate road is 3 at your feet … 7 up
the street. Play compares that plane to the actor’s EXE sprite Z so a
closer fence hides the body. TOWN/NITE stills have a real plane
(dozens of depth values, never zero on sampled HQ frames). TARGET too
(gallery 4, near cactus 3, sky 24 on the 10,11 S HQ). Skip Z and the
pig/chicken paint through the machine.

**Previous frame.** DFET keeps one decode buffer and never clears it.
Skip spans (mode 2 and row param 10) therefore leave the last still’s
pixels in place. We pass `prior=` the previous frame’s 8-bit buffer
when walking a SET transition or a MOV in container order. Without
that, Yunni-box open/close stills fail and walk cycles lose temporal
cohesion.

SET strips that share a container id must **not** share that buffer or
a single `frame_<id>.png` (O7→N7 walk and an N7 turn both touch 1640).
Each strip starts from a clean prior; files are `{frame0}_{offset}.png`.

Skip on a clean prior is a **black hole**, not missing art we can
recover. `_NITE` is a second filming **and a second palette** (TOWN and
NITE share only unused 0 and stored-black 255). Feeding NITE as `prior=`
does not resurrect day pixels. Do not inpaint skip holes.

Day sky in `_TOWN` is index **116** `(102, 127, 193)`. That color in
window panes / pale posters is in the film. Index **0** (unused → black)
dithers some saloon glass.

**Ox skull (O7 north, also O8 / N7 south).** Not a skip hole. Highlights
are index **255** (stored `(0,0,0)`; stills emit white). The bone body is
index **2** cream `(217, 193, 156)`, not dirt. Night paints the skull
with real grays and does not use 255.

Tests: `test_still_palette_forces_vga_ends` (O7 `1640_5`),
`test_l7_turn_wall_is_not_sky` (containers 2866–2871). Re-dump SET
frames after any decode or palette change (`python cli.py --type set --frames`
overwrites SET PNGs).

## How big the stills are

Dust kept **one** 512×264 **8-bit** framebuffer (~135 KB) and a ~60 MB
delta SET (`TOWN.SET`). We write each strip frame as a **paletted PNG**
(`PLTE` = `still_plte`). The browser expands that on load. See
[performance.md](performance.md).

| Form | Town outdoor (`_TOWN`, 3155 frames) |
|---|---|
| `TOWN.SET` on the CD (delta, indexed) | ~60 MB |
| Our PNG dump (complete frames, paletted) | ~half the old RGBA dump; ~19 KB vs ~38 KB per still in a TOWN sample |
| Older RGBA PNG dump (before paletted write) | ~115 MB |
| Raw 8-bit indices, every frame resident | ~426 MB |
| Decoded RGBA / WebGL, every frame resident | ~1.7 GB |

1.7 GB is “all stills as 32-bit textures,” not the film. `_NITE` is
another ~55 MB SET and a second paletted dump. The remake currently
fetches PNGs over HTTP and keeps ~80 GPU textures. Do not treat
RGBA-resident-all as a requirement.

## How to identify a still vs a sprite vs audio

| First bytes | Typical size | Codec |
|---|---|---|
| `08 01 00 02` (264×512) | 10–80 KB | Indexed still |
| `80 01 00 02` (384×512) | large FLT board | Indexed still |
| small `i16,i16` under 256×256 | hundreds of bytes | Transparent sprite |
| `00 00 01 00` + rate at +28 | varies | Audio, not an image |
