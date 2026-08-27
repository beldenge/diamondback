import { describe, expect, it } from "vitest";
import { clientMode } from "./mode";

describe("clientMode", () => {
  it("opens the landing chooser with no query", () => {
    expect(clientMode("")).toBe("landing");
    expect(clientMode("?")).toBe("landing");
  });

  it("maps each query to one mode", () => {
    expect(clientMode("?mode=unlocked")).toBe("unlocked");
    expect(clientMode("mode=UNLOCKED")).toBe("unlocked");
    expect(clientMode("?mode=resurrected")).toBe("resurrected");
    expect(clientMode("?mode=resurrected&intro=1")).toBe("resurrected");
    expect(clientMode("?mode=movies")).toBe("movies");
    expect(clientMode("?mode=movies&reel=intro")).toBe("movies");
  });

  it("ignores unknown modes", () => {
    expect(clientMode("?mode=play")).toBe("landing");
    expect(clientMode("?mode=gallery&reel=intro")).toBe("landing");
    expect(clientMode("?mode=free")).toBe("landing");
    expect(clientMode("?clock=2")).toBe("landing");
  });
});
