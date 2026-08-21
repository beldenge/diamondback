import { describe, expect, it } from "vitest";
import { decodePcmWav, wavDurationSec } from "./speech";

function pcmWav(samples: number[]): ArrayBuffer {
  const data = new Uint8Array(44 + samples.length);
  const view = new DataView(data.buffer);
  const write = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      data[at + i] = text.charCodeAt(i);
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 11025, true);
  view.setUint32(28, 11025, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, samples.length, true);
  for (let i = 0; i < samples.length; i += 1) {
    data[44 + i] = samples[i]!;
  }
  return data.buffer;
}

describe("decodePcmWav", () => {
  it("turns unsigned 8-bit Dust PCM into a buffer", () => {
    const ctx = {
      createBuffer(_ch: number, len: number, rate: number) {
        const channel = new Float32Array(len);
        return {
          sampleRate: rate,
          length: len,
          duration: len / rate,
          numberOfChannels: 1,
          getChannelData: () => channel,
        };
      },
    } as unknown as AudioContext;
    const buffer = decodePcmWav(ctx, pcmWav([128, 255, 0]));
    expect(buffer).not.toBeNull();
    const data = buffer!.getChannelData(0);
    expect(data[0]).toBeCloseTo(0);
    expect(data[1]).toBeCloseTo(0.992, 2);
    expect(data[2]).toBeCloseTo(-1);
  });
});

describe("wavDurationSec", () => {
  it("reads 8-bit PCM duration from the data chunk", () => {
    expect(wavDurationSec(pcmWav(new Array(11025).fill(128)))).toBeCloseTo(1, 5);
  });
});


