import { seedData } from "../../seed-data"
import { planSizeCharts, SIZE_CHART_KEY } from "../size-chart-plan"

const charts = seedData.sizeCharts.data

describe("size chart seed data", () => {
  it("gives the three garments and the fit kit a draft chart in cm, one row per size in order", () => {
    expect(Object.keys(charts).sort()).toEqual(["fit-kit", "jacket", "jersey", "t-shirt"])
    for (const chart of Object.values(charts)) {
      expect(chart.draft).toBe(true)
      expect(chart.unit).toBe("cm")
      expect(chart.rows.map((r) => r.size)).toEqual(seedData.sizes.data)
      expect(chart.columns.map((c) => c.key)).toEqual(expect.arrayContaining(["chest", "length"]))
    }
  })

  it("grows with the size: chest and length never shrink from one size to the next", () => {
    for (const chart of Object.values(charts)) {
      for (const key of chart.columns.map((c) => c.key)) {
        const values = chart.rows.map((r) => r.values[key])
        expect([...values].sort((a, b) => a - b)).toEqual(values)
      }
    }
  })
})

describe("planSizeCharts", () => {
  it("adds the chart to a product without one, keeping its other metadata", () => {
    const plan = planSizeCharts([{ id: "p1", handle: "jersey", metadata: { kind: "garment" } }], charts)
    expect(plan).toEqual([
      { productId: "p1", handle: "jersey", metadata: { kind: "garment", size_chart: charts.jersey } },
    ])
  })

  it("never replaces a chart that is there, whatever it holds", () => {
    const edited = { draft: false, unit: "cm", columns: [], rows: [] }
    expect(
      planSizeCharts(
        [
          { id: "p1", handle: "jersey", metadata: { [SIZE_CHART_KEY]: edited } },
          { id: "p2", handle: "jacket", metadata: { [SIZE_CHART_KEY]: "broken" } },
        ],
        charts
      )
    ).toEqual([])
  })

  it("treats null metadata and a null chart as missing, and skips products not in the store", () => {
    const plan = planSizeCharts(
      [
        { id: "p1", handle: "t-shirt", metadata: null },
        { id: "p2", handle: "fit-kit", metadata: { size_chart: null } },
        { id: "p3", handle: "rush-add-on", metadata: {} },
      ],
      charts
    )
    expect(plan.map((p) => p.handle)).toEqual(["t-shirt", "fit-kit"])
  })

  it("writes a copy, so editing one product's chart does not change another's", () => {
    const plan = planSizeCharts(
      [
        { id: "p1", handle: "jersey", metadata: {} },
        { id: "p2", handle: "fit-kit", metadata: {} },
      ],
      charts
    )
    expect(plan[0].metadata.size_chart).toEqual(plan[1].metadata.size_chart)
    expect(plan[0].metadata.size_chart).not.toBe(plan[1].metadata.size_chart)
    expect(plan[0].metadata.size_chart).not.toBe(charts.jersey)
  })
})
