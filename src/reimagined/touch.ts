/**
 * Touch controls for the free-roam.
 *
 * Reimagined was keyboard + pointer-lock only, which on a phone means it
 * does not run at all: `requestPointerLock` never resolves, so the
 * click-to-enter shade never lifts and every movement key is unreachable.
 *
 * The scheme is the usual one for a phone shooter, with the screen split
 * down the middle: a floating stick under the left thumb walks, a drag
 * on the right looks, and a tap on the right interacts with whatever was
 * tapped (not with the crosshair — on touch you point at a door with
 * your finger, not by aiming the whole camera at it). Jump, night and
 * the way back out are buttons, because there is no key for them.
 *
 * Nothing here changes the mouse and keyboard path: touch mode engages
 * on the first `pointerType === "touch"` event, or immediately when the
 * browser reports a coarse pointer.
 */

/** Finger travel, in px, still counted as a tap rather than a look. */
const TAP_SLOP = 14;

/** …and how long a tap may linger. */
const TAP_MS = 400;

/** Stick travel, in px, that means "full speed". */
const STICK_RANGE = 56;

/** Fraction of full stick travel that starts a run. */
const SPRINT_AT = 0.85;

/** Below this the stick reads as noise, so a resting thumb does not creep. */
const STICK_DEAD = 0.18;

const CSS = `
.rei-touch {
  position: fixed;
  inset: 0;
  z-index: 31;
  pointer-events: none;
  touch-action: none;
  font-family: "IM Fell English", Georgia, serif;
}
.rei-touch[hidden] { display: none !important; }
.rei-stick {
  position: absolute;
  width: 132px;
  height: 132px;
  margin: -66px 0 0 -66px;
  border-radius: 50%;
  border: 2px solid rgba(240, 228, 192, 0.4);
  background: rgba(20, 14, 10, 0.28);
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.rei-stick.on { opacity: 1; }
.rei-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 56px;
  height: 56px;
  margin: -28px 0 0 -28px;
  border-radius: 50%;
  border: 2px solid rgba(240, 228, 192, 0.75);
  background: rgba(240, 228, 192, 0.22);
}
.rei-btn {
  position: absolute;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(240, 228, 192, 0.55);
  background: rgba(20, 14, 10, 0.5);
  color: #f0e4c0;
  font-family: inherit;
  font-size: 15px;
  letter-spacing: 0.04em;
  padding: 0;
  user-select: none;
}
.rei-btn:active { background: rgba(240, 228, 192, 0.3); }
.rei-jump {
  right: calc(24px + env(safe-area-inset-right, 0px));
  bottom: calc(30px + env(safe-area-inset-bottom, 0px));
  width: 84px;
  height: 84px;
  font-size: 17px;
}
.rei-night {
  right: calc(24px + env(safe-area-inset-right, 0px));
  bottom: calc(132px + env(safe-area-inset-bottom, 0px));
  width: 62px;
  height: 62px;
}
.rei-menu {
  left: calc(16px + env(safe-area-inset-left, 0px));
  top: calc(16px + env(safe-area-inset-top, 0px));
  width: 56px;
  height: 56px;
  font-size: 13px;
}
`;

export interface MoveAxes {
  forward: number;
  right: number;
  sprint: boolean;
}

const STILL: MoveAxes = { forward: 0, right: 0, sprint: false };

/**
 * Thumb offset from where the stick sprang up, in px, to a movement
 * vector. Clamped to the unit circle so a thumb that slides off the
 * stick still walks at exactly walking pace, and dead-zoned so a
 * resting thumb does not creep.
 */
export function stickAxes(dx: number, dy: number): MoveAxes {
  const len = Math.hypot(dx, dy);
  if (len < STICK_RANGE * STICK_DEAD) {
    return STILL;
  }
  const scale = Math.min(1, len / STICK_RANGE) / len;
  return {
    // Screen up is forward; screen right strafes right.
    forward: -dy * scale,
    right: dx * scale,
    sprint: len / STICK_RANGE >= SPRINT_AT,
  };
}

/** A press that neither travelled nor lingered is a tap, not a look. */
export function isTapGesture(travel: number, heldMs: number): boolean {
  return travel < TAP_SLOP && heldMs < TAP_MS;
}

/** Normalised device coords of a tap, for the interaction raycast. */
export interface TapPoint {
  x: number;
  y: number;
}

export class TouchControls {
  /** True once a finger has driven this session. */
  engaged = false;

  onNight: (() => void) | null = null;

  onMenu: (() => void) | null = null;

  /** Fired by the first touch, so the caller can lift its start shade. */
  onFirstTouch: (() => void) | null = null;

  private root: HTMLDivElement;

  private style: HTMLStyleElement;

  private stick: HTMLDivElement;

