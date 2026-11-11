// Fills the placeholders in a sentence from src/content/ ("{counted} of
// {required} garment pieces"). Wording stays data; numbers and names come
// from the caller (the backend's data), never from the sentence.

export type WordingValues = Record<string, string | number>

/**
 * Replaces each `{name}` with its value. A placeholder with no value is left
 * as it is, so a missing value shows up in review instead of vanishing.
 */
export const fill = (template: string, values: WordingValues = {}): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : whole
  )

/**
 * Like `fill`, but a value may be anything (a React element, such as an
 * amount wrapped left to right). Returns the pieces in order, for a
 * component to render.
 */
export const fillParts = <T>(
  template: string,
  values: Record<string, T | string | number>
): Array<T | string> =>
  template
    .split(/(\{\w+\})/)
    .filter((part) => part !== "")
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      if (name && Object.prototype.hasOwnProperty.call(values, name)) {
        const value = values[name]
        return typeof value === "number" ? String(value) : value
      }
      return part
    })

/** "1 piece" or "5 pieces": the singular form for exactly 1. */
export const countWords = (
  count: number,
  forms: { one: string; other: string }
): string => fill(count === 1 ? forms.one : forms.other, { n: count })
