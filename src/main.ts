import "./style.css";
import { Game } from "./core/game";
import { clientMode, type ClientMode } from "./core/mode";
import { MovieGallery } from "./play/gallery";
import { PlayGame } from "./play/game";

const viewportEl = document.getElementById("viewport");
if (!(viewportEl instanceof HTMLCanvasElement)) {
  throw new Error("#viewport canvas missing");
}
const canvas: HTMLCanvasElement = viewportEl;

const landing = document.getElementById("landing");
let gallery: MovieGallery | null = null;
let playGame: PlayGame | null = null;
let townGame: Game | null = null;

function currentMode(): ClientMode {
  return clientMode(window.location.search, window.location.pathname);
}

function hideLanding(): void {
  document.body.classList.remove("landing");
  landing?.setAttribute("hidden", "");
}

function showLanding(): void {
  playGame?.hide();
  townGame?.stop();
  gallery?.hide();
  document.body.classList.add("landing");
  document.body.classList.remove("gallery", "play");
  landing?.removeAttribute("hidden");
  document.title = "Dust — Diamondback";
}

function showMovies(): void {
  playGame?.hide();
  townGame?.stop();
  hideLanding();
  document.title = "The Picture Show — Diamondback";
  if (!gallery) {
    gallery = new MovieGallery();
  } else {
    gallery.show();
  }
}

function showPlay(): void {
  townGame?.stop();
  gallery?.hide();
  hideLanding();
  document.title = "Dust: Resurrected — Diamondback";
  if (!playGame) {
    playGame = new PlayGame();
    playGame.start();
  } else {
    playGame.show();
  }
}

function showUnlocked(): void {
  playGame?.hide();
  gallery?.hide();
  hideLanding();
  document.body.classList.remove("gallery", "play");
  document.title = "Dust: Unlocked — Diamondback";
  if (!townGame) {
    townGame = new Game(canvas);
    townGame.start();
  } else {
    townGame.start();
  }
}

function applyRoute(): void {
  switch (currentMode()) {
    case "movies":
      showMovies();
      break;
    case "play":
      showPlay();
      break;
    case "unlocked":
      showUnlocked();
      break;
    default:
      showLanding();
      break;
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
  const hereMode = currentMode();
  if (next === hereMode && url.search === window.location.search) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  const nextHref = `${url.pathname}${url.search}`;
  const here = `${window.location.pathname}${window.location.search}`;
  if (nextHref !== here) {
    history.pushState(null, "", nextHref);
  }
  applyRoute();
});

window.addEventListener("popstate", () => {
  applyRoute();
});

applyRoute();
