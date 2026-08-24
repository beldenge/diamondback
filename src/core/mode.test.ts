import { describe, expect, it } from "vitest";
import { clientMode } from "./mode";

describe("clientMode", () => {
  it("opens the landing chooser with no query", () => {
    expect(clientMode("", "/")).toBe("landing");
    expect(clientMode("?", "/")).toBe("landing");
  });

  it("maps unlocked to the sandbox walker", () => {
    expect(clientMode("?mode=unlocked", "/")).toBe("unlocked");
    expect(clientMode("mode=UNLOCKED", "/")).toBe("unlocked");
  });

  it("maps play and resurrected to the VM game", () => {
    expect(clientMode("?mode=play", "/")).toBe("play");
    expect(clientMode("?mode=resurrected", "/")).toBe("play");
    expect(clientMode("?mode=resurrected&intro=1", "/")).toBe("play");
  });

  it("maps movies to the picture show", () => {
    expect(clientMode("?mode=movies", "/")).toBe("movies");
    expect(clientMode("?mode=gallery&reel=intro", "/")).toBe("movies");
  });

  it("keeps the /play path alias", () => {
    expect(clientMode("", "/play")).toBe("play");
    expect(clientMode("", "/play/")).toBe("play");
  });

  it("ignores unknown modes", () => {
    expect(clientMode("?mode=free", "/")).toBe("landing");
    expect(clientMode("?clock=2", "/")).toBe("landing");
  });
});
