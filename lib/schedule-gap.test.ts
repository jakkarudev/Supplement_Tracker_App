import { describe, expect, it } from "vitest"
import { minimumScheduledGap } from "./schedule-gap"
import type { Supplement } from "./supplements-data"

const DATE = "2026-05-04"

function makeSupplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: "copper",
    name: "Copper",
    brand: "Now Foods",
    potency: "2 mg",
    dosage: "1 capsule",
    form: "Capsule",
    startedOn: "2026-01-01",
    days: [0, 1, 2, 3, 4, 5, 6],
    times: ["08:00"],
    totalCount: 60,
    currentCount: 60,
    restockReminder: false,
    restockThreshold: 10,
    ...overrides,
  }
}

describe("minimumScheduledGap", () => {
  it("is the distance between the two scheduled times", () => {
    const copper = makeSupplement({ id: "copper", times: ["08:00"] })
    const zinc = makeSupplement({ id: "zinc", times: ["12:00"] })

    expect(minimumScheduledGap(copper, zinc, DATE)).toBe(240)
  })

  it("is the smallest distance over the horizon", () => {
    const copper = makeSupplement({ id: "copper", times: ["08:00", "20:00"] })
    const zinc = makeSupplement({ id: "zinc", times: ["12:00"] })

    expect(minimumScheduledGap(copper, zinc, DATE)).toBe(240)
  })

  it("measures across the logical day boundary", () => {
    const copper = makeSupplement({ id: "copper", times: ["23:30"] })
    const zinc = makeSupplement({ id: "zinc", times: ["03:00"] })

    expect(minimumScheduledGap(copper, zinc, DATE)).toBe(210)
  })

  it("is null when the two never share a day in the horizon", () => {
    const copper = makeSupplement({ id: "copper", days: [1], times: ["08:00"] })
    const zinc = makeSupplement({ id: "zinc", days: [2], times: ["12:00"] })

    expect(minimumScheduledGap(copper, zinc, DATE, 7)).toBeNull()
  })
})
