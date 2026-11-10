#!/usr/bin/env node
/**
 * Generates the PLACEHOLDER product images in src/scripts/seed-data/images/.
 *
 *   npm run images:placeholders -w backend
 *
 * Our own drawings, no third-party assets and no dependencies: flat shapes are rasterised
 * here (scanline fill with anti-aliasing) and written as PNG with Node's zlib. The output is
 * deterministic, so re-running it gives byte-identical files.
 *
 * Size 1160 x 1360 (29:34), the aspect ratio of the storefront's product page gallery. The
 * listing thumbnails are narrower (9:16, object-fit: cover), so every drawing stays inside the
 * middle 60% of the width, which is what those thumbnails show.
 *
 * To use a real photo instead, replace the file (or point the product at another file in
 * seed-data/products.ts). No code change is needed.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const WIDTH = 1160
const HEIGHT = 1360
const SUBSAMPLES = 4 // vertical sub-scanlines per pixel row, for anti-aliasing

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "scripts",
  "seed-data",
  "images"
)

const BACKGROUND = "#edebe7"
const GROUND = "#e2dfd9"
const MARK = "#aaa59c"

// ---------------------------------------------------------------------------------------------
// Geometry helpers. A shape is a list of closed polygons ([[x, y], ...]), filled non-zero.

function quad(p0, c, p1, steps = 24) {
  const out = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ])
  }
  return out
}

function circle(cx, cy, r, steps = 96) {
  const out = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

function ellipse(cx, cy, rx, ry, steps = 96) {
  return circle(0, 0, 1, steps).map(([x, y]) => [cx + x * rx, cy + y * ry])
}

function rect(x0, y0, x1, y1) {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
}

function roundedRect(x0, y0, x1, y1, r, steps = 8) {
  const out = []
  const corners = [
    [x1 - r, y0 + r, -Math.PI / 2],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, Math.PI / 2],
    [x0 + r, y0 + r, Math.PI],
  ]
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = start + (i / steps) * (Math.PI / 2)
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return out
}

/** A straight bar of the given width from (x0, y0) to (x1, y1), with round ends. */
function bar(x0, y0, x1, y1, w) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const nx = (-(y1 - y0) / len) * (w / 2)
  const ny = ((x1 - x0) / len) * (w / 2)
  const out = []
  const a = Math.atan2(ny, nx)
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const t = a - (i / steps) * Math.PI
    out.push([x1 + (w / 2) * Math.cos(t), y1 + (w / 2) * Math.sin(t)])
  }
  for (let i = 0; i <= steps; i++) {
    const t = a - Math.PI - (i / steps) * Math.PI
    out.push([x0 + (w / 2) * Math.cos(t), y0 + (w / 2) * Math.sin(t)])
  }
  return out
}

/** Region between two curves that share their end points direction (top edge, then bottom edge reversed). */
function band(top, bottom) {
  return [...top, ...[...bottom].reverse()]
}

// ---------------------------------------------------------------------------------------------
// Rasteriser: per shape, a coverage buffer from a scanline fill with SUBSAMPLES sub-rows and
// exact horizontal span coverage; then the colour is blended over the image.

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function createImage(background) {
  const pixels = new Float32Array(WIDTH * HEIGHT * 3)
  const [r, g, b] = hexToRgb(background)
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    pixels[i * 3] = r
    pixels[i * 3 + 1] = g
    pixels[i * 3 + 2] = b
  }
  return pixels
}

