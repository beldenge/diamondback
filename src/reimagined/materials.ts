import * as THREE from "three";
import { PAL } from "./palette";
import {
  adobeTex,
  brickTex,
  dirtTex,
  floorPlanks,
  palisadeTex,
  planksH,
  planksV,
  shingleTex,
  sunFaceTex,
  tileRoofTex,
  wallpaperTex,
  windowTex,
} from "./textures";

function lam(opts: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial(opts);
}

function texMat(tex: THREE.Texture): THREE.MeshLambertMaterial {
  const m = lam({ map: tex });
  m.userData.texWorld = tex.userData.texWorld ?? 2.5;
  return m;
}

export interface Mats {
  dirt: THREE.MeshLambertMaterial;
  boardwalk: THREE.MeshLambertMaterial;
  floorWood: THREE.MeshLambertMaterial;
  floorTile: THREE.MeshLambertMaterial;

  woodSaloon: THREE.MeshLambertMaterial;
  woodBlack: THREE.MeshLambertMaterial;
  woodStage: THREE.MeshLambertMaterial;
  woodWatson: THREE.MeshLambertMaterial;
  woodDoctor: THREE.MeshLambertMaterial;
  woodGray: THREE.MeshLambertMaterial;
  woodWhite: THREE.MeshLambertMaterial;
  woodMid: THREE.MeshLambertMaterial;
  woodDark: THREE.MeshLambertMaterial;
  barnDark: THREE.MeshLambertMaterial;
  rattlerGreen: THREE.MeshLambertMaterial;
  oliveHotel: THREE.MeshLambertMaterial;
  fenceGray: THREE.MeshLambertMaterial;
  palisade: THREE.MeshLambertMaterial;

  adobeJail: THREE.MeshLambertMaterial;
  adobeMission: THREE.MeshLambertMaterial;
  brickBank: THREE.MeshLambertMaterial;
  brickCream: THREE.MeshLambertMaterial;
  brickMayor: THREE.MeshLambertMaterial;
  wellStone: THREE.MeshLambertMaterial;

  roofDark: THREE.MeshLambertMaterial;
  roofRed: THREE.MeshLambertMaterial;
  tileRed: THREE.MeshLambertMaterial;

  curioRed: THREE.MeshLambertMaterial;
  gold: THREE.MeshLambertMaterial;
  cream: THREE.MeshLambertMaterial;
  white: THREE.MeshLambertMaterial;
  iron: THREE.MeshLambertMaterial;
  brass: THREE.MeshLambertMaterial;
  bone: THREE.MeshLambertMaterial;
  cactus: THREE.MeshLambertMaterial;
  cactusDark: THREE.MeshLambertMaterial;
  curtainRed: THREE.MeshLambertMaterial;
  teal: THREE.MeshLambertMaterial;
  marble: THREE.MeshLambertMaterial;
  paper: THREE.MeshLambertMaterial;
  shade: THREE.MeshLambertMaterial;
  leatherRed: THREE.MeshLambertMaterial;
  quiltGreen: THREE.MeshLambertMaterial;
  rug: THREE.MeshLambertMaterial;

  glassCold: THREE.MeshLambertMaterial;
  glassWarm: THREE.MeshLambertMaterial;
  glassClear: THREE.MeshLambertMaterial;
  lampGlow: THREE.MeshBasicMaterial;
  mesa: THREE.MeshLambertMaterial;

  winCold: THREE.MeshLambertMaterial;
  winWarm: THREE.MeshLambertMaterial;

  wpSaloon: THREE.MeshLambertMaterial;
  wpHotel: THREE.MeshLambertMaterial;
  wpMayHall: THREE.MeshLambertMaterial;
  wpMayRoom: THREE.MeshLambertMaterial;
  wpSalUpper: THREE.MeshLambertMaterial;
  wpSalRoom: THREE.MeshLambertMaterial;
  wpApoth: THREE.MeshLambertMaterial;
  plasterJail: THREE.MeshLambertMaterial;
  bankInner: THREE.MeshLambertMaterial;
  redCeiling: THREE.MeshLambertMaterial;

  sunFace: THREE.MeshLambertMaterial;
}

let cached: Mats | null = null;

