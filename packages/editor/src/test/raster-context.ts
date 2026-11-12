/**
 * A tiny software 2D context for tests: it implements the calls
 * `drawPatternTexture` makes (affine transforms, rectangles, paths, non-zero
 * fills, clipping, text, images) and paints a pixel when the pixel's centre is
 * inside the shape. No anti-aliasing, no GPU, no DOM. Good enough to ask
 * "which colour is this texel?" in a unit test.
 *
 * Text is not rendered as glyphs: `fillText` paints the line's box, so tests
 * can check where a line lands, how it is aligned and clipped. The box is
 * `measureText` wide (0.6 em per character, a fixed stand-in for font
 * metrics) and 0.7 em tall, centred on the "middle" baseline. Images paint
 * their rectangle in the colour `image:<id>` (`id` of the image object).
 */
import type { PatternCanvasContext } from "../texture/pattern-texture";
import { flattenPath, pointInPolylines, type PathCommand, type Polyline } from "../design/svg-path";

type Matrix = [number, number, number, number, number, number];

interface State {
  matrix: Matrix;
  clips: Polyline[][];
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  direction: CanvasDirection;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
}

/** Width of one character in em, for the fake text metrics. */
export const FAKE_CHAR_EM = 0.6;
/** Height of a painted text box in em. */
export const FAKE_LINE_EM = 0.7;

/** A strokeText call: the outline of a line of text. */
export interface StrokeTextCall {
  op: "strokeText";
  text: string;
  font: string;
  style: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  matrix: Matrix;
  x: number;
  y: number;
}

export interface TextCall {
  op: "fillText";
  text: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  direction: CanvasDirection;
  style: string;
  /** The transform the text was drawn with. */
  matrix: Matrix;
  x: number;
  y: number;
}

/** A fake image for drawImage: only its id matters. */
export function fakeImage(id: string): CanvasImageSource {
  return { id, width: 10, height: 10 } as unknown as CanvasImageSource;
}

