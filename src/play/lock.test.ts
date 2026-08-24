import { describe, expect, it } from "vitest";
import { boardMouseGate, idlePumpAllowed, worldInputBlocked, worldMouseGate } from "./lock";

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

describe("world mouse vs idle scriptBusy", () => {
  const idle = {
    talking: false,
    scriptBusy: false,
    puppetOpen: false,
    cursorWatch: false,
  };

  it("runs a press on an idle still", () => {
    expect(worldMouseGate(idle)).toBe("run");
  });

  it("ignores a press while booting, busy, or a HUD overlay is up", () => {
    expect(worldMouseGate({ ...idle, booting: true })).toBe("ignore");
    expect(worldMouseGate({ ...idle, busy: true })).toBe("ignore");
    expect(worldMouseGate({ ...idle, flatsOpen: true })).toBe("ignore");
  });

  it("waits for idle makeloop instead of dropping the first door/table click", () => {
    expect(worldMouseGate({ ...idle, scriptBusy: true })).toBe("wait");
  });

  it("ignores a press during walktopuppet watch", () => {
    expect(worldMouseGate({ ...idle, scriptBusy: true, cursorWatch: true })).toBe(
      "ignore",
    );
  });

  it("ignores a press while a puppet owns the bevels", () => {
    expect(worldMouseGate({ ...idle, scriptBusy: true, puppetOpen: true })).toBe(
      "ignore",
    );
  });

  it("waits on the SALGAMES board when resetgame still owns the VM", () => {
    expect(boardMouseGate({ talking: false, scriptBusy: true, puppetOpen: false })).toBe(
      "wait",
    );
    expect(boardMouseGate({ talking: true, scriptBusy: false, puppetOpen: false })).toBe(
      "ignore",
    );
  });
});

describe("idle runQueued pump", () => {
  it("does not start a tick pump while resetgame owns the VM", () => {
    expect(idlePumpAllowed(false, false)).toBe(true);
    expect(idlePumpAllowed(true, false)).toBe(false);
    expect(idlePumpAllowed(false, true)).toBe(false);
    expect(idlePumpAllowed(true, true)).toBe(false);
  });
});
