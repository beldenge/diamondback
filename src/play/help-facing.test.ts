import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, type ScriptFile } from "../vm/ast";
import { VM } from "../vm/runtime";
import { calcDeg, cameraFromPose, pickCstFrame } from "./facing";
import { DustHost } from "./host";
import type { PuppetUi, SpritePlace } from "./ui";

function loadProcs(rel: string) {
  const raw = readFileSync(resolve("dfextract/out", rel), "utf8");
  const file = JSON.parse(raw) as ScriptFile;
  return parseScript(file.tokens ?? []);
}

const AWAY = new Set([96, 128, 160]);

function helpWalkFrames(): SpritePlace[] | undefined {
  const rel = resolve("dfextract/out/CST/_GANG/sprites.json");
  if (!existsSync(rel)) {
    return undefined;
  }
  const data = JSON.parse(readFileSync(rel, "utf8")) as {
    actors?: Record<string, Record<string, SpritePlace[]>>;
  };
  return data.actors?.Help?.walk;
}

describe("Help walk facing", () => {
  it("approaching a north-looking player from town.help is a towards plate", () => {
    const walk = helpWalkFrames();
    if (!walk?.length) {
      return;
    }
    const help = { x: 1760, y: 3034 };
    const pose = { x: 6, y: 12, facing: "N" as const };
    const dest = { x: pose.x * 256 + 128, y: pose.y * 256 + 128 };
    const heading = calcDeg(help, dest);
    const cam = cameraFromPose(pose);
    const frame = pickCstFrame(walk, heading, help, cam, 0, [1]);
    expect(AWAY.has(frame?.deg ?? -1)).toBe(false);
  });

  it("G12 east after the dog uses a towards plate on the walk vector", () => {
    const walk = helpWalkFrames();
    if (!walk?.length) {
      return;
    }
    const help = { x: 1760, y: 3034 };
    const pose = { x: 6, y: 11, facing: "E" as const };
    const dest = { x: pose.x * 256 + 128, y: pose.y * 256 + 128 };
    const heading = calcDeg(help, dest);
    const cam = cameraFromPose(pose);
    const frame = pickCstFrame(walk, heading, help, cam, 0, [1]);
    expect(AWAY.has(frame?.deg ?? -1)).toBe(false);
  });

  it("default east heading on a north still is the away ¾ (the stuck-deg bug)", () => {
    const walk = helpWalkFrames();
    if (!walk?.length) {
      return;
    }
    const help = { x: 1760, y: 3034 };
    const cam = cameraFromPose({ x: 6, y: 12, facing: "N" });
    const stuckEast = pickCstFrame(walk, 0, help, cam, 0, [1]);
    expect(AWAY.has(stuckEast?.deg ?? -1)).toBe(true);
  });

  it("startWalk to playerxyz from town.help does not keep east", () => {
    const host = new DustHost({} as PuppetUi);
    host.view = {
      pose: { x: 6, y: 12, facing: "N" },
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    const help = host.namedActor("help");
    help.x = 1760;
    help.y = 3034;
    help.deg = 0;
    host.startWalk(help, 6 * 256 + 128, 12 * 256 + 128, 0);
    expect(help.deg).not.toBe(0);
    const walk = helpWalkFrames();
    if (!walk?.length) {
      return;
    }
    const frame = pickCstFrame(
      walk,
      help.deg,
      help,
      cameraFromPose(host.view.pose),
      0,
      [1],
    );
    expect(AWAY.has(frame?.deg ?? -1)).toBe(false);
  });
});

describe("Help setupactor dog", () => {
  it("helpidle in range does not leave her on default east", async () => {
    if (
      !["CST/_GANG/Cast.json", "CST/_GANG/Help/Script.json"].every((rel) =>
        existsSync(resolve("dfextract/out", rel)),
      )
    ) {
      return;
    }
    const host = new DustHost({} as PuppetUi);
    host.waypoints.set("town.help", { x: 1760, y: 3034, name: "town.help" });
    for (const proc of loadProcs("CST/_GANG/Cast.json")) {
      host.index.add("cast:gang", proc, "cast");
    }
    for (const proc of loadProcs("CST/_GANG/Help/Script.json")) {
      host.index.add("actor:help", proc, "help");
    }
    host.currentSet = "town";
    const pose = { x: 6, y: 12, facing: "N" as const };
    host.view = {
      pose,
      world: "town",
      graph: { scenes: new Map(), cameraTiles: new Set(), transitions: [], byFrom: new Map() },
      walk() {},
      async setPose() {},
      log() {},
      refreshActors() {},
    };
    const vm = new VM(host);
    vm.globals.set("day", 1);
    vm.globalNames.add("day");
    await vm.inObject("actor", "help", () =>
      vm.evalCall("setupactor", [{ type: "str", value: "dog" }]),
    );
    const help = host.namedActor("help");
    expect(help.x).toBe(1760);
    expect(help.visible).toBe(true);
    const facing = help.turning ? help.degTarget : help.deg;
    const cam = cameraFromPose(pose);
    const lens = {
      x: pose.x * 256 + 128,
      y: pose.y * 256 + 128 + 64,
    };
    const toward = calcDeg(help, lens);
    expect(Math.abs(((facing - toward + 128) % 256) - 128) < 40 || help.turning).toBe(
      true,
    );
  });
});