export class RasterContext implements PatternCanvasContext {
  /** One colour string per pixel, row by row; "" is transparent. */
  readonly pixels: string[];
  /** Every painting call, for tests that look at the drawing order. */
  readonly calls: Array<{ op: string; style?: string } | TextCall | StrokeTextCall> = [];
  private state: State = {
    matrix: [1, 0, 0, 1, 0, 0],
    clips: [],
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    direction: "inherit",
    lineJoin: "miter",
    miterLimit: 10,
  };
  private stack: State[] = [];
  private path: PathCommand[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Array<string>(width * height).fill("");
  }

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this.state.fillStyle;
  }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    this.state.fillStyle = String(value);
  }
  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    return this.state.strokeStyle;
  }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    this.state.strokeStyle = String(value);
  }
  get lineWidth(): number {
    return this.state.lineWidth;
  }
  set lineWidth(value: number) {
    this.state.lineWidth = value;
  }
  get font(): string {
    return this.state.font;
  }
  set font(value: string) {
    this.state.font = value;
  }
  get textAlign(): CanvasTextAlign {
    return this.state.textAlign;
  }
  set textAlign(value: CanvasTextAlign) {
    this.state.textAlign = value;
  }
  get textBaseline(): CanvasTextBaseline {
    return this.state.textBaseline;
  }
  set textBaseline(value: CanvasTextBaseline) {
    this.state.textBaseline = value;
  }
  get direction(): CanvasDirection {
    return this.state.direction;
  }
  set direction(value: CanvasDirection) {
    this.state.direction = value;
  }

  get lineJoin(): CanvasLineJoin {
    return this.state.lineJoin;
  }
  set lineJoin(value: CanvasLineJoin) {
    this.state.lineJoin = value;
  }
  get miterLimit(): number {
    return this.state.miterLimit;
  }
  set miterLimit(value: number) {
    this.state.miterLimit = value;
  }

  pixel(x: number, y: number): string {
    return this.pixels[Math.floor(y) * this.width + Math.floor(x)] ?? "";
  }

  /** How many pixels have this colour. */
  count(colour: string): number {
    return this.pixels.filter((p) => p === colour).length;
  }

  /** The bounding box, in pixels, of every pixel with this colour, or null. */
  bounds(colour: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    this.pixels.forEach((p, k) => {
      if (p !== colour) return;
      const x = k % this.width;
      const y = Math.floor(k / this.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    });
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  save(): void {
    this.stack.push({ ...this.state, matrix: [...this.state.matrix], clips: [...this.state.clips] });
  }
  restore(): void {
    this.state = this.stack.pop() ?? this.state;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.matrix = [a, b, c, d, e, f];
  }
  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.state.matrix;
    this.state.matrix = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
  }
  scale(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.state.matrix;
    this.state.matrix = [a * x, b * x, c * y, d * y, e, f];
  }
  rotate(angle: number): void {
    const [a, b, c, d, e, f] = this.state.matrix;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.state.matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
  }
  beginPath(): void {
    this.path = [];
  }
  private map(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.state.matrix;
    return [a * x + c * y + e, b * x + d * y + f];
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
    this.calls.push({ op: "fill", style: this.state.fillStyle });
    this.paint(flattenPath(this.path), this.state.fillStyle);
  }
  stroke(): void {
    this.calls.push({ op: "stroke", style: this.state.strokeStyle });
  }
  private paintRect(x: number, y: number, width: number, height: number, colour: string): void {
    const saved = this.path;
    this.path = [];
    this.rect(x, y, width, height);
    this.paint(flattenPath(this.path), colour);
    this.path = saved;
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: "fillRect", style: this.state.fillStyle });
    this.paintRect(x, y, width, height, this.state.fillStyle);
  }
  clearRect(x: number, y: number, width: number, height: number): void {
    this.paintRect(x, y, width, height, "");
  }

  /** The em size from the current font, in drawing units. */
  private emSize(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.state.font);
    return match ? Number(match[1]) : 10;
  }
  measureText(text: string): { width: number } {
    return { width: [...text].length * FAKE_CHAR_EM * this.emSize() };
  }
  /** The box a line of text covers (the fake glyphs), grown by `grow` on every side. */
  private textBox(text: string, x: number, y: number, grow: number) {
    const s = this.state;
    const width = this.measureText(text).width;
    const height = FAKE_LINE_EM * this.emSize();
    const rtl = s.direction === "rtl";
    const align = s.textAlign === "start" ? (rtl ? "right" : "left") : s.textAlign === "end" ? (rtl ? "left" : "right") : s.textAlign;
    const left = align === "left" ? x : align === "right" ? x - width : x - width / 2;
    const top = s.textBaseline === "middle" ? y - height / 2 : y - height;
    return { left: left - grow, top: top - grow, width: width + 2 * grow, height: height + 2 * grow };
  }
  /** Paints the text box grown by half the line width on every side, as a stroke round the glyphs would reach. */
  strokeText(text: string, x: number, y: number): void {
    const s = this.state;
    this.calls.push({ op: "strokeText", text, font: s.font, style: s.strokeStyle, lineWidth: s.lineWidth, lineJoin: s.lineJoin, matrix: [...s.matrix], x, y });
    if (text.length === 0) return;
    const box = this.textBox(text, x, y, s.lineWidth / 2);
    this.paintRect(box.left, box.top, box.width, box.height, s.strokeStyle);
  }
  fillText(text: string, x: number, y: number): void {
    const s = this.state;
    this.calls.push({
      op: "fillText",
      text,
      font: s.font,
      textAlign: s.textAlign,
      textBaseline: s.textBaseline,
      direction: s.direction,
      style: s.fillStyle,
      matrix: [...s.matrix],
      x,
      y,
    });
    const box = this.textBox(text, x, y, 0);
    this.paintRect(box.left, box.top, box.width, box.height, s.fillStyle);
  }
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void {
    const id = (image as unknown as { id?: string }).id ?? "unknown";
    this.calls.push({ op: "drawImage", style: `image:${id}` });
    this.paintRect(dx, dy, dw, dh, `image:${id}`);
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