function fill(pixels, polygons, color) {
  const [cr, cg, cb] = hexToRgb(color)
  const edges = []
  let minY = Infinity
  let maxY = -Infinity
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i]
      const [x1, y1] = poly[(i + 1) % poly.length]
      if (y0 === y1) continue
      edges.push(y0 < y1 ? [x0, y0, x1, y1, 1] : [x1, y1, x0, y0, -1])
      minY = Math.min(minY, y0, y1)
      maxY = Math.max(maxY, y0, y1)
    }
  }
  const rowStart = Math.max(0, Math.floor(minY))
  const rowEnd = Math.min(HEIGHT - 1, Math.ceil(maxY))
  const coverage = new Float32Array(WIDTH)

  for (let row = rowStart; row <= rowEnd; row++) {
    coverage.fill(0)
    let touched = false
    for (let s = 0; s < SUBSAMPLES; s++) {
      const y = row + (s + 0.5) / SUBSAMPLES
      const crossings = []
      for (const [x0, y0, x1, y1, dir] of edges) {
        if (y >= y0 && y < y1) {
          crossings.push([x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), dir])
        }
      }
      if (crossings.length < 2) continue
      crossings.sort((a, b) => a[0] - b[0])
      let winding = 0
      for (let i = 0; i < crossings.length - 1; i++) {
        winding += crossings[i][1]
        if (winding === 0) continue
        const xa = Math.max(0, crossings[i][0])
        const xb = Math.min(WIDTH, crossings[i + 1][0])
        if (xb <= xa) continue
        touched = true
        addSpan(coverage, xa, xb, 1 / SUBSAMPLES)
      }
    }
    if (!touched) continue
    for (let x = 0; x < WIDTH; x++) {
      const a = Math.min(1, coverage[x])
      if (a <= 0) continue
      const i = (row * WIDTH + x) * 3
      pixels[i] = pixels[i] * (1 - a) + cr * a
      pixels[i + 1] = pixels[i + 1] * (1 - a) + cg * a
      pixels[i + 2] = pixels[i + 2] * (1 - a) + cb * a
    }
  }
}

function addSpan(coverage, xa, xb, weight) {
  const first = Math.floor(xa)
  const last = Math.min(WIDTH - 1, Math.floor(xb))
  if (first === last) {
    coverage[first] += (xb - xa) * weight
    return
  }
  coverage[first] += (first + 1 - xa) * weight
  for (let x = first + 1; x < last; x++) coverage[x] += weight
  if (last < WIDTH) coverage[last] += (xb - last) * weight
}

// ---------------------------------------------------------------------------------------------
// PNG writer (8-bit RGB, per-row filter chosen by the usual minimum-sum heuristic).

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(pixels) {
  const stride = WIDTH * 3
  const bytes = new Uint8Array(WIDTH * HEIGHT * 3)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(pixels[i])
  const raw = Buffer.alloc((stride + 1) * HEIGHT)
  const candidate = Buffer.alloc(stride)
  for (let y = 0; y < HEIGHT; y++) {
    const cur = bytes.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? bytes.subarray((y - 1) * stride, y * stride) : null
    let bestType = 0
    let bestSum = Infinity
    let best = Buffer.from(cur)
    for (const type of [0, 1, 2]) {
      let sum = 0
      for (let x = 0; x < stride; x++) {
        const left = x >= 3 ? cur[x - 3] : 0
        const up = prev ? prev[x] : 0
        const v = type === 0 ? cur[x] : type === 1 ? cur[x] - left : cur[x] - up
        candidate[x] = v & 0xff
        sum += candidate[x] < 128 ? candidate[x] : 256 - candidate[x]
      }
      if (sum < bestSum) {
        bestSum = sum
        bestType = type
        best = Buffer.from(candidate)
      }
    }
    raw[y * (stride + 1)] = bestType
    best.copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(WIDTH, 0)
  ihdr.writeUInt32BE(HEIGHT, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------------------------
// The small "PLACEHOLDER" mark, in a 5x7 pixel font (only the letters it needs).

const GLYPHS = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
}

function placeholderMark(pixels) {
  const text = "PLACEHOLDER"
  const scale = 4
  const advance = 6 * scale
  const width = text.length * advance - scale
  let x = Math.round((WIDTH - width) / 2)
  const y = 1236
  const cells = []
  for (const letter of text) {
    GLYPHS[letter].forEach((line, row) => {
      ;[...line].forEach((bit, col) => {
        if (bit === "1") {
          cells.push(rect(x + col * scale, y + row * scale, x + (col + 1) * scale, y + (row + 1) * scale))
        }
      })
    })
    x += advance
  }
  fill(pixels, cells, MARK)
}

// ---------------------------------------------------------------------------------------------
// The drawings. Coordinates are in pixels of the 1160 x 1360 canvas; centre line x = 580.

function mirror(points) {
  return points.map(([x, y]) => [WIDTH - x, y])
}

function groundShadow(pixels, y, rx) {
  fill(pixels, [ellipse(580, y, rx, 34)], GROUND)
}

function drawTShirt(pixels) {
  const body = "#d9674c"
  const shade = "#b9523b"
  groundShadow(pixels, 1090, 230)
  const neckL = [505, 300]
  const neckR = [655, 300]
  const left = [
    [390, 340],
    [245, 455],
    [318, 572],
    [392, 515],
    [396, 1050],
  ]
  const outline = [
    neckL,
    ...left,
    ...quad([396, 1050], [580, 1066], [764, 1050]).slice(1, -1),
    ...mirror(left).reverse(),
    neckR,
    ...quad(neckR, [580, 392], neckL).slice(1, -1),
  ]
  fill(pixels, [outline], body)
  // inside of the back neck
  fill(pixels, [band(quad(neckL, [580, 335], neckR), quad(neckL, [580, 392], neckR))], shade)
  // neck rib
  fill(
    pixels,
    [band(quad([505, 300], [580, 392], [655, 300]), quad([490, 296], [580, 418], [670, 296]))],
    "#c45a42"
  )
  // sleeve hems: a band just inside each sleeve opening, between the shoulder and underarm lines
  const along = (from, to, d) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1])
    return [from[0] + ((to[0] - from[0]) / len) * d, from[1] + ((to[1] - from[1]) / len) * d]
  }
  const hem = [
    along([245, 455], [390, 340], 16),
    along([245, 455], [390, 340], 30),
    along([318, 572], [392, 515], 30),
    along([318, 572], [392, 515], 16),
  ]
  fill(pixels, [hem], shade)
  fill(pixels, [mirror(hem)], shade)
}

