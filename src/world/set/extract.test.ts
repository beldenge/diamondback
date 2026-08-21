import { describe, expect, it } from "vitest";
import { extractBase, extractUrl } from "./extract";

describe("extract URLs", () => {
  it("defaults to the local Vite /extract mount", () => {
    expect(extractBase()).toBe("/extract");
    expect(extractUrl("SET/_TOWN/scenes.json")).toBe("/extract/SET/_TOWN/scenes.json");
    expect(extractUrl("/SND/_UNILIB/knock1.wav")).toBe("/extract/SND/_UNILIB/knock1.wav");
  });
});
