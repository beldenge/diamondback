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
  diagram (A2/B2/C2 walkable). TOWN/NITE/TARGET also have a valid
  **suffix** table (129 scenes, rows G–O). The real table is 225
  (15×15, A1–O15). We keep the longest well-formed candidate.
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
- SET strips that share a container id must decode separately
  (`{frame0}_{offset}.png`). Row `look` may be **negative**; DFET copies
  ahead into the previous framebuffer (L7 sheriff wall was sky speckles
  when we no-op’d that).
- Indexed stills force VGA ends like DFET’s BMP writer: index 0 black,
  **255 white**. Dust stores 255 as `(0,0,0)`; that was the black ox
  skull. The bone body is palette index 2 cream. PUP/CST sprites do not
  use that override.
- Still **size**: `TOWN.SET` ~60 MB of 8-bit deltas; dump is paletted
  PNG (about half the old ~115 MB RGBA dump). Raw 8-bit all frames
  ~426 MB; all-resident RGBA ~1.7 GB. Dust held one 512×264 index
  buffer (~135 KB). `_NITE` is a second SET (~55 MB) and palette, not
  a prior for `_TOWN`. Extract speed: [performance.md](performance.md).

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

`../out` (2026-08-18): 39 puppets, ~640 script txt, ~4,300
WAV, ~30,000 PNG after SET/MOV, and all playable SET / FLT / PRP / MOV.

## Limits (do not pretend these are done)

1. **SET/MOV stills reuse the previous framebuffer** (DFET does not
   clear its decode buffer). Walk cycles and Yunni-box open/close need
   that. A faint right-edge artifact can still appear on some stills.
2. **`MOVIES/ZUNUSED/`** (11 files) are not `LPPALPPA`. Skipped.
3. **Z-buffers** for SET stills exist after the color image. The extract
   path does not decode them (`decode_z=False`) and does not write Z PNGs.
4. **Opcode table** is Titanic 4.0. Fine so far; re-audit from `DF.EXE`
   if you see `cmd_NNNN` in a script.
5. Old un-namespaced folders (`out/_JENIX`, …) and old flat
   `FRAMES/frame_N.png` under PRP may remain from early runs. Canonical
   PRP art is `FRAMES/<Item>/<state>/`.
6. Pre-fix `out/SET/_TOWN` dumps may only have rows G–O in
   `scenes.json`. Re-run `--scripts --type set` on TOWN/NITE/TARGET.
7. Some stills still have **skip-coded holes** (mode 2 on a fresh
   prior). That is missing source, not a palette bug. Do not inpaint.
   Re-dump after any decode change.
8. Day-only blue on glass/posters is often **sky index 116**
   `(102,127,193)` written into those pixels. Night is a second filming.
   Index 0 (unused → black) dithers some saloon window panes. Do not
   remap those to invented tans/whites.

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
- Extract speed leftovers (Cython decoder, worker caps):
  [performance.md](performance.md).
