import { describe, expect, it } from "vitest";
import { worldInputBlocked } from "./lock";

describe("world input lock", () => {
  const idle = { booting: false, busy: false, talking: false, flatsOpen: false };

  it("is open while the town is idle", () => {
    expect(worldInputBlocked(idle)).toBe(false);
  });

  it("blocks clicks and walks during walktopuppet", () => {
    expect(worldInputBlocked({ ...idle, talking: true })).toBe(true);
  });

  it("blocks during movies and SET filmstrips", () => {
    expect(worldInputBlocked({ ...idle, busy: true })).toBe(true);
  });

  it("blocks while a HUD flat is open", () => {
    expect(worldInputBlocked({ ...idle, flatsOpen: true })).toBe(true);
  });
});
