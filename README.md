# Diamondback

Browser rebuild of *Dust: A Tale of the Wired West*, plus a DreamFactory extractor.

Non-commercial fan reconstruction. Not a port of CyberFlix’s engine. Playable client is Three.js; original scripts are hand-ported, not interpreted.

## Run the town (slice 1)

```
npm install
npm test
npm run dev
```

Open http://localhost:5173 — click to look, WASD to walk, hotel bed to sleep until morning.

Optional: `?view=street` or `?view=hotel`, and `?clock=1|2|3` (morning / afternoon / night).

## Extract original assets

You need a local Dust install under `sources/dust.dbgl/`. Then see [`dfextract/README.md`](dfextract/README.md). Output goes to `dfextract/out/` and is **not** committed.

## Not in git

Original CD / DOSBox tree, extracted PNG/WAV, and `dfextract` output stay on disk only (copyrighted; too large for GitHub). The spec and extractor source are enough to reproduce a dump if you have the game.

## Spec

Decisions, slices, and the asset pipeline: [`SPEC.md`](SPEC.md).
