import type { PlaceholderData } from "./types"

/**
 * PLACEHOLDER DATA: size list, youth to 3XL, in display order.
 * Real input: the pattern maker's size charts. Replace the list, not the logic.
 */
export const sizes: PlaceholderData<string[]> = {
  placeholder: true,
  note: "Placeholder size list until the pattern maker's size charts arrive.",
  data: ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"],
}
