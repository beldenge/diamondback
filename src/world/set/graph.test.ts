import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSetGraph,
  cameraZOf,
  holdFrame,
  hqFrame,
  parseDir,
  resolveSpawn,
  sceneByName,
  SET_CAMERA_Z,
  SET_SPAWN,
  setFolderFromWorld,
  setNamesEqual,
  framesFolder,
  zUrlFromStill,
} from "./graph";
import {
  applyTransition,
  isSwipePointer,
  isTileStep,
  stillClickInput,
  stepPose,
  queuedWalk,
  swipeWalkInput,
  transitionForInput,
  turnFacing,
  walkInputFromCode,
  walkInputFromKeys,
  walkInputKey,
} from "./walker";
import { framesToPlay, STILL_FRAME_SEC, type SceneRecord, type TransitionRecord } from "./types";

const fixtureScenes: SceneRecord[] = [
  { x: 0, y: 1, interact: 0, unknown_c: 0, blocked: 0, unknown_e: 0, name: "Scene B1", script_container: 0 },
  { x: 1, y: 1, interact: 1, unknown_c: 0, blocked: 0, unknown_e: 0, name: "Scene B2", script_container: 0 },
];

const fixtureTrans: TransitionRecord[] = [
  {
    x_from: 0, y_from: 1, dir_from: 3, x_to: 1, y_to: 1, dir_to: 3,
    dir_from_name: "E", dir_to_name: "E", frame0: 10,
  },
  {
    x_from: 0, y_from: 1, dir_from: 3, x_to: 0, y_to: 1, dir_to: 2,
    dir_from_name: "E", dir_to_name: "S", frame0: 20,
  },
  {
    x_from: 0, y_from: 1, dir_from: 1, x_to: 0, y_to: 1, dir_to: 3,
    dir_from_name: "N", dir_to_name: "E", frame0: 30,
  },
];

describe("tile vs turn", () => {
  it("does not treat an in-place turn as leaving the scene", () => {
    expect(isTileStep({ x: 0, y: 1, facing: "E" }, { x: 0, y: 1, facing: "N" })).toBe(false);
    expect(isTileStep({ x: 0, y: 1, facing: "E" }, { x: 1, y: 1, facing: "E" })).toBe(true);
  });
});

describe("parseDir", () => {
  it("accepts Dust currentview words, not only NESW letters", () => {
    expect(parseDir("east")).toBe("E");
    expect(parseDir("NORTH")).toBe("N");
    expect(parseDir("W")).toBe("W");
    expect(parseDir(3)).toBe("E");
    expect(parseDir("sideways")).toBeNull();
  });
});

describe("set graph", () => {
  it("indexes camera tiles from the framelist, not blocked flags", () => {
    const graph = buildSetGraph(fixtureScenes, fixtureTrans);
    expect(graph.cameraTiles.has("0,1")).toBe(true);
    expect(graph.cameraTiles.has("1,1")).toBe(true);
    expect(sceneByName(graph, "scene b2")?.x).toBe(1);
  });

  it("prefers an in-place turn for the hold still", () => {
    const graph = buildSetGraph(fixtureScenes, fixtureTrans);
    expect(holdFrame(graph, { x: 0, y: 1, facing: "E" })).toEqual({ frame0: 30, offset: 5 });
  });

  it("uses the walk-from 6th frame as the HQ still of that pose", () => {
    const graph = buildSetGraph(fixtureScenes, fixtureTrans);
    expect(hqFrame(graph, { x: 0, y: 1, facing: "E" })).toEqual({ frame0: 10, offset: 5 });
  });
});

