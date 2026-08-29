/**
 * Clip names in each extracted SND folder. Browser extract has no
 * directory index, so countsounds / indextosound cannot list WAVs
 * at runtime. Keep this in lockstep with dfextract/out/SND/_FOLDER.
 *
 * countsounds("gossip") is the open track's clips after opentrackfile.
 * "gossip" is the voice bank, not a filename.
 */

const TRACK_CLIPS: Readonly<Record<string, readonly string[]>> = {
  _CRACK: ["frustrate", "payof", "tumbler", "tumright"],
  _MAZIE: ["mazie.1", "mazie.2", "mazie.3", "mazie.4", "mazie.5", "mazie.6"],
  _HAPYRUBY: ["ruby.108", "ruby.109", "trotter.60"],
  _TROTRUBY: ["ruby.81", "ruby.82", "ruby.83", "trotter.74", "trotter.75", "trotter.76"],
  _TROTSIDE: [
    "side.55",
    "side.56",
    "side.57",
    "side.58",
    "side.59",
    "trotter.96",
    "trotter.97",
    "trotter.98",
    "trotter.99",
    "trotter.100",
  ],
  _MAYORBLD: [
    "blood.149",
    "blood.150",
    "blood.151",
    "blood.152",
    "blood.153",
    "blood.154",
    "blood.155",
    "mayor.103",
    "mayor.104",
    "mayor.105",
    "mayor.106",
    "mayor.107",
    "mayor.108",
    "mayor.109",
  ],
  _MARBLOOD: [
    "M93",
    "M94",
    "M95",
    "M96",
    "M97",
    "M98",
    "M99",
    "M100",
    "M101",
    "M102",
    "B127",
    "B128",
    "B129",
    "B130",
    "B131",
    "B132",
    "B133",
    "B134",
  ],
  _FEARWITT: ["fear.44", "fear.45", "fear.46", "fear.47", "fear.48", "fear.49", "fear.50", "fear.51"],
};

export function sndFolderFromFile(name: string): string {
  const stem = name.replace(/\.(snd|wav)$/i, "").trim();
  return `_${stem.toUpperCase()}`;
}

export function trackClipNames(folder: string): readonly string[] {
  const key = folder.startsWith("_") ? folder.toUpperCase() : `_${folder.toUpperCase()}`;
  return TRACK_CLIPS[key] ?? [];
}

/** 1-based. Empty string if the slot is past the end. */
export function indexToSound(folder: string, index: number): string {
  const clips = trackClipNames(folder);
  return clips[Math.trunc(index) - 1] ?? "";
}

export function countSounds(folder: string): number {
  return trackClipNames(folder).length;
}

/** `closetrackfile ("gossip")` pops a voice bank; it is not a theme stop. */
export function isGossipTrack(name: string): boolean {
  return name.replace(/\.(snd|wav)$/i, "").toLowerCase() === "gossip";
}
