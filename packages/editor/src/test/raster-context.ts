/**
 * A tiny software 2D context for tests: it implements the calls
 * `drawPatternTexture` makes (scale-and-translate transforms, rectangles,
 * paths, non-zero fills, clipping) and paints a pixel when the pixel's centre
 * is inside the shape. No anti-aliasing, no GPU, no DOM. Good enough to ask
 * "which colour is this texel?" in a unit test.
 */
import type { PatternCanvasContext } from "../texture/pattern-texture";
import { flattenPath, pointInPolylines, type PathCommand, type Polyline } from "../design/svg-path";

type Matrix = [number, number, number, number, number, number];

interface State {
  matrix: Matrix;
  clips: Polyline[][];
}

export class RasterContext implements PatternCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  lineWidth = 1;
  /** One colour string per pixel, row by row; "" is transparent. */
  readonly pixels: string[];
  /** Every call, for tests that look at the drawing order. */
  readonly calls: Array<{ op: string; style?: string }> = [];
  private state: State = { matrix: [1, 0, 0, 1, 0, 0], clips: [] };
  private stack: State[] = [];
  private path: PathCommand[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Array<string>(width * height).fill("");
  }

  pixel(x: number, y: number): string {
    return this.pixels[Math.floor(y) * this.width + Math.floor(x)] ?? "";
  }

  save(): void {
    this.stack.push({ matrix: [...this.state.matrix], clips: [...this.state.clips] });
  }
  restore(): void {
    this.state = this.stack.pop() ?? this.state;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    if (b !== 0 || c !== 0) throw new Error("RasterContext supports scale and translate only");
    this.state.matrix = [a, b, c, d, e, f];
  }
  beginPath(): void {
    this.path = [];
  }
  private map(x: number, y: number): [number, number] {
    const [a, , , d, e, f] = this.state.matrix;
    return [a * x + e, d * y + f];
  }
  moveTo(x: number, y: number): void {
    const [px, py] = this.map(x, y);
    this.path.push({ type: "M", x: px, y: py });
  }
  lineTo(x: number, y: number): void {
    const [px, py] = this.map(x, y);
    this.path.push({ type: "L", x: px, y: py });
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    const [ax, ay] = this.map(x1, y1);
    const [bx, by] = this.map(x2, y2);
    const [cx, cy] = this.map(x, y);
    this.path.push({ type: "C", x1: ax, y1: ay, x2: bx, y2: by, x: cx, y: cy });
  }
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void {
    const [ax, ay] = this.map(x1, y1);
    const [cx, cy] = this.map(x, y);
    this.path.push({ type: "Q", x1: ax, y1: ay, x: cx, y: cy });
  }
  closePath(): void {
    this.path.push({ type: "Z" });
  }
  rect(x: number, y: number, width: number, height: number): void {
    this.moveTo(x, y);
    this.lineTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.lineTo(x, y + height);
    this.closePath();
  }
  clip(): void {
    this.state.clips = [...this.state.clips, flattenPath(this.path)];
  }
  fill(): void {
    this.calls.push({ op: "fill", style: String(this.fillStyle) });
    this.paint(flattenPath(this.path), String(this.fillStyle));
  }
  stroke(): void {
    this.calls.push({ op: "stroke", style: String(this.strokeStyle) });
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    const saved = this.path;
    this.path = [];
    this.rect(x, y, width, height);
    this.calls.push({ op: "fillRect", style: String(this.fillStyle) });
    this.paint(flattenPath(this.path), String(this.fillStyle));
    this.path = saved;
  }
  clearRect(x: number, y: number, width: number, height: number): void {
    const saved = this.path;
    this.path = [];
    this.rect(x, y, width, height);
    this.paint(flattenPath(this.path), "");
    this.path = saved;
  }

  private paint(shape: Polyline[], color: string): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const line of shape) {
      for (const p of line.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    const x0 = Math.max(0, Math.floor(minX));
    const y0 = Math.max(0, Math.floor(minY));
    const x1 = Math.min(this.width - 1, Math.ceil(maxX));
    const y1 = Math.min(this.height - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = { x: x + 0.5, y: y + 0.5 };
        if (!pointInPolylines(shape, c)) continue;
        if (!this.state.clips.every((clip) => pointInPolylines(clip, c))) continue;
        this.pixels[y * this.width + x] = color;
      }
    }
  }
}
