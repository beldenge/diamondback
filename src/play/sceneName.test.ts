import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSetGraph, SET_SPAWN } from "../world/set/graph";
import type { SceneRecord, TransitionRecord } from "../world/set/types";
import {
  openSetShouldStand,
  parseScriptScene,
  pascalSceneName,
  poseForOpenedSet,
  scriptSceneName,
} from "./sceneName";

function loadGraph(folder: string) {
  const scenesPath = resolve(`dfextract/out/SET/${folder}/scenes.json`);
  const transPath = resolve(`dfextract/out/SET/${folder}/transitions.json`);
  if (!existsSync(scenesPath) || !existsSync(transPath)) {
    return undefined;
  }
  const scenes = JSON.parse(readFileSync(scenesPath, "utf8")) as SceneRecord[];
  const records = JSON.parse(readFileSync(transPath, "utf8")) as TransitionRecord[];
  return buildSetGraph(scenes, records, SET_SPAWN[folder]);
}

describe("town script scene names", () => {
  it("maps filmed O7 to script scene g15", () => {
    expect(scriptSceneName(6, 14)).toBe("scene g15");
    expect(parseScriptScene("scene g15")).toEqual({ x: 6, y: 14 });
    expect(pascalSceneName(6, 14)).toBe("scene o7");
  });

  it("maps filmed L7 jail to script scene g12", () => {
    expect(scriptSceneName(6, 11)).toBe("scene g12");
    expect(parseScriptScene("Scene G12")).toEqual({ x: 6, y: 11 });
    expect(pascalSceneName(6, 11)).toBe("scene l7");
  });

  it("maps filmed H7 saloon to script scene g8", () => {
    expect(scriptSceneName(6, 7)).toBe("scene g8");
    expect(parseScriptScene("scene g8")).toEqual({ x: 6, y: 7 });
  });
});

describe("opensetfile spawn", () => {
  it("does not keep street g8 when opening the saloon", () => {
    const graph = loadGraph("_SALLOWER");
    if (!graph) {
      return;
    }
    const pose = poseForOpenedSet(graph, "scene g8", "W");
    expect(pose).toEqual(SET_SPAWN._SALLOWER);
    expect(pose).toEqual({ x: 3, y: 0, facing: "W" });
    expect(graph.cameraTiles.has("3,0")).toBe(true);
  });

  it("does not keep street g12 when opening Help's shop", () => {
    const graph = loadGraph("_CHIN");
    if (!graph) {
      return;
    }
    const pose = poseForOpenedSet(graph, "scene g12", "E");
    expect(pose).toEqual(SET_SPAWN._CHIN);
    expect(pose).toEqual({ x: 0, y: 1, facing: "E" });
    expect(graph.cameraTiles.has("0,1")).toBe(true);
  });

  it("keeps town scene g8 on nite.set", () => {
    const graph = loadGraph("_NITE");
    if (!graph) {
      return;
    }
    expect(poseForOpenedSet(graph, "scene g8", "E")).toEqual({ x: 6, y: 7, facing: "E" });
  });

  it("does not treat chin scene a2 as a town tile when reopening nite", () => {
    const graph = loadGraph("_NITE");
    if (!graph) {
      return;
    }
    const pose = poseForOpenedSet(graph, "scene a2", "W");
    expect(pose).toEqual(SET_SPAWN._NITE);
    expect(pose).not.toEqual({ x: 0, y: 1, facing: "W" });
  });

  it("does not stand at O7 when gototown still has interior scene d1", () => {
    const graph = loadGraph("_NITE");
    if (!graph) {
      return;
    }
    expect(openSetShouldStand(graph, "scene d1")).toBe(false);
    expect(openSetShouldStand(graph, "scene a2")).toBe(false);
    expect(openSetShouldStand(graph, "scene g8")).toBe(true);
    expect(openSetShouldStand(graph, "scene g15")).toBe(true);
  });

  it("always stands when opening an interior SET", () => {
    const graph = loadGraph("_SALLOWER");
    if (!graph) {
      return;
    }
    expect(openSetShouldStand(graph, "scene g8")).toBe(true);
    expect(openSetShouldStand(graph, "scene d1")).toBe(true);
  });
});
