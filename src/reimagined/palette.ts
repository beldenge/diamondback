/**
 * Dust palette, inferred from the film stills (not sampled art —
 * tiling materials only; stills are a shape/occupancy/material guide).
 */
export const PAL = {
  // ground + sky
  dirt: "#b06f3e",
  dirtDark: "#96582f",
  skyDay: "#7f9fd6",
  skyHorizonDay: "#cfae83",
  skyNight: "#141c33",
  skyHorizonNight: "#232c4e",
  mesa: "#a67247",

  // wood
  woodSaloon: "#3a2b1f",
  woodBlack: "#241d16",
  woodStage: "#a98e66",
  woodWatson: "#bfbcaa",
  woodDoctor: "#c9ba9b",
  woodGray: "#8a8478",
  woodWhite: "#b9b6a9",
  woodMid: "#6d5136",
  woodDark: "#4a3826",
  woodFloor: "#5c452e",
  boardwalk: "#7c6547",
  rattlerGreen: "#49513a",
  oliveHotel: "#6e7155",
  fenceGray: "#6b6356",
  palisade: "#26211a",
  barnDark: "#4c443a",

  // masonry
  adobeJail: "#b3a288",
  adobeMission: "#e6dabf",
  adobePink: "#d7a284",
  brickBank: "#6b4732",
  brickCream: "#d9cfb2",
  brickMayor: "#77503f",
  wellStone: "#5d5a52",

  // roofs
  roofDark: "#3e372f",
  roofRed: "#96422e",
  tileRed: "#9c4a30",

  // accents
  curioRed: "#a3261d",
  gold: "#dfb44e",
  cream: "#e6dcba",
  white: "#efeadb",
  signBrown: "#4f382a",
  iron: "#2b2a28",
  brass: "#b08d3f",
  glassCold: "#2c3138",
  glassWarm: "#ffb45a",
  curtainRed: "#7e1f1c",
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
