// Experimental animated-GIF share: replays the game as a swipe-through of
// each guess stage, with no letters ever drawn (colors only, like the emoji
// share text). The header mimics the share text, except the n/10 counter
// ticks down live as the guesses advance.

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { Puzzle } from "./types";
import { stateAt, gridLetters } from "./game";
import { share, starPositions } from "./share";

export interface GifInput {
  puzzleNumber: number;
  guesses: string[];
  answers: string[];
  puzzle: Puzzle;
  won: boolean;
}

export interface SvgFrame {
  svg: string;
  delayMs: number;
}

export interface RawFrame {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  delayMs: number;
}

export const GIF_W = 372;
export const GIF_H = 440;

const PAD = 20;
const CELL = 60;
const CGAP = 8;
const GRID = 5 * CELL + 4 * CGAP; // 332
const HEADER_H = 56;
const Y0 = PAD + HEADER_H + 12; // grid top

const C_BG = "#0f1419";
const C_MISS = "#1a2332";
const C_GREEN = "#3aa35a";
const C_YELLOW = "#c9a227";
const C_TEXT = "#e8eef7";
const C_DIM = "#8fa1b8";
const C_STAR = "#ffd54a";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

type CellKind = "g" | "y" | "m";

function cellsFor(stageIdx: number, o: GifInput, letters: string[][]): CellKind[][] {
  const st = stateAt(stageIdx, o.guesses, o.answers);
  const cells: CellKind[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: CellKind[] = [];
    for (let c = 0; c < 5; c++) {
      if (!letters[r][c]) {
        row.push("m"); // placeholder; gaps are skipped at draw time
      } else if (st.green[r][c]) {
        row.push("g");
      } else if (st.yellow[r][c].length > 0) {
        row.push("y");
      } else {
        row.push("m");
      }
    }
    cells.push(row);
  }
  return cells;
}

function cellXY(r: number, c: number): [number, number] {
  return [PAD + c * (CELL + CGAP), Y0 + r * (CELL + CGAP)];
}

