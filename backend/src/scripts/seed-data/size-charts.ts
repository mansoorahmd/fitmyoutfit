import type { PlaceholderData, SizeChartSeed } from "./types"

/**
 * PLACEHOLDER DATA: garment-measurement charts (the garment laid flat), in cm, per product handle.
 * Real input: the pattern maker's size charts. Every chart is marked `draft: true`, which makes the
 * storefront show a "draft measurements" note; set it to false only with real measurements.
 *
 * The seed writes a chart into the product's `metadata.size_chart` only when the product has none,
 * so a chart edited in the admin is kept. Rows follow the size order in sizes.ts. The fit kit is a
 * set of sample jerseys in every size, so it carries the jersey's chart.
 */
const jersey: SizeChartSeed = {
  draft: true,
  unit: "cm",
  columns: [
    { key: "chest", label: "Chest width" },
    { key: "length", label: "Body length" },
  ],
  rows: [
    { size: "YS", values: { chest: 38, length: 52 } },
    { size: "YM", values: { chest: 41, length: 56 } },
    { size: "YL", values: { chest: 44, length: 60 } },
    { size: "YXL", values: { chest: 47, length: 63 } },
    { size: "XS", values: { chest: 48, length: 66 } },
    { size: "S", values: { chest: 51, length: 69 } },
    { size: "M", values: { chest: 54, length: 72 } },
    { size: "L", values: { chest: 57, length: 74 } },
    { size: "XL", values: { chest: 60, length: 76 } },
    { size: "2XL", values: { chest: 63, length: 78 } },
    { size: "3XL", values: { chest: 66, length: 80 } },
  ],
}

const tShirt: SizeChartSeed = {
  draft: true,
  unit: "cm",
  columns: [
    { key: "chest", label: "Chest width" },
    { key: "length", label: "Body length" },
    { key: "sleeve", label: "Sleeve length" },
  ],
  rows: [
    { size: "YS", values: { chest: 37, length: 50, sleeve: 13 } },
    { size: "YM", values: { chest: 40, length: 54, sleeve: 14 } },
    { size: "YL", values: { chest: 43, length: 58, sleeve: 15 } },
    { size: "YXL", values: { chest: 46, length: 61, sleeve: 16 } },
    { size: "XS", values: { chest: 47, length: 65, sleeve: 17 } },
    { size: "S", values: { chest: 50, length: 68, sleeve: 19 } },
    { size: "M", values: { chest: 53, length: 71, sleeve: 20 } },
    { size: "L", values: { chest: 56, length: 73, sleeve: 21 } },
    { size: "XL", values: { chest: 59, length: 75, sleeve: 22 } },
    { size: "2XL", values: { chest: 62, length: 77, sleeve: 23 } },
    { size: "3XL", values: { chest: 65, length: 79, sleeve: 24 } },
  ],
}

const jacket: SizeChartSeed = {
  draft: true,
  unit: "cm",
  columns: [
    { key: "chest", label: "Chest width" },
    { key: "length", label: "Body length" },
    { key: "sleeve", label: "Sleeve length" },
  ],
  rows: [
    { size: "YS", values: { chest: 41, length: 50, sleeve: 48 } },
    { size: "YM", values: { chest: 44, length: 54, sleeve: 52 } },
    { size: "YL", values: { chest: 47, length: 58, sleeve: 56 } },
    { size: "YXL", values: { chest: 50, length: 61, sleeve: 59 } },
    { size: "XS", values: { chest: 51, length: 64, sleeve: 60 } },
    { size: "S", values: { chest: 54, length: 66, sleeve: 62 } },
    { size: "M", values: { chest: 57, length: 68, sleeve: 63 } },
    { size: "L", values: { chest: 60, length: 70, sleeve: 64 } },
    { size: "XL", values: { chest: 63, length: 72, sleeve: 65 } },
    { size: "2XL", values: { chest: 66, length: 74, sleeve: 66 } },
    { size: "3XL", values: { chest: 69, length: 76, sleeve: 67 } },
  ],
}

export const sizeCharts: PlaceholderData<Record<string, SizeChartSeed>> = {
  placeholder: true,
  note: "Plausible flat-garment measurements, not real ones: replace with the pattern maker's charts.",
  data: {
    jersey,
    "t-shirt": tShirt,
    jacket,
    "fit-kit": jersey,
  },
}
