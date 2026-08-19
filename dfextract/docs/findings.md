# Findings, sources, and limits

## Why this tool exists

`SPEC.md` is a browser remake of **Dust: A Tale of the Wired West**
(1995, Cyberflix / DreamFactory), not *Dust: An Elysian Tail*.

DFET (M3tox) extracts Titanic and, partially, Dust PUP/CST/SND.
Its Dust SET and MOV paths **hard-fail** unless container-0 version is
4. It has no FLT or PRP handler.

This tool **replaces DFET for Dust**. It is CLI-only, GPL-3 where it
ports DFET codecs, and lives in `dfextract/` so it does not
infect the remake tree. We do not keep or test against DFET output.

## Sources we used

| Source | What we took |
|---|---|
| [mrxstudios 2021-03-05](https://mrxstudios.home.blog/2021/03/05/reverse-engineering-dust-uncovering-game-scripts/) | Script tokens, relative Pascal offsets, `DF.EXE` opcode table idea, Jenix gold listing |
| [mrxstudios 2022-04-25](https://mrxstudios.home.blog/2022/04/25/reverse-engineering-dust-game-locations-and-map-layout/) | SET block kinds, 32-byte scene records, 50-byte waypoints, 28-byte framelist, 6 frames per transition, 255-unit tiles |
| [M3tox/DFET](https://github.com/M3tox/DFET) (local `D:\dev\DFET`) | `LPPALPPA` reader, script pretty-printer + 4.0 opcode map, ADPCM v40/v41, both image codecs, PUP/CST/SND/BOOT Dust branches |
| ResHax / ZenHAX thread | Only a pointer back at the 2021 blog. No extra layouts |
| Dust `DF.EXE` | Confirmed opcode ASCII still present (`puppetspeak` @ 277700). Not parsed as a table |

mrxstudios never published the SET still codec (he said it was
Cyberflix in-house Huffman). DFET already had it for Titanic
(`getRawImageData`). That function is what decodes Dust SET/MOV/FLT
stills.

## What we proved

- Script tokens + DFET 4.0 names reprint Dust source. Jenix day 1
  matches the blog (`actorowner ("JENIX", "gavemoney")`).
- PUP dialogue at 2160 / 312-byte records is the same in Dust and Titanic.
- Dust PUP faces are one stance, 11 tables in container 3.
- `MAYOR.PUP` / `NED.PUP` are type-2 files with extra offset-0 holes.
- CST actor table at `0x938` works on EXTRA, GANG, TARGET, MINE.
- SND v1 name table and loop playlist decode (`anvil` at 22050 Hz).
- SET grid at the **end** of container 0; APOTH 3×3 matches the blog
  diagram (A2/B2/C2 walkable).
- SET header `+30` = framelist container, `+34` = waypoint container,
  `+8` = framelist count (blog’s “offset 16” was off by 4 once you drop
  the block prefix).
- Framelist records really are 6 frames starting at `frame0`.
- Indexed stills are 512×264 (walk/cutscene) or 512×384 (some FLT HUDs).
- Transparent sprite codec decodes PUP faces and CST bodies (Bolivar
  background 512×264; EXTRA Jenix `stand`).
- MOV v1 is the same container file; audio clips are ordinary v40/v41
  containers mixed in with stills.
- FLT/PRP are the same container + script token + the two image codecs.
  No new magic.

## Comparison with DFET (Dust)

| | DFET 0.89 | dfextract |
|---|---|---|
| PUP / CST / SND / BOOT | Yes | Yes |
| SET | Refuses version ≠ 4 | Grid, waypoints, scripts, stills |
| MOV | Refuses version ≠ 4 | Stills + audio |
| FLT / PRP | No handler | Scripts + images |
| Titanic SHP/STG/TRK/11K/SFX | Yes | Out of scope |
| Script encoder | Yes | No (not needed for the remake) |
| GUI | Yes | CLI only |

`dfextract/out` (2026-08-18): 39 puppets, ~640 script txt, ~4,300
WAV, ~30,000 PNG after SET/MOV, and all playable SET / FLT / PRP / MOV.

## Limits (do not pretend these are done)

1. **SET/MOV stills reuse the previous framebuffer** (DFET does not
   clear its decode buffer). Walk cycles and Yunni-box open/close need
   that. A faint right-edge artifact can still appear on some stills.
2. **`MOVIES/ZUNUSED/`** (11 files) are not `LPPALPPA`. Skipped.
3. **Z-buffers** for SET stills are parsed when they look valid but not
   written out.
4. **Opcode table** is Titanic 4.0. Fine so far; re-audit from `DF.EXE`
   if you see `cmd_NNNN` in a script.
5. Old un-namespaced folders (`out/_JENIX`, …) and old flat
   `FRAMES/frame_N.png` under PRP may remain from early runs. Canonical
   PRP art is `FRAMES/<Item>/<state>/`.

## License

DFET is GPL-3. The script decoder, ADPCM tables, and both image codecs
are derivative of that library. Keep `dfextract/` isolated.
Extracted game assets are Cyberflix data, not GPL.

## Suggested next work (not extraction)

- Fix the still-codec refill so Yunni-box and the right edge clean up,
  then re-dump SET/MOV frames.
- Emit a JSON AST of scripts (tokens, not just pretty text) for the
  remake dialogue graph.
- Write Z-buffer previews.
- Ignore or separately catalog `ZUNUSED`.