function drawJersey(pixels) {
  const body = "#2f5da8"
  const trim = "#f4f2ee"
  const shade = "#244a87"
  groundShadow(pixels, 1090, 230)
  const neckL = [510, 296]
  const neckR = [650, 296]
  const left = [
    [395, 330],
    [258, 430],
    [325, 560],
    [400, 505],
    [404, 1040],
  ]
  const outline = [
    neckL,
    ...left,
    ...quad([404, 1040], [580, 1058], [756, 1040]).slice(1, -1),
    ...mirror(left).reverse(),
    neckR,
    [580, 430],
  ]
  fill(pixels, [outline], body)
  // inside of the back neck
  fill(pixels, [[neckL, ...quad(neckL, [580, 326], neckR).slice(1, -1), neckR, [580, 430]]], shade)
  // V-neck trim
  fill(pixels, [[[490, 302], [510, 296], [580, 430], [650, 296], [670, 302], [580, 466]]], trim)
  // side panels and sleeve cuffs, both sides
  for (const side of [1, -1]) {
    const x = (v) => (side === 1 ? v : WIDTH - v)
    fill(pixels, [[[x(400), 505], [x(432), 520], [x(436), 1047], [x(404), 1040]]], trim)
    fill(pixels, [[[x(258), 430], [x(278), 418], [x(347), 546], [x(325), 560]]], trim)
  }
  // shoulder yoke line (raglan seam)
  fill(pixels, [bar(520, 300, 410, 510, 6), bar(640, 300, 750, 510, 6)], shade)
}

function drawJacket(pixels) {
  const body = "#2e5e4e"
  const rib = "#244b3e"
  const zip = "#d8d4cc"
  groundShadow(pixels, 1100, 240)
  const left = [
    [500, 300],
    [372, 342],
    [300, 520],
    [252, 990],
    [334, 1004],
    [384, 600],
    [398, 1066],
  ]
  const outline = [
    [508, 236],
    ...left,
    ...mirror(left).reverse(),
    [652, 236],
  ]
  fill(pixels, [outline], body)
  // stand collar
  fill(pixels, [[[508, 236], [652, 236], [660, 300], [580, 318], [500, 300]]], rib)
  // ribbed hem and cuffs
  fill(pixels, [rect(398, 1022, 762, 1066)], rib)
  for (const side of [1, -1]) {
    const x = (v) => (side === 1 ? v : WIDTH - v)
    fill(pixels, [[[x(257), 948], [x(339), 960], [x(334), 1004], [x(252), 990]]], rib)
    // welt pocket
    fill(pixels, [bar(x(440), 860, x(480), 760, 12)], rib)
    // sleeve seam
    fill(pixels, [bar(x(372), 342, x(384), 600, 5)], rib)
  }
  // zip
  fill(pixels, [rect(575, 240, 585, 1066)], zip)
  fill(pixels, [roundedRect(568, 300, 592, 352, 6)], zip)
}

