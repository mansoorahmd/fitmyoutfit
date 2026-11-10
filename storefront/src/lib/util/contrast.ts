/** An sRGB colour as 0–255 channels. */
export type Rgb = [number, number, number]

/** "11 21 48" (the form of the brand tokens in globals.css) to channels. */
export const parseRgbTriplet = (value: string): Rgb => {
  const parts = value.trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Not an RGB triplet: "${value}"`)
  }
  return parts as Rgb
}

/** `top` at `alpha` (0–1) over `bottom`, blended in sRGB as browsers do. */
export const blend = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb

/** WCAG 2.x relative luminance. */
export const relativeLuminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2.x contrast ratio, from 1 to 21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  )
  return (hi + 0.05) / (lo + 0.05)
}
