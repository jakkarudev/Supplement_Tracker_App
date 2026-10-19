import { describe, expect, it } from "vitest"
import type { Supplement } from "./supplements-data"
import {
  isSupplementActiveOnDate,
  isSupplementScheduledOnDate,
  upcomingScheduledDates,
} from "./supplement-schedule"

const supplement: Supplement = {
  id: "cycle",
  name: "Cycle supplement",
  brand: "",
  potency: "",
  dosage: "1 capsule",
  form: "Capsule",
  startedOn: "2026-05-01",
  durationDays: 10,
  cycleActiveDays: 3,
  cycleBreakDays: 2,
  days: [1, 2, 3, 4, 5, 6, 0],
  times: ["08:00 AM"],
  totalCount: 60,
  currentCount: 60,
  restockReminder: true,
  restockThreshold: 10,
}

describe("isSupplementActiveOnDate", () => {
  it("excludes dates before start and after finite duration", () => {
    const noCycle = { ...supplement, cycleActiveDays: undefined, cycleBreakDays: undefined }
    expect(isSupplementActiveOnDate(noCycle, "2026-04-30")).toBe(false)
    expect(isSupplementActiveOnDate(noCycle, "2026-05-01")).toBe(true)
    expect(isSupplementActiveOnDate(noCycle, "2026-05-10")).toBe(true)
    expect(isSupplementActiveOnDate(noCycle, "2026-05-11")).toBe(false)
  })

  it("excludes break days inside an active/break cycle", () => {
    expect(isSupplementActiveOnDate(supplement, "2026-05-01")).toBe(true)
    expect(isSupplementActiveOnDate(supplement, "2026-05-03")).toBe(true)
    expect(isSupplementActiveOnDate(supplement, "2026-05-04")).toBe(false)
    expect(isSupplementActiveOnDate(supplement, "2026-05-05")).toBe(false)
    expect(isSupplementActiveOnDate(supplement, "2026-05-06")).toBe(true)
  })
})

describe("isSupplementScheduledOnDate", () => {
  it("also requires the selected weekday", () => {
    const mondayOnly = {
      ...supplement,
      cycleActiveDays: undefined,
      cycleBreakDays: undefined,
      days: [1],
    }
    expect(isSupplementScheduledOnDate(mondayOnly, "2026-05-04")).toBe(true)
    expect(isSupplementScheduledOnDate(mondayOnly, "2026-05-05")).toBe(false)
  })
})

describe("upcomingScheduledDates", () => {
  it("returns active scheduled dates in the requested horizon", () => {
    const dates = upcomingScheduledDates(supplement, "2026-05-01", 7)
    expect(dates).toEqual(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-06", "2026-05-07"])
  })
})