describe("walker", () => {
  const graph = buildSetGraph(fixtureScenes, fixtureTrans);

  it("turns left/right the way Dust arrow keys do", () => {
    expect(turnFacing("N", "left")).toBe("W");
    expect(turnFacing("N", "right")).toBe("E");
    expect(turnFacing("E", "right")).toBe("S");
  });

  it("steps east when facing east", () => {
    expect(stepPose({ x: 0, y: 1, facing: "E" })).toEqual({ x: 1, y: 1, facing: "E" });
  });

  it("resolves a filmed walk and a filmed turn", () => {
    const walk = transitionForInput(graph, { x: 0, y: 1, facing: "E" }, "forward");
    expect(walk?.frame0).toBe(10);
    expect(applyTransition(walk!)).toEqual({ x: 1, y: 1, facing: "E" });

    const turn = transitionForInput(graph, { x: 0, y: 1, facing: "E" }, "right");
    expect(turn?.dirTo).toBe("S");
    expect(turn?.xTo).toBe(0);
  });

  it("returns nothing when that step was never filmed", () => {
    expect(transitionForInput(graph, { x: 0, y: 1, facing: "W" }, "forward")).toBeUndefined();
  });

  it("reverses a clockwise strip when left is not filmed", () => {
    const left = transitionForInput(graph, { x: 0, y: 1, facing: "E" }, "left");
    expect(left?.reverse).toBe(true);
    expect(applyTransition(left!)).toEqual({ x: 0, y: 1, facing: "N" });
  });

  it("plays five motion frames for both walks and turns", () => {
    const walk = transitionForInput(graph, { x: 0, y: 1, facing: "E" }, "forward");
    const turn = transitionForInput(graph, { x: 0, y: 1, facing: "E" }, "right");
    expect(walk).toBeDefined();
    expect(turn).toBeDefined();
    expect(framesToPlay(walk!)).toBe(5);
    expect(framesToPlay(turn!)).toBe(5);
    expect(STILL_FRAME_SEC).toBeCloseTo(0.05, 10);
    expect(framesToPlay(walk!) * STILL_FRAME_SEC).toBeCloseTo(0.25, 10);
  });

  it("maps still clicks to turn / walk", () => {
    expect(stillClickInput(0.05, 0.5)).toBe("left");
    expect(stillClickInput(0.95, 0.5)).toBe("right");
    expect(stillClickInput(0.5, 0.2)).toBe("forward");
    expect(stillClickInput(0.5, 0.8)).toBeNull();
    expect(stillClickInput(-0.1, 0.2)).toBeNull();
  });

  it("maps a finger swipe to turn / walk, not a back step", () => {
    expect(swipeWalkInput(-60, 0)).toBe("left");
    expect(swipeWalkInput(60, 0)).toBe("right");
    expect(swipeWalkInput(0, -60)).toBe("forward");
    expect(swipeWalkInput(0, 60)).toBeNull();
    expect(swipeWalkInput(10, -10)).toBeNull();
    expect(swipeWalkInput(80, -40)).toBe("right");
    expect(swipeWalkInput(40, -80)).toBe("forward");
    expect(walkInputKey("forward")).toBe("uparrow");
    expect(walkInputKey("left")).toBe("leftarrow");
    expect(walkInputKey("right")).toBe("rightarrow");
    expect(walkInputFromCode("KeyW")).toBe("forward");
    expect(walkInputFromCode("KeyA")).toBe("left");
    expect(walkInputFromCode("KeyD")).toBe("right");
    expect(walkInputFromKeys(["KeyW", "KeyA"])).toBe("forward");
    expect(queuedWalk(null, [])).toBeNull();
    expect(queuedWalk("left", [])).toEqual({ input: "left", repeat: false });
    expect(queuedWalk("forward", ["KeyW"])).toEqual({ input: "forward", repeat: true });
    expect(queuedWalk(null, ["KeyW"])).toEqual({ input: "forward", repeat: true });
    expect(queuedWalk("left", ["KeyW"])).toEqual({ input: "forward", repeat: true });
    expect(isSwipePointer("touch")).toBe(true);
    expect(isSwipePointer("pen")).toBe(true);
    expect(isSwipePointer("mouse")).toBe(false);
  });
});

describe("interior scene transpose", () => {
  it("transposes a 3-cell shop so C2 sits on the filmed tile", () => {
    const scenes: SceneRecord[] = [
      { x: 1, y: 0, interact: 1, unknown_c: 0, blocked: 0, unknown_e: 0, name: "Scene A2", script_container: 0 },
      { x: 1, y: 1, interact: 1, unknown_c: 0, blocked: 0, unknown_e: 0, name: "Scene B2", script_container: 0 },
      { x: 1, y: 2, interact: 1, unknown_c: 0, blocked: 0, unknown_e: 0, name: "Scene C2", script_container: 0 },
    ];
    const records: TransitionRecord[] = [
      {
        x_from: 0, y_from: 1, dir_from: 3, x_to: 1, y_to: 1, dir_to: 3,
        dir_from_name: "E", dir_to_name: "E", frame0: 1,
      },
      {
        x_from: 1, y_from: 1, dir_from: 3, x_to: 2, y_to: 1, dir_to: 3,
        dir_from_name: "E", dir_to_name: "E", frame0: 2,
      },
    ];
    const graph = buildSetGraph(scenes, records);
    expect(sceneByName(graph, "scene c2")).toEqual(expect.objectContaining({ x: 2, y: 1 }));
    expect(graph.cameraTiles.has("2,1")).toBe(true);
  });
});

