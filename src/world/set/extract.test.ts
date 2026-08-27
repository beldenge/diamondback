import { describe, expect, it } from "vitest";
import { extractBase, extractUrl, pngFetchCache } from "./extract";

describe("extract URLs", () => {
  it("defaults to the local Vite /extract mount", () => {
    expect(extractBase()).toBe("/extract");
    expect(extractUrl("SET/_TOWN/scenes.json")).toBe("/extract/SET/_TOWN/scenes.json");
    expect(extractUrl("/SND/_UNILIB/knock1.wav")).toBe("/extract/SND/_UNILIB/knock1.wav");
  });

  it("revalidates extract PNGs in local Vite, caches them when hosted", () => {
    expect(pngFetchCache(false)).toBe("no-cache");
    expect(pngFetchCache(true)).toBe("default");
  });

  it("encodes spaces in viseme and layer paths", () => {
    expect(extractUrl("PUP/_HELP1/AUDIO/visemes/idle 1.json")).toBe(
      "/extract/PUP/_HELP1/AUDIO/visemes/idle%201.json",
    );
    expect(extractUrl("PUP/_HELP1/FRAMES/Hands 1/frame_21.png")).toBe(
      "/extract/PUP/_HELP1/FRAMES/Hands%201/frame_21.png",
    );
  });
});
