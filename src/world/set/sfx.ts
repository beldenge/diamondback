import { extractUrl } from "./extract";

/** One-shot Dust WAVs from `SND/_UNILIB`. Click is a user gesture, so play() is allowed. */

const UNILIB = extractUrl("SND/_UNILIB");

const SFX: Record<string, string> = {
  knock1: `${UNILIB}/knock1.wav`,
  knock2: `${UNILIB}/knock2.wav`,
  dooropen1: `${UNILIB}/dooropen1.wav`,
  dooropen2: `${UNILIB}/dooropen2.wav`,
  dooropen3: `${UNILIB}/dooropen3.wav`,
  doorclose1: `${UNILIB}/doorclose1.wav`,
  doorclose2: `${UNILIB}/doorclose2.wav`,
  doorclose3: `${UNILIB}/doorclose3.wav`,
  gate: `${UNILIB}/gate.wav`,
};

export function playSfx(name: string): void {
  const url = SFX[name];
  if (!url) {
    return;
  }
  const audio = new Audio(url);
  audio.volume = 0.85;
  void audio.play().catch(() => {
    /* autoplay can still fail if the tab is not yet unlocked */
  });
}
