/**
 * Exact money arithmetic for the plain rules. Plain TypeScript, no Medusa imports.
 *
 * Medusa keeps amounts as decimal strings (`raw_amount: { value: "333.5" }`) and hands them out as
 * JavaScript numbers too. Sums and percentages of those numbers in floating point are not exact
 * (0.1 + 0.2), and rounding a figure that is a hair below a half rounds the wrong way. So the rules
 * that work out an amount (the rush charge, what is left to capture) read every amount into an
 * exact fraction of two big integers, compute on those, and round once, at the end.
 */

/** An exact rational number, `num / den`, with `den` > 0. */
export type Exact = { readonly num: bigint; readonly den: bigint }

/**
 * What an amount may be given as: a number, a decimal string ("2000", "333.5", "-0.01",
 * "1.5e-7"), Medusa's big-number object (`{ value: "333.5" }`), or an Exact.
 */
export type AmountInput = number | string | { value?: unknown } | Exact

const DECIMAL_RE = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    ;[x, y] = [y, x % y]
  }
  return x === 0n ? 1n : x
}

function normalize(num: bigint, den: bigint): Exact {
  if (den === 0n) {
    throw new Error("Division by zero")
  }
  if (den < 0n) {
    num = -num
    den = -den
  }
  const g = gcd(num, den)
  return { num: num / g, den: den / g }
}

function isExact(value: unknown): value is Exact {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Exact).num === "bigint" &&
    typeof (value as Exact).den === "bigint"
  )
}

function parseDecimalString(text: string): Exact | null {
  const match = DECIMAL_RE.exec(text.trim())
  if (!match) {
    return null
  }
  const [, sign, whole = "", fraction = "", exponent = "0"] = match
  if (whole === "" && fraction === "") {
    return null
  }
  const digits = BigInt(`${whole}${fraction}` || "0")
  const shift = BigInt(exponent) - BigInt(fraction.length)
  const signed = sign === "-" ? -digits : digits
  return shift >= 0n
    ? normalize(signed * 10n ** shift, 1n)
    : normalize(signed, 10n ** -shift)
}

/**
 * The exact value of `value`, or null when it is not a finite amount. A number is read from its
 * shortest decimal form, so 0.1 is exactly one tenth (the amount Medusa meant), not the binary
 * neighbour of 0.1.
 */
export function readExact(value: unknown): Exact | null {
  if (isExact(value)) {
    return value.den > 0n ? normalize(value.num, value.den) : null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? parseDecimalString(String(value)) : null
  }
  if (typeof value === "string") {
    return parseDecimalString(value)
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return readExact((value as { value?: unknown }).value)
  }
  return null
}

/** Like readExact, but throws (naming `what`) instead of returning null. */
export function exact(value: unknown, what = "amount"): Exact {
  const result = readExact(value)
  if (!result) {
    throw new Error(`Expected a finite ${what}, got ${JSON.stringify(value)}`)
  }
  return result
}

export const ZERO: Exact = { num: 0n, den: 1n }

export function add(a: Exact, b: Exact): Exact {
  return normalize(a.num * b.den + b.num * a.den, a.den * b.den)
}

export function sub(a: Exact, b: Exact): Exact {
  return normalize(a.num * b.den - b.num * a.den, a.den * b.den)
}

export function mul(a: Exact, b: Exact): Exact {
  return normalize(a.num * b.num, a.den * b.den)
}

export function div(a: Exact, b: Exact): Exact {
  if (b.num === 0n) {
    throw new Error("Division by zero")
  }
  return normalize(a.num * b.den, a.den * b.num)
}

export function sum(values: readonly Exact[]): Exact {
  return values.reduce(add, ZERO)
}

/** -1, 0 or 1 as `a` is below, equal to or above `b`. */
export function compare(a: Exact, b: Exact): -1 | 0 | 1 {
  const left = a.num * b.den
  const right = b.num * a.den
  return left < right ? -1 : left > right ? 1 : 0
}

export function max(a: Exact, b: Exact): Exact {
  return compare(a, b) >= 0 ? a : b
}

/**
 * `value` rounded half up (away from zero for a half: 0.5 to 1, -0.5 to -1) to `digits` decimal
 * places. Exact: 2.0649999… never becomes 2.07 and 2.065 always does.
 */
export function roundHalfUp(value: Exact, digits: number): Exact {
  if (!Number.isInteger(digits) || digits < 0) {
    throw new Error(`Expected a whole number of decimal digits, got ${digits}`)
  }
  const scale = 10n ** BigInt(digits)
  const scaled = value.num * scale
  const magnitude = scaled < 0n ? -scaled : scaled
  const rounded = (2n * magnitude + value.den) / (2n * value.den)
  return normalize(scaled < 0n ? -rounded : rounded, scale)
}

/**
 * The decimal form of `value` with exactly `digits` decimal places ("44.00", "400"). Throws when
 * `value` is not exactly representable with that many places: round it first.
 */
export function toFixedString(value: Exact, digits: number): string {
  const scale = 10n ** BigInt(digits)
  const scaled = value.num * scale
  if (scaled % value.den !== 0n) {
    throw new Error(`Not exact at ${digits} decimal places; round it first`)
  }
  const units = scaled / value.den
  const negative = units < 0n
  const text = (negative ? -units : units).toString().padStart(digits + 1, "0")
  const whole = digits === 0 ? text : text.slice(0, -digits)
  const fraction = digits === 0 ? "" : `.${text.slice(-digits)}`
  return `${negative ? "-" : ""}${whole}${fraction}`
}

/**
 * The shortest decimal form of `value` ("333.5", "0.005", "1124.995"). Throws for a value with no
 * finite decimal form (one third): such values are only met inside a calculation, never stored.
 */
export function toDecimalString(value: Exact): string {
  let den = value.den
  let digits = 0
  while (den % 10n === 0n) {
    den /= 10n
    digits++
  }
  while (den % 2n === 0n || den % 5n === 0n) {
    den = den % 2n === 0n ? den / 2n : den / 5n
    digits++
  }
  if (den !== 1n) {
    throw new Error("No finite decimal form")
  }
  return toFixedString(value, digits)
}

/** The nearest JavaScript number, for JSON answers (exact for any amount a currency can hold). */
export function toNumber(value: Exact): number {
  if (value.den === 1n) {
    return Number(value.num)
  }
  try {
    return Number(toDecimalString(value))
  } catch {
    return Number(value.num) / Number(value.den)
  }
}
