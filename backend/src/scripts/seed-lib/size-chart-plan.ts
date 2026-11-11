/**
 * Which seeded products still need their placeholder size chart. Plain TypeScript, no Medusa
 * imports. The chart is stored as `metadata.size_chart` on the product.
 */
import type { SizeChartSeed } from "../seed-data/types"

/** Key of the chart in the product's metadata. */
export const SIZE_CHART_KEY = "size_chart"

export type ProductWithMetadata = {
  id: string
  handle: string
  metadata?: Record<string, unknown> | null
}

export type SizeChartPlanEntry = {
  productId: string
  handle: string
  /** The full metadata to set: the current metadata plus the chart. */
  metadata: Record<string, unknown>
}

/**
 * For every product in the seed's charts that exists and has no chart, the metadata to write.
 * A product with any `size_chart` value (for example one edited in the admin) is left alone.
 * Products are returned in the order of `charts`.
 */
export function planSizeCharts(
  existing: readonly ProductWithMetadata[],
  charts: Readonly<Record<string, SizeChartSeed>>
): SizeChartPlanEntry[] {
  const byHandle = new Map(existing.map((p) => [p.handle, p]))
  const plan: SizeChartPlanEntry[] = []
  for (const [handle, chart] of Object.entries(charts)) {
    const product = byHandle.get(handle)
    if (!product) {
      continue
    }
    const current = product.metadata?.[SIZE_CHART_KEY]
    if (current !== undefined && current !== null) {
      continue
    }
    plan.push({
      productId: product.id,
      handle,
      // A deep copy, so a chart shared by two products (jersey and fit kit) is written twice.
      metadata: { ...(product.metadata ?? {}), [SIZE_CHART_KEY]: JSON.parse(JSON.stringify(chart)) },
    })
  }
  return plan
}