function boardGroup(cells: CellKind[][], letters: string[][], dx: number): string {
  let s = `<g transform="translate(${dx.toFixed(1)},0)">`;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!letters[r][c]) continue; // gaps stay transparent
      const [x, y] = cellXY(r, c);
      const fill = cells[r][c] === "g" ? C_GREEN : cells[r][c] === "y" ? C_YELLOW : C_MISS;
      s += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="10" fill="${fill}"/>`;
    }
  }
  return s + "</g>";
}

function starPoints(r: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    pts.push(`${(rad * Math.cos(a)).toFixed(1)},${(rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function starsGroup(stars: [number, number][], scale: number): string {
  if (scale <= 0 || stars.length === 0) return "";
  let s = "";
  for (const [r, c] of stars) {
    const [x, y] = cellXY(r, c);
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;
    s += `<g transform="translate(${cx},${cy}) scale(${scale.toFixed(3)})">` +
      `<polygon points="${starPoints(20)}" fill="${C_STAR}"/></g>`;
  }
  return s;
}

function headerSvg(o: GifInput, stageIdx: number): string {
  const total = o.guesses.length;
  const counter =
    !o.won && stageIdx === total - 1 ? "X/10" : `${stageIdx + 1}/10`;
  return (
    `<text x="${PAD}" y="${PAD + 36}" font-family="${FONT}" font-size="26" font-weight="800" fill="${C_TEXT}">` +
    `Griddle ${o.puzzleNumber}</text>` +
    `<text x="${GIF_W - PAD}" y="${PAD + 36}" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="700" fill="${C_DIM}">` +
    `${counter}</text>`
  );
}

function compose(
  o: GifInput,
  letters: string[][],
  stages: CellKind[][][],
  headerStage: number,
  slide: { from: number; to: number; t: number } | null,
  starScale: number,
  stars: [number, number][]
): string {
  let board: string;
  if (slide) {
    board =
      `<g clip-path="url(#gridclip)">` +
      boardGroup(stages[slide.from], letters, -slide.t * GIF_W) +
      boardGroup(stages[slide.to], letters, (1 - slide.t) * GIF_W) +
      `</g>`;
  } else {
    board = boardGroup(stages[headerStage], letters, 0);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GIF_W}" height="${GIF_H}" viewBox="0 0 ${GIF_W} ${GIF_H}">` +
    `<defs><clipPath id="gridclip"><rect x="${PAD}" y="${Y0}" width="${GRID}" height="${GRID}"/></clipPath></defs>` +
    `<rect width="${GIF_W}" height="${GIF_H}" fill="${C_BG}"/>` +
    headerSvg(o, headerStage) +
    board +
    starsGroup(stars, starScale) +
    `</svg>`
  );
}

export function buildGifFrames(o: GifInput): SvgFrame[] {
  const letters = gridLetters(o.puzzle);
  const total = o.guesses.length;
  const stages: CellKind[][][] = [];
  for (let i = 0; i < total; i++) stages.push(cellsFor(i, o, letters));
  const stars = starPositions(total);
  const frames: SvgFrame[] = [];
  const still = (stage: number, starScale: number, delayMs: number) =>
    frames.push({ svg: compose(o, letters, stages, stage, null, starScale, stars), delayMs });

  for (let i = 0; i < total; i++) {
    for (let k = 0; k < 5; k++) still(i, 0, 100);
    if (i < total - 1) {
      for (let k = 1; k <= 5; k++) {
        const t = k / 5;
        const headerStage = t < 0.5 ? i : i + 1;
        frames.push({
          svg: compose(o, letters, stages, headerStage, { from: i, to: i + 1, t }, 0, stars),
          delayMs: 70,
        });
      }
    }
  }
  for (let k = 0; k < 8; k++) still(total - 1, 0, 100);
  if (stars.length > 0) {
    for (const s of [0.3, 1.15, 1]) still(total - 1, s, 90);
    for (let k = 0; k < 6; k++) still(total - 1, 1 + 0.15 * Math.sin((2 * Math.PI * k) / 6), 140);
  }
  for (let k = 0; k < 10; k++) still(total - 1, stars.length > 0 ? 1 : 0, 100);
  return frames;
}

export function encodeGif(frames: RawFrame[]): Uint8Array {
  if (frames.length === 0) throw new Error("encodeGif: no frames");
  const gif = GIFEncoder();
  const first = frames[0];
  const palette = quantize(first.rgba, 256);
  frames.forEach((f, i) => {
    const index = applyPalette(f.rgba, palette);
    gif.writeFrame(index, f.width, f.height, {
      palette,
      delay: f.delayMs,
      repeat: i === 0 ? 0 : undefined,
    });
  });
  gif.finish();
  return gif.bytes();
}

async function rasterizeSvg(svg: string): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = GIF_W;
    canvas.height = GIF_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas unavailable");
    ctx.drawImage(img, 0, 0, GIF_W, GIF_H);
    return ctx.getImageData(0, 0, GIF_W, GIF_H).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Full pipeline: render frames, encode, then share via the Web Share API
// (with the regular share text attached) or fall back to downloading the
// GIF and copying the text.
export async function buildAndShareGif(o: GifInput): Promise<"shared" | "downloaded"> {
  const frames = buildGifFrames(o);
  const raw: RawFrame[] = [];
  for (const f of frames) {
    raw.push({ rgba: await rasterizeSvg(f.svg), width: GIF_W, height: GIF_H, delayMs: f.delayMs });
  }
  const bytes = encodeGif(raw);
  const file = new File([bytes as unknown as BlobPart], `griddle-${o.puzzleNumber}.gif`, {
    type: "image/gif",
  });
  const text = share(o.puzzleNumber, o.won, o.guesses, o.answers, o.puzzle);
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "Griddle", text });
    return "shared";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "image/gif" }));
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard unavailable — the GIF download is the shareable artifact
  }
  return "downloaded";
}
