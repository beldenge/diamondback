# Audio

Dust speech and ambient loops are a custom ADPCM. DFET calls the two
variants `audioDecoder_v40` (8-bit) and `audioDecoder_v41` (16-bit).
Implementation: `audio.py`. Tables are copied from DFET `DFfile.cpp`.

## Container header

An audio container starts with signature `00 00 01 00` (`i32` at 0 =
`0x00010000`) and then:

| Offset | Type | Field |
|---|---|---|
| 0x1A | i16 | `codec_flag`: 1 = v40 (8-bit), anything else treated as v41 |
| 28 | i32 | Sample rate (11025 or 22050 in Dust) |
| 36 | i32 | Uncompressed PCM size in bytes |
| 44 | i32 | Offset from the **start of the container** to compressed samples |

Mono only. We write a plain PCM WAV (no DFET LIST/INFO chunk).

Detection used for MOV clips: signature `0x00010000` and
`8000 <= hertz <= 48000`. SET stills start with height/width
(`08 01 00 02` = 264×512) and never look like this.

## v40 (8-bit)

`codec_flag == 1`. Output is unsigned-looking 8-bit PCM where each
sample is `int8_value + 0x40`.

Three modes, decided by the next compressed byte `b`:

| Condition | Mode |
|---|---|
| `(b & 0x80) == 0` | Literal: emit `b + 0x40`, remember `b` |
| `(b & 0x40) == 0` | Table expand: `count = b & 0x3F`, then a do-while that reads one byte, applies `StepSizeTable` / `IndexTable` (signed int8), emits two samples |
| else | Run: emit `(b & 0x3F) + 1` copies of `prev + 0x40` |

The two 256-byte tables live in `audio.py` (`_STEP_SIZE`, `_INDEX`),
interpreted as signed int8 (`0xF8` = -8, etc.).

Sanity: after decode, the write pointer must land exactly on
`uncompressed_size`.

## v41 (16-bit)

`uncompressed_size / 2` samples. Each input byte:

- high bit 0: signed delta `(byte << 9)` then arithmetic `>> 4`, add to
  current sample
- high bit 1: absolute sample `(byte << 9)` truncated to int16

## Where audio lives

| Source | How we find clips |
|---|---|
| **PUP** | Dialogue table: each line has `audio_container` (see [file-types.md](file-types.md)). One WAV per unique container, named after the ident (`jenix.5.wav`) |
| **SND** | Dust v1 name table in container 0 (offset 186, 24-byte records). Combined loop: playlist of `i16` at offset 30, chunks start at header `+24`. Combined name is the Pascal string at 158 |
| **MOV** | Every container that matches the audio signature. Named `clip_<index>.wav` |

SND extras, from DFET `DFsnd.h` version-1 path:

```
i16 chunksStart            @ 24
i16 chunksCountUniqueAudios @ 26
i16 chunksCount            @ 28
i16 playlist[chunksCount]  @ 30
i32 singleCount            @ 174
Pascal name                @ 158   # combined / bed
Pascal names               @ 186   # 24 bytes each, until chunksStart
```

Singles are containers `1 .. chunksStart`. Combined PCM is the
concatenation of `containers[chunksStart + playlist[i]]`. Hertz is
taken from the first chunk, then raised to `chunksStart+1` if that
rate is higher (DFET quirk, preserved).

TOWN.SND example: 15 singles (`anvil`, `birdsing`, …) plus combined
`town.snd.wav`.
