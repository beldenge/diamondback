import "./style.css";
import { Game } from "./core/game";
import { clientMode, type ClientMode } from "./core/mode";
import { MovieGallery } from "./play/gallery";
import { PlayGame } from "./play/game";

const canvas = document.getElementById("viewport");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("#viewport canvas missing");
}

const landing = document.getElementById("landing");
let gallery: MovieGallery | null = null;

function currentMode(): ClientMode {
  return clientMode(window.location.search, window.location.pathname);
}

function showLanding(): void {
  gallery?.hide();
  document.body.classList.add("landing");
  document.body.classList.remove("gallery", "play");
  landing?.removeAttribute("hidden");
  document.title = "Dust — Diamondback";
}

function showMovies(): void {
  document.body.classList.remove("landing");
  landing?.setAttribute("hidden", "");
  document.title = "The Picture Show — Diamondback";
  if (!gallery) {
    gallery = new MovieGallery();
  } else {
    gallery.show();
  }
}

function applySpa(): void {
  if (currentMode() === "movies") {
    showMovies();
  } else {
    showLanding();
  }
  document.documentElement.classList.remove("boot-hidden");
}

function sameOriginLink(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) {
    return false;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") {
    return false;
  }
  return anchor.origin === window.location.origin;
}

function spaPair(mode: ClientMode): boolean {
  return mode === "landing" || mode === "movies";
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const anchor = target.closest("a");
  if (!(anchor instanceof HTMLAnchorElement) || !sameOriginLink(anchor, event)) {
    return;
  }
  const url = new URL(anchor.href);
  const next = clientMode(url.search, url.pathname);
  if (!spaPair(currentMode()) || !spaPair(next)) {
    return;
  }
  event.preventDefault();
  const nextHref = `${url.pathname}${url.search}`;
  const here = `${window.location.pathname}${window.location.search}`;
  if (nextHref !== here) {
    history.pushState(null, "", nextHref);
  }
  applySpa();
});

window.addEventListener("popstate", () => {
  if (spaPair(currentMode())) {
    applySpa();
  }
});

const mode = currentMode();
if (mode === "play") {
  document.body.classList.remove("landing");
  landing?.setAttribute("hidden", "");
  document.title = "Dust: Resurrected — Diamondback";
  new PlayGame(canvas).start();
  document.documentElement.classList.remove("boot-hidden");
} else if (mode === "unlocked") {
  document.body.classList.remove("landing");
  landing?.setAttribute("hidden", "");
  document.title = "Dust: Unlocked — Diamondback";
  new Game(canvas).start();
  document.documentElement.classList.remove("boot-hidden");
} else {
  applySpa();
}