function drawFitKit(pixels) {
  groundShadow(pixels, 1068, 280)
  const front = "#c9a26b"
  const top = "#ddbb86"
  const side = "#b08a55"
  const tape = "#efe3c8"
  // box: front face, top face, side face
  fill(pixels, [rect(330, 640, 790, 1040)], front)
  fill(pixels, [[[330, 640], [420, 540], [880, 540], [790, 640]]], top)
  fill(pixels, [[[790, 640], [880, 540], [880, 940], [790, 1040]]], side)
  // packing tape over the lid and down the front
  fill(pixels, [[[530, 640], [620, 540], [660, 540], [570, 640]]], tape)
  fill(pixels, [rect(530, 640, 570, 760)], tape)
  // folded garment peeking out of the lid
  fill(pixels, [[[455, 556], [500, 470], [700, 470], [745, 556]]], "#2f5da8")
  fill(pixels, [[[500, 470], [560, 470], [580, 500], [600, 470], [700, 470], [690, 488], [510, 488]]], "#244a87")
  fill(pixels, [[[420, 540], [880, 540], [860, 562], [440, 562]]], top)
  // hanger symbol on the front
  const hx = 560
  fill(pixels, [bar(hx, 870, 430, 960, 12)], side)
  fill(pixels, [bar(hx, 870, 690, 960, 12)], side)
  fill(pixels, [bar(430, 960, 690, 960, 12)], side)
  fill(pixels, [bar(hx, 870, hx, 846, 12)], side)
  // the hook: an arc from the bottom, round the right and the top, to the left
  const hook = []
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI / 2 - (i / 20) * (Math.PI * 1.6)
    hook.push([hx + 22 * Math.cos(a), 824 + 22 * Math.sin(a)])
  }
  for (let i = 0; i < hook.length - 1; i++) {
    fill(pixels, [bar(hook[i][0], hook[i][1], hook[i + 1][0], hook[i + 1][1], 12)], side)
  }
}

function drawRush(pixels) {
  groundShadow(pixels, 1040, 230)
  const amber = "#e59a2b"
  const dark = "#b8731a"
  const face = "#fff6e6"
  const cx = 650
  const cy = 720
  // speed lines, left of the case (the whole drawing stays inside the 9:16 thumbnail crop)
  const lx = cx - 290
  fill(
    pixels,
    [bar(lx - 100, 640, lx, 640, 26), bar(lx - 130, 720, lx, 720, 26), bar(lx - 85, 800, lx, 800, 26)],
    dark
  )
  // crown and side button
  fill(pixels, [roundedRect(cx - 50, 400, cx + 50, 446, 10)], dark)
  fill(pixels, [rect(cx - 22, 440, cx + 22, 490)], dark)
  fill(pixels, [bar(cx + 170, 520, cx + 200, 490, 34)], dark)
  // case and face
  fill(pixels, [circle(cx, cy, 250)], amber)
  fill(pixels, [circle(cx, cy, 206)], face)
  // ticks at 12, 3, 6, 9
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const long = i % 3 === 0
    const r0 = long ? 160 : 176
    fill(
      pixels,
      [bar(cx + r0 * Math.sin(a), cy - r0 * Math.cos(a), cx + 190 * Math.sin(a), cy - 190 * Math.cos(a), long ? 14 : 8)],
      dark
    )
  }
  // hands: one to 12, one towards 2 o'clock, and the coloured elapsed wedge between them
  const wedge = [[cx, cy]]
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * (Math.PI / 3)
    wedge.push([cx + 150 * Math.sin(a), cy - 150 * Math.cos(a)])
  }
  fill(pixels, [wedge], "#f6cf8f")
  fill(pixels, [bar(cx, cy, cx, cy - 150, 16)], dark)
  fill(pixels, [bar(cx, cy, cx + 150 * Math.sin(Math.PI / 3), cy - 150 * Math.cos(Math.PI / 3), 16)], dark)
  fill(pixels, [circle(cx, cy, 20)], dark)
}

const DRAWINGS = {
  "jersey.png": drawJersey,
  "t-shirt.png": drawTShirt,
  "jacket.png": drawJacket,
  "fit-kit.png": drawFitKit,
  "rush-add-on.png": drawRush,
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [file, draw] of Object.entries(DRAWINGS)) {
  const pixels = createImage(BACKGROUND)
  draw(pixels)
  placeholderMark(pixels)
  const png = encodePng(pixels)
  writeFileSync(join(OUT_DIR, file), png)
  console.log(`${file}: ${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(1)} KB`)
}
