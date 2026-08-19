# Images

Two codecs. Palette is shared.

Implementation: `image.py`. PNG write uses Pillow.

## Palette

`ColorPalette` is 8 bytes, 256 entries:

```
i16 index
i16 R, G, B     # 8.8 fixed point; we take the high byte
```

`R == G == B == -1` (`0xFFFF`) means “unused”; we emit black.

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
i16 rawY     # DFET: posY = 192 - rawY   (384/2)
i16 rawX     # DFET: posX = 256 - rawX   (512/2)
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

## Indexed stills (SET walks, MOV cutscenes, FLT boards)

DFET: `getRawImageData`. In-house codec (mrxstudios called it Huffman-ish).
Used for 512×264 (sometimes 512×384) 8-bit images.

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
| 3 | Copy `count` from `dst - look` |
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
offsets, then runs of `(count, depth)`. We decode it when the remaining
bytes look valid; we do not yet write Z PNGs.

**Previous frame.** DFET keeps one decode buffer and never clears it.
Skip spans (mode 2 and row param 10) therefore leave the last still’s
pixels in place. We pass `prior=` the previous frame’s 8-bit buffer
when walking a SET transition or a MOV in container order. Without
that, Yunni-box open/close stills fail and walk cycles lose temporal
cohesion.

## How to identify a still vs a sprite vs audio

| First bytes | Typical size | Codec |
|---|---|---|
| `08 01 00 02` (264×512) | 10–80 KB | Indexed still |
| `80 01 00 02` (384×512) | large FLT board | Indexed still |
| small `i16,i16` under 256×256 | hundreds of bytes | Transparent sprite |
| `00 00 01 00` + rate at +28 | varies | Audio, not an image |