export function getMats(): Mats {
  if (cached) {
    return cached;
  }
  const winColdTex = windowTex(false);
  const winWarmTex = windowTex(true);
  cached = {
    dirt: texMat(dirtTex(PAL.dirt, PAL.dirtDark)),
    boardwalk: texMat(floorPlanks(PAL.boardwalk, 11)),
    floorWood: texMat(floorPlanks(PAL.woodFloor, 12)),
    floorTile: texMat(brickTex(PAL.tileRed, "#7a3a26", 13)),

    woodSaloon: texMat(planksV(PAL.woodSaloon, 21)),
    woodBlack: texMat(planksV(PAL.woodBlack, 22, 20, 0.7)),
    woodStage: texMat(planksH(PAL.woodStage, 23)),
    woodWatson: texMat(planksV(PAL.woodWatson, 24)),
    woodDoctor: texMat(planksV(PAL.woodDoctor, 25)),
    woodGray: texMat(planksH(PAL.woodGray, 26)),
    woodWhite: texMat(planksV(PAL.woodWhite, 27)),
    woodMid: texMat(planksV(PAL.woodMid, 28)),
    woodDark: lam({ color: PAL.woodDark }),
    barnDark: texMat(planksH(PAL.barnDark, 29)),
    rattlerGreen: texMat(planksV(PAL.rattlerGreen, 30)),
    oliveHotel: texMat(planksH(PAL.oliveHotel, 31, 20)),
    fenceGray: texMat(planksV(PAL.fenceGray, 32, 20, 0.8)),
    palisade: texMat(palisadeTex(PAL.palisade, 33)),

    adobeJail: texMat(adobeTex(PAL.adobeJail, 41, PAL.brickMayor, 3)),
    adobeMission: texMat(adobeTex(PAL.adobeMission, 42, PAL.adobePink, 5)),
    brickBank: texMat(brickTex(PAL.brickBank, "#54382a", 43)),
    brickCream: texMat(brickTex(PAL.brickCream, "#b7ab8c", 44)),
    brickMayor: texMat(brickTex(PAL.brickMayor, "#5d3d30", 45)),
    wellStone: texMat(adobeTex(PAL.wellStone, 46)),

    roofDark: texMat(shingleTex(PAL.roofDark, 51)),
    roofRed: texMat(shingleTex(PAL.roofRed, 52)),
    tileRed: texMat(tileRoofTex(PAL.tileRed, 53)),

    curioRed: lam({ color: PAL.curioRed }),
    gold: lam({ color: PAL.gold }),
    cream: lam({ color: PAL.cream }),
    white: lam({ color: PAL.white }),
    iron: lam({ color: PAL.iron }),
    brass: lam({ color: PAL.brass }),
    bone: lam({ color: "#ded4b8" }),
    cactus: lam({ color: "#6d7c46" }),
    cactusDark: lam({ color: "#55643a" }),
    curtainRed: lam({ color: PAL.curtainRed }),
    teal: lam({ color: PAL.teal }),
    marble: texMat(adobeTex(PAL.marble, 55)),
    paper: lam({ color: PAL.paper }),
    shade: lam({ color: "#ddd1b4" }),
    leatherRed: lam({ color: "#8e2a22" }),
    quiltGreen: lam({ color: "#7d9584" }),
    rug: texMat(planksH("#7c3a2e", 56, 18)),

    glassCold: lam({ color: PAL.glassCold }),
    glassWarm: lam({ color: PAL.glassWarm, emissive: "#a35c14", emissiveIntensity: 0.9 }),
    glassClear: lam({
      color: "#c3d6e2",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    lampGlow: new THREE.MeshBasicMaterial({ color: "#ffd9a0" }),
    mesa: texMat(adobeTex(PAL.mesa, 58)),

    winCold: lam({ map: winColdTex }),
    winWarm: lam({ map: winWarmTex, emissive: "#c07828", emissiveIntensity: 0.75 }),

    wpSaloon: texMat(wallpaperTex(PAL.wpSaloon, "#6c7355", "damask", 61)),
    wpHotel: texMat(wallpaperTex(PAL.wpHotel, "#b7a98a", "crest", 62)),
    wpMayHall: texMat(wallpaperTex(PAL.wpMayHall, "#ac9f83", "sprig", 63)),
    wpMayRoom: texMat(wallpaperTex(PAL.wpMayRoom, "#5f7a63", "damask", 64)),
    wpSalUpper: texMat(wallpaperTex(PAL.wpSalUpper, "#a3946f", "fleur", 65)),
    wpSalRoom: texMat(wallpaperTex(PAL.wpSalRoom, "#c8a24a", "dots", 66)),
    wpApoth: texMat(wallpaperTex(PAL.wpApoth, "#6b543c", "damask", 67)),
    plasterJail: texMat(adobeTex(PAL.plasterJail, 68, PAL.brickMayor, 7)),
    bankInner: texMat(brickTex(PAL.bankInner, "#46301f", 69)),
    redCeiling: lam({ color: PAL.redCeiling }),

    sunFace: lam({ map: sunFaceTex() }),
  };
  return cached;
}

/** Night dims the always-glass; window planes swap materials instead. */
export function disposeMats(): void {
  cached = null;
}
