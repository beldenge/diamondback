/**
 * Minimal DOM HUD for the free-roam: place label, crosshair, door
 * prompt, hint line, and the click-to-enter / paused overlay.
 */

const CSS = `
.rei-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: "IM Fell English", Georgia, serif;
  z-index: 30;
}
.rei-place {
  position: absolute;
  left: 18px;
  bottom: 14px;
  color: #f0e4c0;
  font-size: 22px;
  letter-spacing: 0.06em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
}
.rei-hint {
  position: absolute;
  right: 18px;
  bottom: 16px;
  color: rgba(240, 228, 192, 0.75);
  font-size: 13px;
  letter-spacing: 0.05em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.rei-cross {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 4px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: rgba(240, 228, 192, 0.85);
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
}
.rei-prompt {
  position: absolute;
  left: 50%;
  top: 56%;
  transform: translateX(-50%);
  color: #f0e4c0;
  font-size: 17px;
  letter-spacing: 0.05em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.rei-pause {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(10, 6, 4, 0.55);
  pointer-events: none;
  text-align: center;
}
.rei-pause h1 {
  margin: 0;
  font-family: "Rye", "IM Fell English", Georgia, serif;
  font-weight: 400;
  font-size: 54px;
  color: #e8d49a;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
}
.rei-pause p {
  margin: 0;
  color: #efe6c8;
  font-size: 18px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.rei-pause .rei-keys {
  font-size: 14px;
  color: rgba(239, 230, 200, 0.8);
}
[hidden].rei-pause,
[hidden].rei-cross,
[hidden].rei-prompt {
  display: none !important;
}
`;

export class Hud {
  private root: HTMLDivElement;

  private style: HTMLStyleElement;

  private place: HTMLDivElement;

  private prompt: HTMLDivElement;

  private cross: HTMLDivElement;

  private pause: HTMLDivElement;

  constructor() {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.root = document.createElement("div");
    this.root.className = "rei-root";

    this.place = document.createElement("div");
    this.place.className = "rei-place";
    this.root.appendChild(this.place);

    const hint = document.createElement("div");
    hint.className = "rei-hint";
    hint.textContent = "WASD walk · Shift run · Space jump · N night · click doors · Esc menu";
    this.root.appendChild(hint);

    this.cross = document.createElement("div");
    this.cross.className = "rei-cross";
    this.root.appendChild(this.cross);

    this.prompt = document.createElement("div");
    this.prompt.className = "rei-prompt";
    this.prompt.hidden = true;
    this.root.appendChild(this.prompt);

    this.pause = document.createElement("div");
    this.pause.className = "rei-pause";
    this.pause.innerHTML =
      "<h1>Dust: Reimagined</h1>" +
      "<p>Click to walk Diamondback.</p>" +
      '<p class="rei-keys">WASD or arrows to move · Shift to run · Space to jump · N for night<br>' +
      "Click a door to swing it open · Esc releases the mouse · Esc again returns to the title</p>";
    this.root.appendChild(this.pause);

    document.body.appendChild(this.root);
  }

  setPlace(name: string): void {
    if (this.place.textContent !== name) {
      this.place.textContent = name;
    }
  }

  setPrompt(text: string | null): void {
    if (text === null) {
      this.prompt.hidden = true;
      return;
    }
    this.prompt.hidden = false;
    if (this.prompt.textContent !== text) {
      this.prompt.textContent = text;
    }
  }

  setPaused(paused: boolean): void {
    this.pause.hidden = !paused;
    this.cross.hidden = paused;
    if (paused) {
      this.prompt.hidden = true;
    }
  }

  set hidden(v: boolean) {
    this.root.hidden = v;
  }

  dispose(): void {
    this.root.remove();
    this.style.remove();
  }
}
