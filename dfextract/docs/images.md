# Images

Two codecs. Palette is shared.

Implementation: `image.py`. PNG write uses Pillow. SET/MOV/FLT stills
are written as **8-bit paletted PNGs** (`IHDR` color type 3). The `PLTE`
chunk is the still palette with DFET VGA ends (index 0 black, 255 white),
so a viewer expands to the same RGB as `still_rgba`. PUP/CST sprites stay
RGBA because they have real per-pixel alpha.

## Palette

`ColorPalette` is 8 bytes, 256 entries:

```
i16 index
i16 R, G, B     # 8.8 fixed point; we take the high byte
```

`R == G == B == -1` (`0xFFFF`) means “unused”. DF.EXE `0x423e59` does
`sar r16, 8` on those 8.8 channels, so the high byte is **255 (white)**.
DFET wrote unused as `(0,0,0)` — that was the INVEN HUD “black spots”
(HELP letter counters, gun leather flecks). Trans sprites now follow
the EXE (white) unless a caller passes `unused_rgb=(0,0,0)`.

SET/MOV/FLT **stills** follow DFET’s BMP VGA ends: index **0 is always
black**, index **255 is always white**. Dust stores 255 as `(0,0,0)` in
the ColorPalette; using that value made the O7 ox skull a black hole
while `_NITE` (which paints the skull with real tan/gray indices) looked
fine. CST world actors keep unused→black: they index-blit onto that
8-bit still (Help’s legs are pal 0). INVEN HUD items are RGB-expanded
and sample pal 0 as white. Codec skip (unwritten index 255) stays
transparent — Dust leaves the framebuffer there (gun outline, butbevel
hole). Do not key pal 0 through the HUD.

Where it lives:

| File | Offset in container 0 |
|---|---|
| PUP | 58 |
| CST | 36 |
| SET / FLT / PRP / MOV | first offset at which indices 0,1,2 appear on an 8-byte stride (`find_palette`) |

On SET, that search hits offset **80**.

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
unused pal 0 as 8.8 `0xFFFF` → white (HELP letter counters, gun flecks) —
opaque, not a hole through the HUD.
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
on 384. Some plates are real rooms (Bolivar); Leroy/Jenix are a flat
studio fill, so play mode keeps the SET still behind the puppet. Paint
**Body then Head** (table order). Head includes the beard; a Body-over-Head
composite left a front-facing beard ring that did not turn. Face
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
`decode_indexed_image(..., decode_z=True)` parses that. Default extract
does not write Z PNGs; `python cli.py --type set --z` writes
`FRAMES/z/*.png` (8-bit grayscale) **without** rewriting color stills.
Pass `--frames --z` to do both. Dust Z is 1–24 (24 = sky; 0 unused).
South-gate road is 3 at your feet … 7 up the street. Play compares
that plane to the actor’s `3/persp` depth so a closer fence hides the
body. TOWN/NITE stills have a real plane (dozens of depth values,
never zero on sampled HQ frames).

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
