import { describe, expect, it } from "vitest";
import { neighborStillUrls, poseHqUrl, transitionStillUrls } from "./film";
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

  it("depth 1 is this pose's left/right/forward strips plus dest HQs", () => {
    const urls = neighborStillUrls(graph, pose, "_TOWN", 1);
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/10_0.png");
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/10_5.png");
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/20_0.png");
    expect(urls).not.toContain("/extract/SET/_TOWN/FRAMES/40_0.png");
  });

  it("depth 2 includes the dest pose's next turn", () => {
    const urls = neighborStillUrls(graph, pose, "_TOWN", 2);
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/40_0.png");
    expect(urls).toContain("/extract/SET/_TOWN/FRAMES/40_4.png");
  });
});
