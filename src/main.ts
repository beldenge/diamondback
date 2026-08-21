import "./style.css";
import { Game } from "./core/game";
import { PlayGame } from "./play/game";

const canvas = document.getElementById("viewport");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("#viewport canvas missing");
}

const params = new URLSearchParams(window.location.search);
const play =
  params.get("mode") === "play" ||
  window.location.pathname.replace(/\/+$/, "").endsWith("/play");

if (play) {
  new PlayGame(canvas).start();
} else {
  new Game(canvas).start();
}
