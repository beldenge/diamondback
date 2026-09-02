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
  skyNight: "#0b1022",
  skyHorizonNight: "#161c36",
  mesa: "#6a5a48",

  // wood
  woodSaloon: "#2e2620",
  woodBlack: "#080605",
  woodStage: "#b49a72",
  woodWatson: "#8f8072",
  woodDoctor: "#8c7250",
  woodGray: "#9c948a",
  woodWhite: "#d6d1c1",
  woodMid: "#6d5136",
  /** The stagecoach office's near-black boards (H7 E). */
  woodOffice: "#150e08",
  woodDark: "#4a3826",
  woodFloor: "#5c452e",
  boardwalk: "#a07e5c",
  rattlerGreen: "#7a8070",
  oliveHotel: "#b09c70",
  fenceGray: "#7a7160",
  palisade: "#26211a",
  barnDark: "#4c443a",

  // masonry
  adobeJail: "#6e6058",
  adobeMission: "#d2c2a8",
  adobePink: "#d7a284",
  brickBank: "#1e130c",
  brickCream: "#d9cfb2",
  brickMayor: "#5e3c30",
  wellStone: "#5d5a52",

  // roofs
  roofDark: "#3e372f",
  roofRed: "#96422e",
  /** The NE barn's and range barn's dark red-brown shingles (D9 E / F10 N / J10 S). */
  roofBrown: "#5e3830",
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
  wpSalUpper: "#a8a08a",
  wpSalRoom: "#a02620",
  wpApoth: "#8a6f52",
  plasterJail: "#d8cbb1",
  bankInner: "#5b3d2c",
  redCeiling: "#7e3026",
} as const;

export type PalKey = keyof typeof PAL;
