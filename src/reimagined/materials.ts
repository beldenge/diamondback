import * as THREE from "three";
import { PAL } from "./palette";
import {
  adobeTex,
  brickTex,
  dirtTex,
  floorPlanks,
  latticeTex,
  palisadeTex,
  planksH,
  planksV,
  shingleTex,
  sunFaceTex,
  sunFanTex,
  hideTex,
  antlerTex,
  tileRoofTex,
  wallpaperTex,
  windowTex,
} from "./textures";

function lam(opts: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial(opts);
}

/**
 * Materials whose glow changes with the sky: painted letters dim to
 * moonlight, lantern glass and lit windows come up at night (_NITE stills).
 */
const NIGHT_MATS: { mat: THREE.MeshLambertMaterial; day: number; night: number }[] = [];

export function registerNight(mat: THREE.MeshLambertMaterial, day: number, night: number): THREE.MeshLambertMaterial {
  NIGHT_MATS.push({ mat, day, night });
  mat.emissiveIntensity = day;
  return mat;
}

export function applyNightMats(night: boolean): void {
  for (const e of NIGHT_MATS) {
    e.mat.emissiveIntensity = night ? e.night : e.day;
  }
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
  woodOffice: THREE.MeshLambertMaterial;
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
  glassLit: THREE.MeshLambertMaterial;
  lampGlow: THREE.MeshBasicMaterial;
  mesa: THREE.MeshLambertMaterial;
  caveRed: THREE.MeshLambertMaterial;
  caveTeal: THREE.MeshLambertMaterial;
  caveFloor: THREE.MeshLambertMaterial;
  flame: THREE.MeshBasicMaterial;
  tbirdGlow: THREE.MeshBasicMaterial;

  winCold: THREE.MeshLambertMaterial;
  winWarm: THREE.MeshLambertMaterial;
  /** The jail cell's blue-lit barred window. */
  winBlue: THREE.MeshLambertMaterial;

  slate: THREE.MeshLambertMaterial;
  granite: THREE.MeshLambertMaterial;
  lattice: THREE.MeshLambertMaterial;
  velvetGreen: THREE.MeshLambertMaterial;
  linen: THREE.MeshLambertMaterial;
  floorBrick: THREE.MeshLambertMaterial;

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
  sunFanN: THREE.MeshLambertMaterial;
  sunFanS: THREE.MeshLambertMaterial;
  pumpkin: THREE.MeshLambertMaterial;
  crateLight: THREE.MeshLambertMaterial;
  hide: THREE.MeshLambertMaterial;
  antler: THREE.MeshLambertMaterial;
  bronze: THREE.MeshLambertMaterial;
  lanternGlass: THREE.MeshLambertMaterial;
  lampGlass: THREE.MeshLambertMaterial;
  sunStone: THREE.MeshLambertMaterial;
  curtainBlue: THREE.MeshLambertMaterial;
  caveDark: THREE.MeshLambertMaterial;
  ember: THREE.MeshBasicMaterial;
  black: THREE.MeshBasicMaterial;
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
    woodOffice: texMat(planksV(PAL.woodOffice, 34)),
    woodDark: lam({ color: PAL.woodDark }),
    barnDark: texMat(planksH(PAL.barnDark, 29)),
    rattlerGreen: texMat(planksV(PAL.rattlerGreen, 30)),
    oliveHotel: texMat(planksH(PAL.oliveHotel, 31, 20)),
    fenceGray: texMat(planksV(PAL.fenceGray, 32, 20, 0.8)),
    palisade: texMat(palisadeTex(PAL.palisade, 33)),

    adobeJail: texMat(adobeTex(PAL.adobeJail, 41, "#7a4e3e", 4)),
    adobeMission: texMat(adobeTex(PAL.adobeMission, 42, "#9a6a4a", 4)),
    brickBank: texMat(brickTex(PAL.brickBank, "#3a2a1e", 43)),
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
    cactus: lam({ color: "#7a8848" }),
    cactusDark: lam({ color: "#5c6838" }),
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
    glassLit: registerNight(
      lam({ color: "#c3d6e2", transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, emissive: "#ff9a30", emissiveIntensity: 0 }),
      0,
      2.2,
    ),
    mesa: texMat(adobeTex(PAL.mesa, 58)),
    caveRed: texMat(adobeTex("#5a2c20", 71, "#73402c", 8)),
    caveTeal: texMat(adobeTex("#2c4a44", 72, "#1f352f", 6)),
    caveFloor: texMat(adobeTex("#46241b", 73)),
    flame: new THREE.MeshBasicMaterial({ color: "#ffb45a" }),
    tbirdGlow: new THREE.MeshBasicMaterial({ color: "#66eaea" }),

    winCold: lam({ map: winColdTex }),
    winWarm: registerNight(lam({ map: winWarmTex, emissive: "#ffb040", emissiveMap: winWarmTex, emissiveIntensity: 0.15 }), 0.15, 0.95),
    winBlue: lam({ color: "#7a9cf0", emissive: "#4a6ad0", emissiveIntensity: 0.9 }),

    slate: lam({ color: "#2f2e2c" }),
    granite: texMat(adobeTex("#9a9990", 57, "#7c7b74", 6)),
    lattice: (() => {
      const mat = lam({ map: latticeTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
      return mat;
    })(),
    velvetGreen: lam({ color: "#2e5a3a" }),
    linen: lam({ color: "#e4dccb" }),
    floorBrick: texMat(brickTex("#a24e34", "#6e3322", 14)),

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

    sunFace: lam({ map: sunFaceTex(), alphaTest: 0.3 }),
    sunFanN: lam({ map: sunFanTex(true), alphaTest: 0.3, emissive: "#dfd4ac", emissiveIntensity: 0.3 }),
    sunFanS: lam({ map: sunFanTex(false), alphaTest: 0.3, emissive: "#dfd4ac", emissiveIntensity: 0.3 }),
    pumpkin: lam({ color: "#c8641e" }),
    crateLight: texMat(planksH("#b89a70", 21)),
    hide: lam({ map: hideTex(), alphaTest: 0.3 }),
    antler: lam({ map: antlerTex(), alphaTest: 0.3 }),
    bronze: lam({ color: "#6a4e34" }),
    lanternGlass: registerNight(lam({ color: "#4a3c28", emissive: "#ffb040", emissiveIntensity: 0.12 }), 0.12, 0.45),
    sunStone: lam({ color: "#a89c8c" }),
    curtainBlue: lam({ color: "#2a3660" }),
    caveDark: texMat(adobeTex("#2a1410", 71, "#3a1c14", 8)),
    ember: new THREE.MeshBasicMaterial({ color: "#e0601c" }),
    black: new THREE.MeshBasicMaterial({ color: "#060403" }),
    lampGlass: registerNight(lam({ color: "#5a4a30", emissive: "#ffc860", emissiveIntensity: 0.05 }), 0.05, 1.2),
  };
  return cached;
}

/** Night dims the always-glass; window planes swap materials instead. */
export function disposeMats(): void {
  cached = null;
}
