import { describe, it, expect } from "vitest";
import { buildGifFrames, encodeGif, RawFrame } from "./gif";
import { PUZZLES } from "./puzzles";

const puzzle = PUZZLES[0];
const answers = [...puzzle.h, ...puzzle.v];

function solidFrame(w: number, h: number, r: number, g: number, b: number, delayMs: number): RawFrame {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width: w, height: h, delayMs };
}

describe("gif share", () => {
  it("builds the expected number of frames", () => {
    // 8 guesses, 2 stars: 8*5 hold + 7*5 swipe + 8 final + 3 pop + 6 pulse + 10 end
    const guesses = ["crane", "slate", ...answers];
    const frames = buildGifFrames({ puzzleNumber: 1, guesses, answers, puzzle, won: true });
    expect(frames.length).toBe(8 * 5 + 7 * 5 + 8 + 3 + 6 + 10);
  });

  it("never leaks answer words into any frame", () => {
    const guesses = ["crane", "slate", ...answers];
    const frames = buildGifFrames({ puzzleNumber: 1, guesses, answers, puzzle, won: true });
    for (const f of frames) {
      for (const w of answers) {
        expect(f.svg.toLowerCase().includes(w)).toBe(false);
      }
    }
    expect(frames[0].svg).toContain("Griddle 1");
  });

  it("ticks the n/10 counter up through the stages", () => {
    const guesses = ["crane", "slate"];
    const frames = buildGifFrames({ puzzleNumber: 3, guesses, answers, puzzle, won: true });
    expect(frames[0].svg).toContain("Griddle 3");
    expect(frames[0].svg).toContain("1/10");
    // stage 2 hold starts after 5 hold + 5 swipe frames
    expect(frames[10].svg).toContain("2/10");
  });

  it("shows X/10 with no stars on a bust", () => {
    const guesses = ["aaaaa", "bbbbb", "ccccc", "ddddd", "eeeee", "fffff", "ggggg", "hhhhh", "iiiii", "jjjjj"];
    const frames = buildGifFrames({ puzzleNumber: 2, guesses, answers, puzzle, won: false });
    const last = frames[frames.length - 1].svg;
    expect(last).toContain("X/10");
    expect(last.includes("<polygon")).toBe(false);
  });

  it("pops stars in on a win", () => {
    const guesses = ["crane", "slate", ...answers];
    const frames = buildGifFrames({ puzzleNumber: 1, guesses, answers, puzzle, won: true });
    const last = frames[frames.length - 1].svg;
    expect(last.includes("<polygon")).toBe(true);
    expect((last.match(/<polygon/g) || []).length).toBe(2);
  });

  it("handles a single-guess game", () => {
    const frames = buildGifFrames({ puzzleNumber: 1, guesses: ["crane"], answers, puzzle, won: false });
    // 5 hold + 8 final + 3 pop + 6 pulse + 10 end (4 stars for 1 guess)
    expect(frames.length).toBe(5 + 8 + 3 + 6 + 10);
  });

  it("encodes a valid GIF", () => {
    const frames = [
      solidFrame(8, 8, 255, 0, 0, 100),
      solidFrame(8, 8, 0, 0, 255, 100),
    ];
    const bytes = encodeGif(frames);
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("throws on zero frames", () => {
    expect(() => encodeGif([])).toThrow();
  });
});
