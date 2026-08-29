import { describe, expect, it } from "vitest";
import {
  boardMouseGate,
  idlePumpAllowed,
  isPuppetChromeTarget,
  mouseDispatchPoint,
  stillDownAfterWindowEvent,
  worldInputBlocked,
  worldMouseGate,
} from "./lock";

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

describe("board press point", () => {
  it("keeps checkers mousedown on the press square, not the drag hover", () => {
    const press = { x: 153, y: 176 };
    const hover = { x: 211, y: 118 };
    expect(mouseDispatchPoint("board", press, hover)).toEqual(press);
    expect(mouseDispatchPoint("world", press, hover)).toEqual(hover);
    expect(mouseDispatchPoint("world", press, null)).toEqual(press);
  });

  it("a one-cell checkers drag is not two cells on the 29px grid", () => {
    const press = { x: 153, y: 176 };
    const hover = { x: 211, y: 118 };
    const at = mouseDispatchPoint("board", press, hover);
    const startCol = Math.trunc((at.x - 138) / 29);
    const startRow = Math.trunc((at.y - 16) / 29);
    const hoverCol = Math.trunc((hover.x - 138) / 29);
    const hoverRow = Math.trunc((hover.y - 16) / 29);
    expect(startCol).toBe(0);
    expect(startRow).toBe(5);
    expect(Math.abs(hoverRow - startRow)).toBe(2);
    expect(Math.abs(hoverCol - startCol)).toBe(2);
  });
});

describe("puppet chrome hits", () => {
  it("recognizes HOUSE bevels and the speech bar, not the still", () => {
    const hit = (sel: string) => ({
      closest: (query: string) => (query.includes(sel) ? {} : null),
    });
    expect(isPuppetChromeTarget(hit(".puppet-bevel") as EventTarget)).toBe(true);
    expect(isPuppetChromeTarget(hit("#puppet-line") as EventTarget)).toBe(true);
    expect(isPuppetChromeTarget(hit("#play-stage") as EventTarget)).toBe(false);
    expect(isPuppetChromeTarget(null)).toBe(false);
  });
});

describe("stilldown button tracking", () => {
  it("drops the button on pointerup, cancel, lost capture, and blur", () => {
    expect(stillDownAfterWindowEvent("pointerdown")).toBe(true);
    expect(stillDownAfterWindowEvent("pointerup")).toBe(false);
    expect(stillDownAfterWindowEvent("pointercancel")).toBe(false);
    expect(stillDownAfterWindowEvent("lostpointercapture")).toBe(false);
    expect(stillDownAfterWindowEvent("blur")).toBe(false);
    expect(stillDownAfterWindowEvent("pointermove")).toBeUndefined();
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
