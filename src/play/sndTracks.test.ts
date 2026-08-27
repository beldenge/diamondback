import { describe, expect, it } from "vitest";
import {
  countSounds,
  indexToSound,
  isGossipTrack,
  sndFolderFromFile,
} from "./sndTracks";

describe("SND gossip banks", () => {
  it("maps mazie.snd onto six knock lines", () => {
    const folder = sndFolderFromFile("mazie.snd");
    expect(folder).toBe("_MAZIE");
    expect(countSounds(folder)).toBe(6);
    expect(indexToSound(folder, 1)).toBe("mazie.1");
    expect(indexToSound(folder, 6)).toBe("mazie.6");
    expect(indexToSound(folder, 7)).toBe("");
  });

  it("treats gossip as a voice-bank close, not a filename", () => {
    expect(isGossipTrack("gossip")).toBe(true);
    expect(isGossipTrack("gossip.snd")).toBe(true);
    expect(isGossipTrack("hotlob")).toBe(false);
  });
});
