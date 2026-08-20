# Diamondback

Browser rebuild of *Dust: A Tale of the Wired West*, plus a DreamFactory extractor.

Non-commercial fan reconstruction. Not a port of CyberFlix’s engine. Playable client is Three.js; original scripts are hand-ported, not interpreted.

## Run the town (slice 1)

```
npm install
npm test
npm run dev
```

Open http://localhost:5173 — **original stills** (the real Diamondback views).

- **← →** or **A/D** — turn
- **↑** or **W** — walk forward
- **N** — day ↔ night stills (does not change the day number)
- Click the left / right / top of the picture to turn or walk
- **Click a door**, then walk forward to go inside (if it is openable)

Graybox free-roam (the old 3D boxes): http://localhost:5173/?mode=free

Optional: `?clock=1|2|3` (morning / afternoon / night). Free-roam also has `?view=street` or `?view=hotel`.

## Extract original assets

You need a local Dust install under `sources/dust.dbgl/`. Then see [`dfextract/README.md`](dfextract/README.md). Output goes to `dfextract/out/` and is **not** committed.

## Not in git

Original CD / DOSBox tree, extracted PNG/WAV, and `dfextract` output stay on disk only (copyrighted; too large for GitHub). The spec and extractor source are enough to reproduce a dump if you have the game.

## Spec

Decisions, slices, and the asset pipeline: [`SPEC.md`](SPEC.md). How the
town stills play (strips, HQ, ~24 fps flipbook, doors):
[`src/world/set/README.md`](src/world/set/README.md). Extract still
codec and palette: [`dfextract/docs/images.md`](dfextract/docs/images.md).
