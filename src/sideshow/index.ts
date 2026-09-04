/**
 * The Sideshow — non-canon attractions.
 *
 * One landing card holds all of them, so the title chooser gains exactly
 * one entry no matter how many attractions get built. Which attraction is
 * `&show=`, parsed here rather than in `core/mode.ts`, so attraction two
 * never touches routing.
 *
 * Nothing under `src/sideshow/` may import the faithful engine
 * (`play/host.ts`, `play/game.ts`, `play/sandbox.ts`, `src/vm/**`).
 * `boundary.test.ts` fails the build if that ever changes.
 */

import { extractUrl } from "../world/set/extract";
import type { BlasterGame } from "./blaster/game";

export type AttractionId = "blaster";

interface Attraction {
  id: AttractionId;
  title: string;
  /**
   * Optional, and usually better left off. A card that explains the joke
   * spends it before the player gets there; the quote plus the art is
   * enough to make someone click.
   */
  blurb?: string;
  /**
   * Card art. A `/`-rooted path is served from `public/`; anything else is
   * resolved under the extract root.
   */
  still: string;
  /**
   * A real line from the game, with the character who says it. Dialogue
   * text lives in `PUP/<cast>/AUDIO/texts.csv` (column `Text`) — 3,420
   * lines of it. Quote, do not invent.
   */
  quote?: { line: string; who: string };
}

const ATTRACTIONS: Attraction[] = [
  {
    id: "blaster",
    title: "Chicken Blaster",
    // No blurb on purpose. The waves, the cascade and whatever turns up on
    // the fifth round are all better found than described.
    // A real frame of the mode running: wave 5, the flock most of the way
    // up Main Street, revolver drawn, blips streaming up the minimap.
    // Captured from the running game rather than dressed from stills —
    // an empty street does not say what this is.
    still: "/landing/blaster.jpg",
    // Quist, `PUP/_QUIST/AUDIO/texts.csv`. The extract's own identifier for
    // this line is literally `scaring chickens`.
    quote: { line: "You're scaring the chickens!", who: "Quist" },
  },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `?mode=sideshow&show=…`. Unknown or absent lands on the chooser. */
export function attractionFromSearch(search: string): AttractionId | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const show = new URLSearchParams(query).get("show")?.trim().toLowerCase() ?? "";
  return ATTRACTIONS.some((a) => a.id === show) ? (show as AttractionId) : null;
}

export class Sideshow {
  private readonly root: HTMLElement;

  private blaster: BlasterGame | null = null;

  private loading = false;

  onQuit: (() => void) | null = null;

  constructor() {
    const app = document.getElementById("app") ?? document.body;
    this.root = document.createElement("div");
    this.root.id = "sideshow";
    this.root.innerHTML = `
      <div class="sideshow-inner">
        <a class="sideshow-back" href="./">← Diamondback</a>
        <h1>The Sideshow</h1>
        <p class="sideshow-sub">Attractions out back. None of this is canon.</p>
        <div class="sideshow-list">
          ${ATTRACTIONS.map(
            (a) => `
            <a class="landing-card" href="?mode=sideshow&show=${a.id}">
              <img class="landing-still" src="${
                a.still.startsWith("/") ? a.still : extractUrl(a.still)
              }" alt="" />
              <div class="landing-card-copy">
                <h2>${escapeHtml(a.title)}</h2>
                ${
                  a.quote
                    ? `<p class="sideshow-quote">“${escapeHtml(a.quote.line)}”
                         <span>— ${escapeHtml(a.quote.who)}</span></p>`
                    : ""
                }
                ${a.blurb ? `<p>${escapeHtml(a.blurb)}</p>` : ""}
              </div>
            </a>`,
          ).join("")}
          <div class="sideshow-soon">More attractions when someone builds them.</div>
        </div>
      </div>
    `;
    app.append(this.root);
  }

  /** Route within the Sideshow: the chooser, or one attraction. */
  apply(search: string): void {
    const want = attractionFromSearch(search);
    if (want === "blaster") {
      this.root.hidden = true;
      void this.openBlaster();
      return;
    }
    this.blaster?.dispose();
    this.blaster = null;
    this.root.hidden = false;
  }

  private async openBlaster(): Promise<void> {
    if (this.blaster) {
      this.blaster.show();
      return;
    }
    if (this.loading) {
      return;
    }
    this.loading = true;
    const { BlasterGame } = await import("./blaster/game");
    this.loading = false;
    if (this.blaster) {
      return;
    }
    const game = new BlasterGame();
    // Esc backs out one level, to the attraction chooser — not all the way
    // to the title. Leaving an attraction is not leaving the Sideshow.
    game.onQuit = () => this.backToChooser();
    this.blaster = game;
    void game.start();
  }

  /** Close the running attraction and show the chooser again. */
  private backToChooser(): void {
    this.blaster?.dispose();
    this.blaster = null;
    const href = `${window.location.pathname}?mode=sideshow`;
    if (`${window.location.pathname}${window.location.search}` !== href) {
      history.pushState(null, "", href);
    }
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.blaster?.hide();
  }

  show(): void {
    this.root.hidden = false;
  }

  dispose(): void {
    this.blaster?.dispose();
    this.blaster = null;
    this.root.remove();
  }
}
