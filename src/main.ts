import "./style.css";
import { Game } from "./core/game";

const canvas = document.getElementById("viewport");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("#viewport canvas missing");
}

new Game(canvas).start();
