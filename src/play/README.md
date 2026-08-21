# Play mode (`/?mode=play`)

How the remake runs Day 1 night: original HUD under the stills, CST actors,
and PUP talking-heads driven by extracted scripts. Extract formats live in
[`dfextract/docs/`](../../dfextract/docs/). This file is the **playback**
book so we do not re-debug speech, visemes, or the Firefox audio delay.

Town sandbox (`/`) stays an unlocked stills walker:
[`src/world/set/README.md`](../world/set/README.md).

---

## Stage

Dust’s stage is **512×384**. The still is **512×264**; the HUD is the bottom
**120px** (`FLT/_NEW/frame_3.png`). Do not overlay the HUD on the still.

CST `actordeg` / `currentdeg`: **256 units per turn, 0 = south**. Stand is 8
facings; walk is 8 facings × 8 frames. Actors face the camera and walk toward
the player on talk (`walktopuppet` in `CST/_GANG/Cast`).

Leroy’s first walk on talk is about **198 `forceupdate` frames (~1.2s)**, then
`turntodeg` + `openpuppet` + `puppetspeak` on the same tick. Do not cap the
`while iswalk { forceupdate }` loop so low that the walk never finishes
(256 was too small; 2048 is enough).

Hit-test talk on the actor sprite, not “anyone nearby.” Clicks on empty still
should walk.

---

## Puppet composite

PUP face tables: Background, Body, Head, Eyes, Eyebrows, Nose, Jaw, plus
hands. Paint **Head then Body** so the head sits in the Body face-hole
(knock out opaque black on Body). Skip a flat Background fill (Leroy brown,
Jenix black).

Sprite blit: DFET hotspot is **(256, 192)** on the 384-tall stage. Viseme
extras are **hotspot** `(centerY, centerX)` on the 512×264 still, not bounding-
box centers. Top-left is `cx + headerX - 256`, `cy + headerY - 192`. Do not
bbox-center — talking jaws are wider to one side and that pulls the mouth
left.

Load **per-line** viseme JSON (`AUDIO/visemes/leroy.43.json`), not the
1.8MB `visemes.json` blob. Last viseme tick / 60 matches the WAV length.
Clock is **60 Hz**.

---

## Speech audio (Firefox / Windows)

Dust speech WAVs are **8-bit mono PCM at 11025 Hz** (unsigned, 128 = silence).
Play them through **Web Audio** with our own decoder (`decodePcmWav` in
`speech.ts`). Do not use `decodeAudioData` or `<audio>` for these files.

### What actually happens on a click

1. First `pointerdown` anywhere creates an `AudioContext` and calls
   `resume()`. That starts the OS audio graph. Keep a tiny non-zero looping
   buffer so Firefox does not treat the graph as silence and auto-suspend.
2. On this machine Firefox stays `suspended` for **~10 seconds** after that
   first `resume()`. `BufferSource.start()` is silent until `state ===
   "running"`.
3. Visemes do **not** wait on that. Mouth frames follow **wall-clock from
   speak start** (`t0`), same 60 Hz as the viseme track. If the context
   becomes running mid-line, start the buffer at the current viseme time so
   voice stays in unison.
4. Cancel a pending `resume().then(fire)` when the line ends (`outGen`), or
   a late fire will replay a finished greeting over the choice screen.

So: click the town (or anything) and wait ~10s, then talk, and greetings
have sound. If the **first** click of the session is Leroy, 43/44 finish
before the device is up and those lines are silent; later lines play.

A “click to start” overlay before the town would spend that 10s before
anyone talks. Not implemented.

Do **not** create the `AudioContext` at page load (blocks first paint: white
screen) and do **not** wait until a dialogue choice to `resume()` (that
starts the 10s clock even later, so the first audible line is mid-reply).

### Dead ends (do not retry)

| Approach | What we saw |
|---|---|
| `<audio src="/extract/….wav">` | No `Content-Length` used to stall ~15–18s; even with it, 8-bit 11025 Hz does not advance (`play()` resolves, `paused=false`, `currentTime` stays 0). |
| Blob of the same 8-bit WAV, or 16-bit at 11025 Hz | Same frozen playhead. `duration` can look correct; samples never play. |
| Upsample to 16-bit 44100 Hz for `<audio>` | Header parses (`dur=4.18`); playhead still stuck at 0. |
| Mute/volume-0 “unlock” then unmute later | Firefox does not treat that as audible media; later `play()` is silent. |
| `await ctx.resume()` in `play()` with a 50ms cap | Greetings skipped; resume often completes ~1.3s later. |
| Drive visemes from `AudioContext.currentTime` or `<audio>.currentTime` | Mouth frozen or gated off whenever output is not live. |
| Keep-alive oscillator at gain 0 | Firefox optimizes it out and auto-suspends. |

Ambient bed (`town.snd`) must not `play()` at boot — that autoplay failure
can stall the same device. Cue the bed and start it on a later user click
(`resumeBed`).

---

## Related extract docs

- PUP viseme bytes / 60 Hz: [`dfextract/docs/reconstruction-gaps.md`](../../dfextract/docs/reconstruction-gaps.md)
- Speech ADPCM → WAV: [`dfextract/docs/audio.md`](../../dfextract/docs/audio.md)
- Sprite hotspots: [`dfextract/docs/images.md`](../../dfextract/docs/images.md)
