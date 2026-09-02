/**
 * Dust palette, inferred from the film stills (not sampled art —
 * tiling materials only; stills are a shape/occupancy/material guide).
 */
export const PAL = {
  // ground + sky
  dirt: "#a87a55",
  dirtDark: "#8a6042",
  skyDay: "#667fc1",
  skyHorizonDay: "#667fc1",
  skyNight: "#141c33",
  skyHorizonNight: "#232c4e",
  mesa: "#6a5a48",

  // wood
  woodSaloon: "#2e2620",
  woodBlack: "#080605",
  woodStage: "#a98e66",
  woodWatson: "#8d857a",
  woodDoctor: "#8c7250",
  woodGray: "#9c948a",
  woodWhite: "#d6d1c1",
  woodMid: "#6d5136",
  /** The stagecoach office's near-black boards (H7 E). */
  woodOffice: "#221b14",
  woodDark: "#4a3826",
  woodFloor: "#5c452e",
  boardwalk: "#a07e5c",
  rattlerGreen: "#7a8070",
  oliveHotel: "#a09a74",
  fenceGray: "#7a7160",
  palisade: "#26211a",
  barnDark: "#4c443a",

  // masonry
  adobeJail: "#7a7168",
  adobeMission: "#c6b69c",
  adobePink: "#d7a284",
  brickBank: "#2a1b12",
  brickCream: "#d9cfb2",
  brickMayor: "#5e3c30",
  wellStone: "#5d5a52",

  // roofs
  roofDark: "#3e372f",
  roofRed: "#96422e",
  tileRed: "#9c4a30",

  // accents
  curioRed: "#8e1e17",
  gold: "#dfb44e",
  cream: "#e6dcba",
  white: "#efeadb",
  signBrown: "#4f382a",
  iron: "#2b2a28",
  brass: "#b08d3f",
  glassCold: "#2c3138",
  glassWarm: "#ffb45a",
  curtainRed: "#661a18",
  teal: "#3f7770",
  marble: "#d9d5cc",
  paper: "#ddd2b0",

  // interior walls
  wpSaloon: "#9aa07c",
  wpHotel: "#ded5c0",
  wpMayHall: "#d8cfba",
  wpMayRoom: "#7e957f",
  wpSalUpper: "#c9bd9f",
  wpSalRoom: "#a02620",
  wpApoth: "#8a6f52",
  plasterJail: "#d8cbb1",
  bankInner: "#5b3d2c",
  redCeiling: "#7e3026",
} as const;

export type PalKey = keyof typeof PAL;