describe("extracted interior graphs", () => {
  it("spawns APOTH C2 on the filmed graph", () => {
    const scenesPath = resolve("dfextract/out/SET/_APOTH/scenes.json");
    const transPath = resolve("dfextract/out/SET/_APOTH/transitions.json");
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records);
    const c2 = sceneByName(graph, "scene c2");
    expect(c2).toBeDefined();
    expect(graph.cameraTiles.has(`${c2!.x},${c2!.y}`)).toBe(true);
    expect(c2).toEqual(expect.objectContaining({ x: 2, y: 1 }));
    expect(hqFrame(graph, { x: c2!.x, y: c2!.y, facing: "W" })).toBeDefined();
  });

  it("stands at SET header spawn for saloon and Help's shop", () => {
    for (const [folder, scene] of [
      ["_SALLOWER", "scene d1"],
      ["_CHIN", "scene a2"],
    ] as const) {
      const scenesPath = resolve(`dfextract/out/SET/${folder}/scenes.json`);
      const transPath = resolve(`dfextract/out/SET/${folder}/transitions.json`);
      if (!existsSync(scenesPath) || !existsSync(transPath)) {
        return;
      }
      const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
      const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
      const spawn = SET_SPAWN[folder];
      const graph = buildSetGraph(scenes, records, spawn);
      expect(graph.spawn).toEqual(spawn);
      expect(graph.cameraTiles.has(`${spawn!.x},${spawn!.y}`)).toBe(true);
      expect(hqFrame(graph, spawn!)).toBeDefined();
      expect(sceneByName(graph, scene)).toEqual(
        expect.objectContaining({ x: spawn!.x, y: spawn!.y }),
      );
    }
    expect(SET_CAMERA_Z._CHIN).toBe(230);
    expect(SET_CAMERA_Z._SALLOWER).toBe(180);
    expect(cameraZOf("_SALLOWER")).toBe(180);
    expect(cameraZOf("sallower")).toBe(180);
    expect(cameraZOf("sallower.set", { cameraZ: 62 })).toBe(180);
    expect(setFolderFromWorld("sallower")).toBe("_SALLOWER");
    expect(setNamesEqual("sallower", "_SALLOWER")).toBe(true);
    expect(setNamesEqual("sallower", "sallower.set")).toBe(true);
    expect(setNamesEqual("school", "nitescho")).toBe(true);
    expect(setNamesEqual("court", "nitecour.set")).toBe(true);
    expect(setNamesEqual("school", "court")).toBe(false);
    expect(setNamesEqual("town", "nite")).toBe(true);
    expect(framesFolder("town", false)).toBe("_TOWN");
    expect(framesFolder("town", true)).toBe("_NITE");
    expect(framesFolder("_SCHOOL", true)).toBe("_NITESCHO");
    expect(framesFolder("_NITESCHO", false)).toBe("_SCHOOL");
    expect(framesFolder("_COURT", true)).toBe("_NITECOUR");
    expect(framesFolder("_NITECOUR", false)).toBe("_COURT");
    expect(framesFolder("_PADRE", true)).toBe("_PADRE");
    expect(framesFolder("_PADRE", false)).toBe("_PADRE");
    expect(zUrlFromStill("/extract/SET/_SALLOWER/FRAMES/172_5.png")).toBe(
      "/extract/SET/_SALLOWER/FRAMES/z/172_5.png",
    );
  });
});

describe("extracted TOWN graph", () => {
  const scenesPath = resolve("dfextract/out/SET/_TOWN/scenes.json");
  const transPath = resolve("dfextract/out/SET/_TOWN/transitions.json");

  it("has 52 filmed tiles and a hold still at the K7 fallback spawn", () => {
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records);
    expect(scenes).toHaveLength(225);
    expect(graph.cameraTiles.size).toBe(52);
    const spawn = resolveSpawn(graph);
    expect(spawn).toEqual({ x: 6, y: 14, facing: "N" });
    expect(hqFrame(graph, spawn)).toEqual({ frame0: 1640, offset: 5 });
  });

  it("picks G11 dead-end HQs from the right-turn strip, not a turn that ends here", () => {
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records);
    const g11 = { x: 10, y: 6 };
    expect(hqFrame(graph, { ...g11, facing: "E" })).toEqual({ frame0: 362, offset: 5 });
    expect(hqFrame(graph, { ...g11, facing: "N" })).toEqual({ frame0: 356, offset: 5 });
    expect(hqFrame(graph, { ...g11, facing: "S" })).toEqual({ frame0: 368, offset: 5 });
    expect(hqFrame(graph, { ...g11, facing: "W" })).toEqual({ frame0: 379, offset: 5 });
  });
});

describe("extracted HUB graph", () => {
  const scenesPath = resolve("dfextract/out/SET/_HUB/scenes.json");
  const transPath = resolve("dfextract/out/SET/_HUB/transitions.json");

  it("stands D5 west on the sundial table; north is the side chamber", () => {
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records, SET_SPAWN._HUB);
    const d5 = sceneByName(graph, "scene d5");
    expect(d5).toBeTruthy();
    expect(hqFrame(graph, { x: d5!.x, y: d5!.y, facing: "W" })).toEqual({
      frame0: 125,
      offset: 5,
    });
    expect(hqFrame(graph, { x: d5!.x, y: d5!.y, facing: "N" })).toEqual({
      frame0: 181,
      offset: 5,
    });
  });

  it("turns 90° at D5 west: right to north, left to south", () => {
    if (!existsSync(scenesPath) || !existsSync(transPath)) {
      return;
    }
    const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
    const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
    const graph = buildSetGraph(scenes, records, SET_SPAWN._HUB);
    const d5 = sceneByName(graph, "scene d5");
    expect(d5).toBeTruthy();
    const pose = { x: d5!.x, y: d5!.y, facing: "W" as const };
    const right = transitionForInput(graph, pose, "right");
    const left = transitionForInput(graph, pose, "left");
    expect(applyTransition(right!)).toEqual({ x: d5!.x, y: d5!.y, facing: "N" });
    expect(applyTransition(left!)).toEqual({ x: d5!.x, y: d5!.y, facing: "S" });
  });
});
