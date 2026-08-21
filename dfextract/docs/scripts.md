# Scripts

DreamFactory scripts are **not compressed**. They are a stream of 8-byte
tokens plus a Pascal-string table at the end of the same container.

Primary writeup:
[mrxstudios, 2021-03-05](https://mrxstudios.home.blog/2021/03/05/reverse-engineering-dust-uncovering-game-scripts/).

Implementation: `script.py`, `opcodes.py`. Pretty-print rules match
DFET `DFscript.cpp`.

## Token

Each token is 8 bytes:

| Bytes | Field | Meaning |
|---|---|---|
| 0–1 | `u16 cmd` | Opcode or one of the four special types |
| 2–5 | `u32 info` | Payload. For Dust this is usually a zero-extended `u16` |
| 6–7 | `u16 unknown` | Always 0 in files we have seen. Printed as `[UNKNOWN VALUE]` if set |

`cmd == 0` ends the stream.

Special `cmd` values (same as the blog’s flags A–D):

| cmd | Name | `info` |
|---|---|---|
| 3 | STRING | Relative offset from **this token** to a Pascal string. Printed in quotes |
| 4 | INTEGER | Integer literal (unsigned in DFET; negatives are `minus` + number) |
| 5 | VARIABLE | Relative offset to a Pascal string. Printed bare |
| 6 | BREAK | Newline, then `info` tab characters of indent |

Everything else is looked up in `opcodes.py` (`SCRIPT_COMMANDS`), which
was generated from DFET `DFscript.h` (DreamFactory 4.0 table). Dust uses
the same IDs for the commands we care about (`puppetspeak` = 12043,
`code` = 4001, `(` = 4018, …). Unknown IDs print as `cmd_<id>`.

A script container is recognized by a first token of `4001` (`code`).

## Pascal strings

```
u8 length
u8 chars[length]    # latin-1
```

For STRING/VARIABLE, the string lives at `token_offset + info` inside
the same container. Example from the blog / `JENIX.PUP` day1 (after the
8-byte block header):

```
token at data+0:  cmd=5  info=1432  → "PRAIRIE"
token at data+8:  cmd=5  info=1432  → "WOMAN"
token at data+16: cmd=3  info=1430  → "JENIX"   (quoted: parameter)
```

`8 + 1432 = 1440` in the blog dump because that dump includes the
block header.

## Pretty-print quirks (ported from DFET)

- `(` (4018) and `-` (8002) get **no** trailing space, so you see
  `runyoself ()` and `puppetevent (-1)`.
- `)` and `,` eat a preceding space.
- ` /` followed by another `/` becomes `//` (comment-ish).
- BREAK replaces a trailing space with a newline, then writes tabs.

## Opcode table

`opcodes.py` is the DFET map (351 entries). Regenerate from the sibling
clone if it ever changes:

```
# historically: parse {id, "name"} from D:\dev\DFET\libs\DFfile\DFscript.h
```

`dustdecompile` recovers Dust's own name/id table from `DF.EXE` (packed
6-byte records). The 4.0 names in this file still match most printed
Dust scripts; a few Dust verbs differ (`makeball` not `makecricket`,
`sendtofloor` not `sendtopainting`). `puppetspeak` ASCII is at file
offset 277700.

## We do not encode

There is no text→binary writer. The remake VM should parse the sidecar `*.json` token streams (Dust
names, `kind` / `cmd` / `value`). `.txt` is the human dump and still
prints Titanic 4.0 names. Writing DreamFactory bytecode would only help
patch the original `DF.EXE` game.

**Names are not a language spec.** Dust’s own table and the verb
protocols (dialogue, clicks, plugins) are in
[`dustdecompile/docs/findings.md`](../../dustdecompile/docs/findings.md)
and [`dustdecompile/docs/handbook.md`](../../dustdecompile/docs/handbook.md).
Remaining holes: [reconstruction-gaps.md](reconstruction-gaps.md).
