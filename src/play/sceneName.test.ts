import { describe, expect, it } from "vitest";
import { parseScriptScene, pascalSceneName, scriptSceneName } from "./sceneName";

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
