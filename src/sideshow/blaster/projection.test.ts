/**
 * End-to-end against the real extract, without a browser.
 *
 * The renderer itself needs a canvas, but everything that decides *where*
 * a chicken lands and *how big* it is comes out of pure functions, so the
 * whole pipeline — real `_TOWN` graph, real flock seeding, real film
 * projection, real sprite sheet — can be checked from Node.
 *
 * Skips when `dfextract/out/` has not been dumped.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CST_SCALE_FIELD,
  cameraFromPose,
  engineStillScale,
  spriteDestRect,
  worldToStill,
} from "../../play/facing";
import { buildSetGraph } from "../../world/set/graph";
import { STILL_HEIGHT, STILL_WIDTH } from "../../world/set/types";
import { BOSSES } from "./bosses";
import { AIM_BANDS, AIM_STEPS, aimState } from "./gun";
import { BIRD_SCALE, seedFlock, walkableTiles } from "./flock";

const OUT = resolve(__dirname, "..", "..", "..", "dfextract", "out");
const TOWN = resolve(OUT, "SET", "_TOWN");
const HAVE_TOWN =
  existsSync(resolve(TOWN, "scenes.json")) && existsSync(resolve(TOWN, "transitions.json"));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function townGraph() {
  return buildSetGraph(
    readJson(resolve(TOWN, "scenes.json")),
    readJson(resolve(TOWN, "transitions.json")),
    { x: 6, y: 14, facing: "N" },
    62,
  );
}

function seeded(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe.skipIf(!HAVE_TOWN)("the flock on the real town graph", () => {
  it("finds the 52 filmed camera tiles", () => {
    const tiles = walkableTiles(townGraph().cameraTiles);
    expect(tiles.length).toBeGreaterThanOrEqual(40);
    expect(tiles.length).toBeLessThan(80);
  });

  it("seeds a wave onto tiles the film actually filmed", () => {
    const graph = townGraph();
    const tiles = walkableTiles(graph.cameraTiles);
    const birds = seedFlock(80, tiles, seeded());
    expect(birds.length).toBeGreaterThan(40);
    const known = new Set(tiles.map((t) => `${t.x},${t.y}`));
    for (const bird of birds) {
      const tx = Math.round((bird.x - 128) / 256);
      const ty = Math.round((bird.y - 128) / 256);
      expect(known.has(`${tx},${ty}`)).toBe(true);
    }
  });

  it("puts birds in front of the lens at the south gate, at a sane size", () => {
    const graph = townGraph();
    const tiles = walkableTiles(graph.cameraTiles);
    const birds = seedFlock(120, tiles, seeded(9));
    // The spawn pose: O7 looking north up Main Street.
    const cam = cameraFromPose({ x: 6, y: 14, facing: "N" }, 62);

    let onScreen = 0;
    for (const bird of birds) {
      const hit = worldToStill({ x: bird.x, y: bird.y, z: 0 }, cam);
      if (!hit) {
        continue;
      }
      onScreen += 1;
      const scale = engineStillScale(BIRD_SCALE, hit.lensForward, CST_SCALE_FIELD);
      // A chicken 60px tall in sheet space must not fill the frame, and
      // must not vanish to a single pixel either.
      const drawn = 60 * scale;
      expect(drawn).toBeGreaterThan(0.5);
      expect(drawn).toBeLessThan(STILL_HEIGHT * 3);
      expect(hit.x).toBeGreaterThan(-64);
      expect(hit.x).toBeLessThan(STILL_WIDTH + 64);
    }
    // Standing at the gate looking up the street, a good share of the
    // flock has to be visible or the mode has nothing to shoot.
    expect(onScreen).toBeGreaterThan(8);
  });

  it("gives a bird up the street a clickable box on the still", () => {
    const cam = cameraFromPose({ x: 6, y: 14, facing: "N" }, 62);
    // Two tiles north of the camera, dead centre.
    const bird = { x: 6 * 256 + 128, y: 12 * 256 + 128, z: 0 };
    const hit = worldToStill(bird, cam);
    expect(hit).not.toBeNull();
    const scale = engineStillScale(BIRD_SCALE, hit!.lensForward, CST_SCALE_FIELD);
    const rect = spriteDestRect(hit!.x, hit!.y, { x: 235, y: 136, w: 42, h: 74 }, scale);
    expect(rect.right).toBeGreaterThan(rect.left);
    expect(rect.bottom).toBeGreaterThan(rect.top);
    // It should sit inside the frame, not off in the wings.
    expect(rect.left).toBeGreaterThan(0);
    expect(rect.right).toBeLessThan(STILL_WIDTH);
  });

  it("does not draw birds standing behind the camera", () => {
    const cam = cameraFromPose({ x: 6, y: 14, facing: "N" }, 62);
    // Well south of the gate: behind the lens, facing away.
    const behind = { x: 6 * 256 + 128, y: 20 * 256 + 128, z: 0 };
    expect(worldToStill(behind, cam)).toBeNull();
  });
});

describe.skipIf(!existsSync(resolve(OUT, "CST")))("sprite paths resolve to real files", () => {
  interface Sheet {
    actors?: Record<string, Record<string, { path: string }[]>>;
  }

  function sheet(cast: string): Sheet | null {
    const path = resolve(OUT, "CST", cast, "sprites.json");
    return existsSync(path) ? readJson<Sheet>(path) : null;
  }

  function framesExist(cast: string, actor: string, pose: string): number {
    const table = sheet(cast)?.actors ?? {};
    const key = Object.keys(table).find((k) => k.toLowerCase() === actor.toLowerCase());
    const frames = key ? (table[key]?.[pose] ?? []) : [];
    let found = 0;
    for (const frame of frames) {
      if (existsSync(resolve(OUT, "CST", cast, frame.path))) {
        found += 1;
      }
    }
    return frames.length > 0 && found === frames.length ? found : -1;
  }

  it("has every chicken walk frame on disk", () => {
    expect(framesExist("_EXTRA", "chicken1", "walk")).toBeGreaterThan(0);
  });

  it("has the five-plate explosion CyberFlix already shipped", () => {
    expect(framesExist("_TARGET", "chickexplode", "chickexplode")).toBe(5);
  });

  it("has every pose each boss asks for", () => {
    for (const spec of Object.values(BOSSES)) {
      for (const pose of spec.poses) {
        expect(
          framesExist(spec.cast, spec.actor, pose),
          `${spec.id} is missing ${spec.cast}/${spec.actor}/${pose}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("really does have Leroy's 32-frame swig", () => {
    expect(framesExist("_GANG", "Leroy", "drink")).toBe(32);
  });
});

describe.skipIf(!existsSync(resolve(OUT, "PRP", "_HOUSE", "props.json")))(
  "PRP props the mode borrows",
  () => {
    interface PropRecord {
      group?: string;
      state?: string;
      path?: string;
      index?: number;
    }

    const props = readJson<PropRecord[]>(resolve(OUT, "PRP", "_HOUSE", "props.json"));

    function states(group: string): Map<string, PropRecord[]> {
      const out = new Map<string, PropRecord[]>();
      for (const rec of props) {
        if ((rec.group ?? "").toLowerCase() !== group || !rec.path) {
          continue;
        }
        const state = (rec.state ?? "").toLowerCase();
        const bag = out.get(state) ?? [];
        bag.push(rec);
        out.set(state, bag);
      }
      return out;
    }

    function allOnDisk(records: readonly PropRecord[]): boolean {
      return records.every((r) => existsSync(resolve(OUT, "PRP", "_HOUSE", r.path!)));
    }

    it("has the powder keg's 15-plate blast, not just a feather puff", () => {
      const explode = states("powderkeg1").get("explode") ?? [];
      expect(explode).toHaveLength(15);
      expect(allOnDisk(explode)).toBe(true);
    });

    it("has a gun hand row for every aim band, fire and recoil included", () => {
      const gun = states("gunhand");
      for (const band of AIM_BANDS) {
        for (const phase of ["aim", "fire", "recoil"] as const) {
          const state = aimState(band, phase).toLowerCase();
          const frames = gun.get(state) ?? [];
          expect(frames.length, `gunhand/${state} is missing`).toBe(AIM_STEPS);
          expect(allOnDisk(frames), `gunhand/${state} has missing PNGs`).toBe(true);
        }
      }
    });

    it("indexes each gun band 0..12 with no gaps", () => {
      const frames = states("gunhand").get("mid") ?? [];
      const seen = frames.map((f) => f.index ?? -1).sort((a, b) => a - b);
      expect(seen).toEqual(Array.from({ length: AIM_STEPS }, (_, i) => i));
    });
  },
);

describe.skipIf(!existsSync(resolve(OUT, "SND")))("sound effects exist", () => {
  function clipPath(clip: { folder: string; name: string }): string {
    // `folder` is either a `SND/` subfolder or a full extract path.
    return clip.folder.includes("/")
      ? resolve(OUT, ...clip.folder.split("/"), `${clip.name}.wav`)
      : resolve(OUT, "SND", clip.folder, `${clip.name}.wav`);
  }

  it("has a hit sound for every boss", () => {
    for (const spec of Object.values(BOSSES)) {
      const path = clipPath(spec.hitSound);
      expect(existsSync(path), `${spec.id} wants ${spec.hitSound.name}.wav`).toBe(true);
    }
  });

  it("gives the people a voice to cry with, not a thump", () => {
    // Hitting a man should not sound like hitting scenery. These are each
    // character's own recording: Leroy's scream, the Kid's "Aaagh!", and
    // the dead man's "Aagghh!" for the shaman.
    for (const id of ["leroy", "kid", "shaman"] as const) {
      expect(BOSSES[id].hitSound.folder).toContain("PUP/");
      expect(existsSync(clipPath(BOSSES[id].hitSound))).toBe(true);
    }
    // Bones and machinery keep an impact.
    expect(BOSSES.skeleton.hitSound.folder).not.toContain("PUP/");
    expect(BOSSES.robot.hitSound.folder).not.toContain("PUP/");
  });

  it("has the chicken pop and the boss sting", () => {
    expect(existsSync(resolve(OUT, "SND", "_TARGET", "chickenhit.wav"))).toBe(true);
    expect(existsSync(resolve(OUT, "SND", "_TARGET", "thistown.wav"))).toBe(true);
  });

  it("has the one recorded line each speaking boss gets", () => {
    for (const spec of Object.values(BOSSES)) {
      const line = spec.arrivalLine;
      if (!line) {
        continue;
      }
      // `folder` is either a `SND/` subfolder or a full extract path.
      const rel = line.folder.includes("/")
        ? resolve(OUT, ...line.folder.split("/"), `${line.name}.wav`)
        : resolve(OUT, "SND", line.folder, `${line.name}.wav`);
      expect(existsSync(rel), `${spec.id} wants ${line.folder}/${line.name}.wav`).toBe(true);
    }
  });
});
