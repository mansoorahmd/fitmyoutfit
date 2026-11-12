/**
 * Colour maths, written by hand (no dependency): reading a colour code, sRGB
 * to CIELAB, the CIEDE2000 colour difference, and the WCAG contrast ratio.
 * Plain functions, no DOM, so the editor, the backend and the proof checks
 * judge colours the same way.
 *
 * - Colour codes: 3 or 6 hexadecimal digits, with or without "#", any case,
 *   spaces around them ignored. Stored as upper-case "#RRGGBB".
 * - CIELAB: sRGB (IEC 61966-2-1) to CIE XYZ with the D65 white point, then
 *   to L*a*b* (CIE 15). Matrix and white point as Bruce Lindbloom publishes
 *   them (http://www.brucelindbloom.com/Eqn_RGB_XYZ_Matrix.html).
 * - CIEDE2000: G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 color-difference
 *   formula: implementation notes, supplementary test data, and mathematical
 *   observations", Color Research and Application 30 (2005); colour.test.ts
 *   checks all 34 of its test pairs.
 * - Contrast: WCAG 2.2 relative luminance and contrast ratio
 *   (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio).
 */

export interface Rgb {
  /** 0 to 255. */
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

const CODE = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/**
 * A colour code typed by a customer, as upper-case "#RRGGBB", or null when it
 * is not one. Accepts 3 or 6 hexadecimal digits, with or without "#"; "1af"
 * is "#11AAFF". Spaces around the code are ignored; anything else is refused.
 */
export function parseColourCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const match = CODE.exec(input.trim());
  if (!match) return null;
  const digits = match[1]!.toUpperCase();
  const six = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  return `#${six}`;
}

/** "#RRGGBB" (or any code `parseColourCode` accepts) to 0 to 255 channels. Throws a RangeError for anything else. */
export function hexToRgb(hex: string): Rgb {
  const code = parseColourCode(hex);
  if (!code) throw new RangeError(`not a colour code: ${JSON.stringify(hex)}`);
  return {
    r: parseInt(code.slice(1, 3), 16),
    g: parseInt(code.slice(3, 5), 16),
    b: parseInt(code.slice(5, 7), 16),
  };
}

/** sRGB channel (0 to 1) to linear light. */
function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** The D65 reference white, CIE XYZ with Y = 1. */
export const D65_WHITE = { X: 0.95047, Y: 1, Z: 1.08883 } as const;

/** An sRGB colour to CIE XYZ (D65, Y from 0 to 1). */
export function rgbToXyz({ r, g, b }: Rgb): { X: number; Y: number; Z: number } {
  const R = linear(r / 255);
  const G = linear(g / 255);
  const B = linear(b / 255);
  return {
    X: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    Y: 0.2126729 * R + 0.7151522 * G + 0.072175 * B,
    Z: 0.0193339 * R + 0.119192 * G + 0.9503041 * B,
  };
}

const EPSILON = 216 / 24389; // (6/29)^3
const KAPPA = 24389 / 27;

function labF(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

/** An sRGB colour code to CIELAB (D65). */
export function hexToLab(hex: string): Lab {
  const { X, Y, Z } = rgbToXyz(hexToRgb(hex));
  const fx = labF(X / D65_WHITE.X);
  const fy = labF(Y / D65_WHITE.Y);
  const fz = labF(Z / D65_WHITE.Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const deg = (radians: number) => (radians * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const POW25_7 = 25 ** 7;

/**
 * The CIEDE2000 colour difference between two CIELAB colours, with the
 * parametric factors kL = kC = kH = 1 (the usual choice for surface colours).
 * Symmetric, 0 for equal colours. About 1 is the smallest difference most
 * people see side by side.
 */
export function ciede2000(first: Lab, second: Lab): number {
  const { L: L1, a: a1, b: b1 } = first;
  const { L: L2, a: a2, b: b2 } = second;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, ap: number) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;
  const l = dLp / SL;
  const c = dCp / SC;
  const h = dHp / SH;
  return Math.sqrt(l * l + c * c + h * h + RT * c * h);
}

/** The CIEDE2000 difference between two colour codes. */
export function colourDifference(hexA: string, hexB: string): number {
  return ciede2000(hexToLab(hexA), hexToLab(hexB));
}

/** WCAG relative luminance of a colour code, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  // WCAG 2.2 uses 0.04045 as the threshold (the older 0.03928 makes no difference in 8 bits).
  return 0.2126 * linear(r / 255) + 0.7152 * linear(g / 255) + 0.0722 * linear(b / 255);
}

/** WCAG contrast ratio between two colour codes: 1 (the same) to 21 (black on white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
