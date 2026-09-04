import { describe, expect, it } from "vitest";
import {
  IDLE_NEIGHBOR_DEPTH,
  neighborStillUrls,
  poseHqUrl,
  transitionStillUrls,
  warmUrlsFromSpawn,
} from "./film";
import { buildSetGraph } from "./graph";
import type { SceneRecord, TransitionRecord } from "./types";
import { transitionForInput } from "./walker";

const scenes: SceneRecord[] = [
  { x: 0, y: 1, interact: 0, unknown_c: 0, blocked: 0, unknown_e: 0, name: "Scene B1", script_container: 0 },
  { x: 1, y: 1, interact: 1, unknown_c: 0, blocked: 0, unknown_e: 0, name: "Scene B2", script_container: 0 },
];

const records: TransitionRecord[] = [
  {
    x_from: 0, y_from: 1, dir_from: 3, x_to: 1, y_to: 1, dir_to: 3,
    dir_from_name: "E", dir_to_name: "E", frame0: 10,
  },
  {
    x_from: 0, y_from: 1, dir_from: 3, x_to: 0, y_to: 1, dir_to: 2,
    dir_from_name: "E", dir_to_name: "S", frame0: 20,
  },
  {
    x_from: 1, y_from: 1, dir_from: 3, x_to: 1, y_to: 1, dir_to: 2,
    dir_from_name: "E", dir_to_name: "S", frame0: 40,
  },
];

describe("filmstrip URLs", () => {
  const graph = buildSetGraph(scenes, records);
  const pose = { x: 0, y: 1, facing: "E" as const };

  it("lists five motion plates, not the from-HQ slot", () => {
    const walk = transitionForInput(graph, pose, "forward");
    expect(walk).toBeDefined();
    expect(transitionStillUrls(walk!, "_TOWN")).toEqual([
      "/extract/SET/_TOWN/FRAMES/10_0.png",
      "/extract/SET/_TOWN/FRAMES/10_1.png",
      "/extract/SET/_TOWN/FRAMES/10_2.png",
      "/extract/SET/_TOWN/FRAMES/10_3.png",
      "/extract/SET/_TOWN/FRAMES/10_4.png",
    ]);
  });

  it("uses the outgoing walk +5 as standing HQ", () => {
    expect(poseHqUrl(graph, pose, "_TOWN")).toBe("/extract/SET/_TOWN/FRAMES/10_5.png");
  });

  it("depth 1 is this pose's left/right/forward motion, not standing HQ", () => {
    const urls = neighborStillUrls(graph, pose, "_TOWN", 1);
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/10_0.png");
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/20_0.png");
    expect(urls).not.toContain("/extract/SET/_TOWN/FRAMES/10_5.png");
    expect(urls).not.toContain("/extract/SET/_TOWN/FRAMES/40_0.png");
  });

  it("prefetches every next plate 0 before plate 1", () => {
    const urls = neighborStillUrls(graph, pose, "_TOWN", 1);
    const i0 = urls.indexOf("/extract/SET/_TOWN/FRAMES/10_0.png");
    const i1 = urls.indexOf("/extract/SET/_TOWN/FRAMES/10_1.png");
    const j0 = urls.indexOf("/extract/SET/_TOWN/FRAMES/20_0.png");
    expect(i0).toBeGreaterThanOrEqual(0);
    expect(j0).toBeGreaterThanOrEqual(0);
    expect(i0).toBeLessThan(i1);
    expect(j0).toBeLessThan(i1);
  });

  it("idle prefetch is one tap ahead, not the dest's next turn", () => {
    expect(IDLE_NEIGHBOR_DEPTH).toBe(1);
    const urls = neighborStillUrls(graph, pose, "_TOWN", IDLE_NEIGHBOR_DEPTH);
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/10_0.png");
    expect(urls).not.toContain("/extract/SET/_TOWN/FRAMES/40_0.png");
  });

  it("depth 2 includes the dest pose's next turn", () => {
    const urls = neighborStillUrls(graph, pose, "_TOWN", 2);
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/40_0.png");
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/40_4.png");
  });
});

describe("extract cache warm list", () => {
  const graph = buildSetGraph(scenes, records);
  const spawn = { x: 0, y: 1, facing: "E" as const };

  it("pairs every colour plate with its Z plane", () => {
    const urls = warmUrlsFromSpawn(graph, spawn, "_TOWN");
    for (const url of urls) {
      if (url.includes("/FRAMES/z/")) {
        continue;
      }
      expect(urls).toContain(url.replace("/FRAMES/", "/FRAMES/z/"));
    }
  });

  it("reaches poses a depth-1 prefetch never would", () => {
    const urls = warmUrlsFromSpawn(graph, spawn, "_TOWN");
    // 40 is the dest pose's own turn — two moves out from spawn.
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/40_0.png");
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/z/40_0.png");
  });

  it("includes the standing HQ, which the walker fetches separately", () => {
    const urls = warmUrlsFromSpawn(graph, spawn, "_TOWN");
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/10_5.png");
  });

  it("puts the spawn's own moves before anything further out", () => {
    const urls = warmUrlsFromSpawn(graph, spawn, "_TOWN");
    const near = urls.indexOf("/extract/SET/_TOWN/FRAMES/10_0.png");
    const far = urls.indexOf("/extract/SET/_TOWN/FRAMES/40_0.png");
    expect(near).toBeGreaterThanOrEqual(0);
    expect(far).toBeGreaterThan(near);
  });

  it("never repeats a URL", () => {
    const urls = warmUrlsFromSpawn(graph, spawn, "_TOWN");
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("stops at the limit", () => {
    expect(warmUrlsFromSpawn(graph, spawn, "_TOWN", 4).length).toBeLessThanOrEqual(
      warmUrlsFromSpawn(graph, spawn, "_TOWN").length,
    );
    expect(warmUrlsFromSpawn(graph, spawn, "_TOWN", 0)).toEqual([]);
  });
});
