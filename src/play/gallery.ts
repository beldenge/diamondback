import { extractUrl } from "../world/set/extract";
import { MoviePlayer } from "./moviePlayer";
import {
  formatMovieClock,
  movieDurationSec,
  movieFolder,
  type MovieTimeline,
} from "./movies";
import { DEFAULT_REEL, GALLERY_REELS, galleryGroups, galleryReel, reelFromSearch } from "./reels";
import { unlockVoices } from "./speech";

export class MovieGallery {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly player: MoviePlayer;
  private readonly statusEl: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly stageEl: HTMLElement;
  private readonly fullBtn: HTMLButtonElement;
  private readonly barEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private current = DEFAULT_REEL;
  private playing = false;
  private playGen = 0;
  private theater = false;
  private readonly durations = new Map<string, number>();

  constructor() {
    const app = document.getElementById("app");
    if (!app) {
      throw new Error("#app missing");
    }
    this.root = document.createElement("div");
    this.root.id = "gallery";
    this.root.innerHTML = `
      <aside id="gallery-rail">
        <a class="gallery-back" href="./">← Diamondback</a>
        <h1>The Picture Show</h1>
        <nav id="gallery-list"></nav>
      </aside>
      <section id="gallery-stage">
        <canvas id="gallery-movie"></canvas>
        <button type="button" id="gallery-play">Play</button>
        <button type="button" id="gallery-full">Full screen</button>
        <div id="gallery-meter">
          <div id="gallery-bar"><span></span></div>
          <p id="gallery-time"></p>
        </div>
        <p id="gallery-status"></p>
      </section>
    `;
    app.append(this.root);
    this.canvas = this.root.querySelector("#gallery-movie") as HTMLCanvasElement;
    this.statusEl = this.root.querySelector("#gallery-status") as HTMLElement;
    this.playBtn = this.root.querySelector("#gallery-play") as HTMLButtonElement;
    this.stageEl = this.root.querySelector("#gallery-stage") as HTMLElement;
    this.fullBtn = this.root.querySelector("#gallery-full") as HTMLButtonElement;
    this.barEl = this.root.querySelector("#gallery-bar span") as HTMLElement;
    this.timeEl = this.root.querySelector("#gallery-time") as HTMLElement;
    this.player = new MoviePlayer(this.canvas);
    this.fillList();
    void this.loadDurations();
    this.current = reelFromSearch(window.location.search);
    this.highlight();
    this.playBtn.addEventListener("click", () => void this.playCurrent());
    this.fullBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.toggleFullscreen();
    });
    document.addEventListener("fullscreenchange", () => this.syncFullscreenLabel());
    document.addEventListener("webkitfullscreenchange", () => this.syncFullscreenLabel());
    this.canvas.addEventListener("click", () => {
      if (this.playing) {
        this.player.stop();
        this.playing = false;
        this.playBtn.hidden = false;
        this.statusEl.textContent = "Stopped.";
        this.setProgress(0, this.durations.get(this.current) ?? 0);
      } else {
        void this.playCurrent();
      }
    });
    window.addEventListener("pointerdown", () => unlockVoices(), { capture: true });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.fullscreenEl() || this.theater) {
          if (this.theater) {
            this.theater = false;
            this.syncFullscreenLabel();
          }
          return;
        }
        this.player.stop();
        this.playing = false;
        this.playBtn.hidden = false;
        this.statusEl.textContent = "";
        this.setProgress(0, this.durations.get(this.current) ?? 0);
      }
      if (event.key === " " && event.target === document.body) {
        event.preventDefault();
        if (this.playing) {
          this.player.stop();
          this.playing = false;
          this.playBtn.hidden = false;
          this.setProgress(0, this.durations.get(this.current) ?? 0);
        } else {
          void this.playCurrent();
        }
      }
    });
    this.statusEl.textContent = `${galleryReel(this.current)?.title ?? "Opening"} — click Play.`;
    this.syncFullscreenLabel();
    this.show();
  }

  show(): void {
    this.root.hidden = false;
    document.body.classList.add("gallery");
    document.body.classList.remove("landing");
    document.getElementById("landing")?.setAttribute("hidden", "");
    this.current = reelFromSearch(window.location.search);
    this.highlight();
    this.setProgress(0, this.durations.get(this.current) ?? 0);
  }

  hide(): void {
    this.player.stop();
    this.playing = false;
    this.playBtn.hidden = false;
    if (this.fullscreenEl()) {
      void document.exitFullscreen?.();
    }
    this.theater = false;
    this.syncFullscreenLabel();
    this.root.hidden = true;
    document.body.classList.remove("gallery");
  }

  private fullscreenEl(): Element | null {
    return document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null;
  }

  private syncFullscreenLabel(): void {
    const on = Boolean(this.fullscreenEl()) || this.theater;
    this.fullBtn.textContent = on ? "Exit full screen" : "Full screen";
    this.root.classList.toggle("is-theater", this.theater && !this.fullscreenEl());
    this.stageEl.classList.toggle("is-fullscreen", on);
    this.canvas.classList.toggle("is-fullscreen", on);
    this.canvas.style.width = on ? "100%" : "";
    this.canvas.style.height = on ? "100%" : "";
    this.canvas.style.maxWidth = on ? "none" : "";
    this.canvas.style.maxHeight = on ? "none" : "";
    this.canvas.style.objectFit = "contain";
  }

  private nativeFullscreen(): boolean {
    const doc = document as Document & { webkitFullscreenEnabled?: boolean };
    if (doc.fullscreenEnabled === false || doc.webkitFullscreenEnabled === false) {
      return false;
    }
    const stage = this.stageEl as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    return typeof (stage.requestFullscreen ?? stage.webkitRequestFullscreen) === "function";
  }

  private async toggleFullscreen(): Promise<void> {
    const stage = this.stageEl as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & {
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (this.fullscreenEl() || this.theater) {
      if (this.fullscreenEl()) {
        try {
          await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
        } catch {
          /* already out */
        }
      }
      this.theater = false;
      this.syncFullscreenLabel();
      return;
    }
    if (this.nativeFullscreen()) {
      try {
        await (stage.requestFullscreen?.() ?? stage.webkitRequestFullscreen?.());
      } catch {
        /* iPhone: element fullscreen is not implemented */
      }
    }
    if (!this.fullscreenEl()) {
      this.theater = true;
    }
    this.syncFullscreenLabel();
  }

  private fillList(): void {
    const nav = this.root.querySelector("#gallery-list");
    if (!nav) {
      return;
    }
    nav.replaceChildren();
    for (const { group, reels } of galleryGroups()) {
      const heading = document.createElement("h2");
      heading.textContent = group;
      nav.append(heading);
      for (const reel of reels) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.reel = reel.id;
        const title = document.createElement("span");
        title.className = "gallery-title";
        title.textContent = reel.title;
        const len = document.createElement("span");
        len.className = "gallery-len";
        btn.append(title, len);
        btn.addEventListener("click", () => {
          this.select(reel.id);
          void this.playCurrent();
        });
        nav.append(btn);
      }
    }
  }

  private select(id: string): void {
    this.current = galleryReel(id)?.id ?? DEFAULT_REEL;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "movies");
    url.searchParams.set("reel", this.current);
    history.replaceState(null, "", `${url.pathname}${url.search}`);
    this.highlight();
    this.setProgress(0, this.durations.get(this.current) ?? 0);
  }

  private async loadDurations(): Promise<void> {
    await Promise.all(
      GALLERY_REELS.map(async (reel) => {
        try {
          const res = await fetch(extractUrl(`${movieFolder(`${reel.id}.mov`)}/timeline.json`));
          if (!res.ok) {
            return;
          }
          const timeline = (await res.json()) as MovieTimeline;
          const sec = movieDurationSec(timeline);
          if (!(sec > 0)) {
            return;
          }
          this.durations.set(reel.id, sec);
          const len = this.root.querySelector(`[data-reel="${reel.id}"] .gallery-len`);
          if (len) {
            len.textContent = formatMovieClock(sec);
          }
        } catch {
          /* extract missing */
        }
      }),
    );
    this.setProgress(0, this.durations.get(this.current) ?? 0);
  }

  private setProgress(nowSec: number, totalSec: number): void {
    const total = Math.max(0, totalSec);
    const frac = total > 0 ? Math.min(1, Math.max(0, nowSec / total)) : 0;
    this.barEl.style.width = `${frac * 100}%`;
    if (total > 0) {
      this.timeEl.textContent = `${formatMovieClock(nowSec)} / ${formatMovieClock(total)}`;
    } else {
      this.timeEl.textContent = "";
    }
  }

  private highlight(): void {
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>("#gallery-list button")) {
      btn.classList.toggle("is-current", btn.dataset.reel === this.current);
    }
  }

  private async playCurrent(): Promise<void> {
    unlockVoices();
    const gen = ++this.playGen;
    this.player.stop();
    this.playing = true;
    this.playBtn.hidden = true;
    const title = galleryReel(this.current)?.title ?? this.current;
    this.statusEl.textContent = `Loading ${title}…`;
    try {
      await this.player.play(this.current, {
        onStatus: (status) => {
          if (gen !== this.playGen) {
            return;
          }
          if (status.label === "Loading") {
            this.statusEl.textContent = `Loading ${title}… ${status.loaded}/${status.total}`;
          } else {
            this.statusEl.textContent = "";
          }
        },
        onProgress: (now, total) => {
          if (gen === this.playGen) {
            this.setProgress(now, total);
          }
        },
        waitClick: () =>
          new Promise((resolve) => {
            const done = (): void => {
              this.canvas.removeEventListener("pointerdown", done);
              resolve();
            };
            this.canvas.addEventListener("pointerdown", done, { once: true });
          }),
      });
      if (gen === this.playGen) {
        this.statusEl.textContent = `${title} — finished.`;
      }
    } catch (err) {
      if (gen === this.playGen) {
        this.statusEl.textContent = `Could not play ${title}. Need MOV extract.`;
      }
      console.warn(err);
    } finally {
      if (gen === this.playGen) {
        this.playing = false;
        this.playBtn.hidden = false;
      }
    }
  }
}
