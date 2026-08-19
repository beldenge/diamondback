# Container format (`LPPALPPA`)

Every Dust game file except movies in `ZUNUSED` and the executables is a
DreamFactory container file. Windows files are **little-endian**.

Implementation: `container.py`, ported from DFET
`DFfile::readFileIntoMemory`.

## File header (1024 bytes)

| Offset | Type | Field |
|---|---|---|
| 0 | u32 | FourCC. Dust files usually store `0x00010000` |
| 4 | u32 | File size in bytes (matches `len(file)` on good copies) |
| 8 | u32 × 3 | Unknown. Often `(0, 0, 256)` |
| 20 | u32 | `containerCount` |
| 24 | u32 | `type` (0, 1, or 2). Affects dummy-container rules |
| 28 | u32 | `gapWhere`. Dummy index for type 1/2 |
| 32 | 8 bytes | Magic **`LPPALPPA`** |
| 40 | rest | Unused / padding to 1024 |

Sanity check used by the tool and by DFET: `file[32:40] == b"LPPALPPA"`.

Example, `JENIX.PUP`:

```
size=1193664  fourcc=65536  containers=119  type=0  gap=0
```

## Offset table

Immediately after the 1024-byte header:

```
u32 offsets[containerCount]
```

Each entry is an absolute file offset of that container, or a dummy
(see below).

## Container payload

At a real offset:

```
i32 id
u32 size
u8  data[size]
```

`container.data` in our code is **only** `data`. It does **not** include
the 8-byte id/size prefix. Script relative offsets and image headers
are measured from the start of `data`.

The blog hex dumps of script blocks include that 8-byte prefix
(`2f 00 00 00` = id 47, then size). Add 8 when comparing blog offsets
to `container.data`.

## Dummy containers

DFET:

- `type == 1`: index `gapWhere` is dummy
- `type == 2`: indices `gapWhere - 1` and `gapWhere` are dummy
- `type == 0`: offset `<= 1024` is dummy

Dust `MAYOR.PUP` and `NED.PUP` are `type == 2` **and** have extra
`offset == 0` holes. DFET’s own comment says zero offsets are empty
but the C++ only special-cases `gapWhere`. We treat **any offset
≤ 1024 as dummy**, for every type.

Dummy payload is 8 zero bytes. Callers must tolerate that.

## Version byte

Most type handlers read engine version as:

```
i32 version = container[0].data + 2
```

Dust is **1**. Titanic is **4**. DFET refuses SET/MOV when this is not 4.
We do the opposite: Dust-only.

## How to walk a file by hand

```
python -c "import sys; sys.path.insert(0, r'dfextract');
from pathlib import Path
from container import read_df_file
df = read_df_file(Path(r'sources/dust.dbgl/dosroot/0/dust/DUSTCD/PUPPETS/JENIX.PUP'))
print(df.container_count, df.type, len(df.containers[0].data))
print(df.containers[2].id, df.containers[2].size)
"
```
