import { describe, expect, it } from "vitest"
import type { Supplement } from "./supplements-data"
import { buildInventory } from "./inventory"

const baseSupplement: Supplement = {
  id: "vitamin-d",
  name: "Vitamin D3 + K2",
  brand: "Thorne",
  potency: "5000 IU",
  dosage: "1 capsule",
  form: "Capsule",
  startedOn: "2026-05-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
  days: [0, 1, 2, 3, 4, 5, 6],
  times: ["08:00"],
  totalCount: 60,
  currentCount: 60,
  restockReminder: true,
  restockThreshold: 10,
}

const DATE = "2026-05-10"

function makeSupplement(overrides: Partial<Supplement> = {}): Supplement {
  return { ...baseSupplement, ...overrides }
}

function rowsFor(supplements: Supplement[]) {
  return buildInventory(supplements, DATE).rows
}

describe("buildInventory course state", () => {
  it("classifies the course window as upcoming, current, or finished", () => {
    const upcoming = makeSupplement({ startedOn: "2026-05-11" })
    const current = makeSupplement({ startedOn: "2026-05-01", durationDays: 30 })
    const finished = makeSupplement({ startedOn: "2026-01-01", durationDays: 10 })

    expect(rowsFor([upcoming])[0].courseState).toBe("upcoming")
    expect(rowsFor([current])[0].courseState).toBe("current")
    expect(rowsFor([finished])[0].courseState).toBe("finished")
  })

  it("treats the duration boundary as the first finished day", () => {
    const supplement = makeSupplement({ startedOn: "2026-05-01", durationDays: 30 })

    expect(buildInventory([supplement], "2026-05-30").rows[0].courseState).toBe("current")
    expect(buildInventory([supplement], "2026-05-31").rows[0].courseState).toBe("finished")
  })

  it("ignores weekdays and cycle breaks", () => {
    const weekdaysOnly = makeSupplement({ startedOn: "2026-05-01", days: [1] })
    const onCycleBreak = makeSupplement({
      startedOn: "2026-05-01",
      cycleActiveDays: 5,
      cycleBreakDays: 2,
    })

    // 2026-05-10 is a Sunday, and 2026-05-06 is the sixth day of a 5-on/2-off cycle.
    expect(rowsFor([weekdaysOnly])[0].courseState).toBe("current")
    expect(buildInventory([onCycleBreak], "2026-05-06").rows[0].courseState).toBe("current")
  })
})

describe("buildInventory stock fields", () => {
  it("derives the ratio and a clamped display percent", () => {
    const row = rowsFor([makeSupplement({ totalCount: 60, currentCount: 30 })])[0]

    expect(row.ratio).toBe(0.5)
    expect(row.percent).toBe(50)
  })

  it("treats a missing bottle size as an unknown ratio", () => {
    const row = rowsFor([makeSupplement({ totalCount: 0, currentCount: 0 })])[0]

    expect(row.ratio).toBeNull()
    expect(row.percent).toBe(0)
  })

  it("marks negative inventory as overdrawn without a negative bar", () => {
    const row = rowsFor([makeSupplement({ totalCount: 60, currentCount: -2 })])[0]

    expect(row.overdrawn).toBe(true)
    expect(row.ratio).toBeCloseTo(-2 / 60)
    expect(row.percent).toBe(0)
  })

  it("clamps the display percent when inventory exceeds the bottle size", () => {
    const row = rowsFor([makeSupplement({ totalCount: 10, currentCount: 15 })])[0]

    expect(row.ratio).toBe(1.5)
    expect(row.percent).toBe(100)
  })
})

describe("buildInventory low stock", () => {
  it("alerts at or below the threshold for a current supplement", () => {
    expect(rowsFor([makeSupplement({ currentCount: 10, restockThreshold: 10 })])[0].lowStock).toBe(true)
    expect(rowsFor([makeSupplement({ currentCount: 11, restockThreshold: 10 })])[0].lowStock).toBe(false)
  })

  it("requires restock tracking", () => {
    const row = rowsFor([
      makeSupplement({ currentCount: 0, restockReminder: false }),
    ])[0]

    expect(row.lowStock).toBe(false)
  })

  it("does not alert for upcoming or finished courses", () => {
    const upcoming = makeSupplement({ startedOn: "2026-05-11", currentCount: 0 })
    const finished = makeSupplement({
      startedOn: "2026-01-01",
      durationDays: 10,
      currentCount: 0,
    })

    expect(rowsFor([upcoming])[0].lowStock).toBe(false)
    expect(rowsFor([finished])[0].lowStock).toBe(false)
  })

  it("still reports overdrawn for a supplement that is not low stock", () => {
    const row = rowsFor([
      makeSupplement({ currentCount: -1, restockReminder: false }),
    ])[0]

    expect(row.lowStock).toBe(false)
    expect(row.overdrawn).toBe(true)
  })
})

describe("buildInventory ordering", () => {
  it("groups current before upcoming before finished and sorts each group by urgency", () => {
    const currentOverdrawn = makeSupplement({
      id: "overdrawn",
      name: "Overdrawn",
      currentCount: -1,
    })
    const currentLow = makeSupplement({ id: "low", name: "Low", currentCount: 10 })
    const currentHigh = makeSupplement({ id: "high", name: "High", currentCount: 50 })
    const currentUnknown = makeSupplement({
      id: "unknown",
      name: "Unknown",
      totalCount: 0,
      currentCount: 0,
    })
    const upcoming = makeSupplement({
      id: "upcoming",
      name: "Upcoming",
      startedOn: "2026-06-01",
      currentCount: 5,
    })
    const finished = makeSupplement({
      id: "finished",
      name: "Finished",
      startedOn: "2026-01-01",
      durationDays: 10,
      currentCount: 5,
    })

    const rows = rowsFor([
      finished,
      upcoming,
      currentUnknown,
      currentHigh,
      currentLow,
      currentOverdrawn,
    ])

    expect(rows.map((row) => row.supplement.id)).toEqual([
      "overdrawn",
      "low",
      "high",
      "unknown",
      "upcoming",
      "finished",
    ])
  })

  it("breaks equal ratios by name", () => {
    const alpha = makeSupplement({ id: "alpha", name: "Alpha", totalCount: 10, currentCount: 5 })
    const beta = makeSupplement({ id: "beta", name: "Beta", totalCount: 10, currentCount: 5 })

    expect(rowsFor([beta, alpha]).map((row) => row.supplement.id)).toEqual([
      "alpha",
      "beta",
    ])
  })
})

describe("buildInventory summary", () => {
  it("counts course states from the same rows the views render", () => {
    const inventory = buildInventory(
      [
        makeSupplement({ id: "current", currentCount: -1 }),
        makeSupplement({ id: "current-low", currentCount: 10 }),
        makeSupplement({ id: "current-high", currentCount: 50 }),
        makeSupplement({ id: "current-unknown", totalCount: 0, currentCount: 0 }),
        makeSupplement({
          id: "upcoming",
          startedOn: "2026-06-01",
          currentCount: 5,
        }),
        makeSupplement({
          id: "finished",
          startedOn: "2026-01-01",
          durationDays: 10,
          currentCount: 5,
        }),
      ],
      DATE,
    )

    expect(inventory.summary).toEqual({
      current: 4,
      upcoming: 1,
      finished: 1,
      lowStock: 3,
      overdrawn: 1,
    })
  })
})
