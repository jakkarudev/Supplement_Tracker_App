import { describe, expect, it } from "vitest"
import { summarizeAdherence } from "./adherence"

describe("summarizeAdherence", () => {
  it("returns a zero rate and streak for an empty series", () => {
    expect(summarizeAdherence([])).toEqual({ adherenceRate: 0, streak: 0 })
  })

  it("returns a zero rate and streak when nothing is scheduled", () => {
    expect(summarizeAdherence([null, null, null, null, null, null, null])).toEqual({
      adherenceRate: 0,
      streak: 0,
    })
  })

  it("averages completed past days and skips null days", () => {
    // past: 100, 50, -, 100, 0, - with a partial today of 80
    expect(summarizeAdherence([100, 50, null, 100, 0, null, 80])).toEqual({
      adherenceRate: 63,
      streak: 0,
    })
  })

  it("excludes a partial today from the average but keeps it in the series", () => {
    const dailyRates = [100, 100, 100, 100, 100, 100, 40]

    expect(summarizeAdherence(dailyRates)).toEqual({ adherenceRate: 100, streak: 6 })
    // The partial value stays available for the adherence chart.
    expect(dailyRates[6]).toBe(40)
  })

  it("counts a complete today in the average and extends the streak", () => {
    expect(summarizeAdherence([100, 100, 50, 100, 100, 100, 100])).toEqual({
      adherenceRate: 93,
      streak: 4,
    })
  })

  it("does not let a partial today break the streak", () => {
    expect(summarizeAdherence([null, 100, 100, 100, null, 100, 33])).toEqual({
      adherenceRate: 100,
      streak: 4,
    })
  })

  it("does not let a null today break or extend the streak", () => {
    expect(summarizeAdherence([null, 100, 100, 100, null, 100, null])).toEqual({
      adherenceRate: 100,
      streak: 4,
    })
  })

  it("breaks the streak on a past incomplete day", () => {
    expect(summarizeAdherence([100, 100, 100, 100, 60, 100, 100])).toEqual({
      adherenceRate: 94,
      streak: 2,
    })
  })

  it("starts a new streak when a complete today follows an incomplete day", () => {
    expect(summarizeAdherence([100, 100, 100, 100, 100, 50, 100])).toEqual({
      adherenceRate: 93,
      streak: 1,
    })
  })
})