  private knob: HTMLDivElement;

  private move: { id: number; x: number; y: number; dx: number; dy: number } | null = null;

  private look: { id: number; x: number; y: number; travel: number; at: number } | null = null;

  private lookX = 0;

  private lookY = 0;

  private jump = false;

  private tap: TapPoint | null = null;

  private detach: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.root = document.createElement("div");
    this.root.className = "rei-touch";
    this.root.hidden = true;

    this.stick = document.createElement("div");
    this.stick.className = "rei-stick";
    this.knob = document.createElement("div");
    this.knob.className = "rei-knob";
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);

    this.root.appendChild(this.button("rei-btn rei-jump", "Jump", () => {
      this.jump = true;
    }));
    this.root.appendChild(this.button("rei-btn rei-night", "Night", () => this.onNight?.()));
    this.root.appendChild(this.button("rei-btn rei-menu", "Menu", () => this.onMenu?.()));

    document.body.appendChild(this.root);
    this.bind();
    // A coarse pointer means the shade should already read "tap", before
    // any finger has landed.
    if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) {
      this.engage(false);
    }
  }

  private button(className: string, label: string, run: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.setAttribute("aria-label", label);
    // pointerdown, not click: a click after a drag-cancel never arrives.
    btn.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.engage(true);
      run();
    });
    return btn;
  }

  private engage(fromTouch: boolean): void {
    if (!this.engaged) {
      this.engaged = true;
      this.root.hidden = false;
    }
    if (fromTouch) {
      this.onFirstTouch?.();
    }
  }

  private bind(): void {
    const on = (type: string, fn: (ev: PointerEvent) => void): void => {
      this.canvas.addEventListener(type, fn as EventListener, { passive: false });
      this.detach.push(() => this.canvas.removeEventListener(type, fn as EventListener));
    };
    on("pointerdown", (event) => {
      if (event.pointerType !== "touch") {
        return;
      }
      event.preventDefault();
      this.engage(true);
      const half = this.canvas.clientWidth / 2;
      if (event.clientX < half && !this.move) {
        // Floating stick: it springs up wherever the thumb lands.
        this.move = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
        this.stick.style.left = `${event.clientX}px`;
        this.stick.style.top = `${event.clientY}px`;
        this.stick.classList.add("on");
        this.paintKnob(0, 0);
        return;
      }
      if (!this.look) {
        this.look = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          travel: 0,
          at: performance.now(),
        };
      }
    });
    on("pointermove", (event) => {
      if (event.pointerType !== "touch") {
        return;
      }
      if (this.move && event.pointerId === this.move.id) {
        event.preventDefault();
        this.move.dx = event.clientX - this.move.x;
        this.move.dy = event.clientY - this.move.y;
        this.paintKnob(this.move.dx, this.move.dy);
        return;
      }
      if (this.look && event.pointerId === this.look.id) {
        event.preventDefault();
        const dx = event.clientX - this.look.x;
        const dy = event.clientY - this.look.y;
        this.look.x = event.clientX;
        this.look.y = event.clientY;
        this.look.travel += Math.abs(dx) + Math.abs(dy);
        this.lookX += dx;
        this.lookY += dy;
      }
    });
    const end = (event: PointerEvent): void => {
      if (event.pointerType !== "touch") {
        return;
      }
      if (this.move && event.pointerId === this.move.id) {
        this.move = null;
        this.stick.classList.remove("on");
        this.paintKnob(0, 0);
        return;
      }
      if (this.look && event.pointerId === this.look.id) {
        const still = isTapGesture(this.look.travel, performance.now() - this.look.at);
        if (still && event.type === "pointerup") {
          const rect = this.canvas.getBoundingClientRect();
          this.tap = {
            x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
            y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
          };
        }
        this.look = null;
      }
    };
    on("pointerup", end);
    on("pointercancel", end);
  }

  private paintKnob(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    const clamp = len > STICK_RANGE ? STICK_RANGE / len : 1;
    this.knob.style.transform = `translate(${dx * clamp}px, ${dy * clamp}px)`;
  }

  axes(): MoveAxes {
    return this.move ? stickAxes(this.move.dx, this.move.dy) : STILL;
  }

  /** Pixels dragged since the last call. */
  takeLook(): { x: number; y: number } {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  takeJump(): boolean {
    const out = this.jump;
    this.jump = false;
    return out;
  }

  takeTap(): TapPoint | null {
    const out = this.tap;
    this.tap = null;
    return out;
  }

  set hidden(v: boolean) {
    this.root.hidden = v || !this.engaged;
  }

  dispose(): void {
    for (const off of this.detach) {
      off();
    }
    this.detach.length = 0;
    this.root.remove();
    this.style.remove();
  }
}
