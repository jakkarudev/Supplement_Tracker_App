import { describe, expect, it } from "vitest"
import { formatTimeForDisplay, normalizeTimeOfDay, periodFromTime } from "./time"

describe("normalizeTimeOfDay", () => {
  it("passes canonical 24-hour times through unchanged", () => {
    expect(normalizeTimeOfDay("00:00")).toBe("00:00")
    expect(normalizeTimeOfDay("08:05")).toBe("08:05")
    expect(normalizeTimeOfDay("23:59")).toBe("23:59")
  })

  it("normalizes legacy 12-hour display times", () => {
    expect(normalizeTimeOfDay("08:00 AM")).toBe("08:00")
    expect(normalizeTimeOfDay("12:00 AM")).toBe("00:00")
    expect(normalizeTimeOfDay("12:30 PM")).toBe("12:30")
    expect(normalizeTimeOfDay("08:05 PM")).toBe("20:05")
    expect(normalizeTimeOfDay("8:05 am")).toBe("08:05")
  })

  it("rejects values that are not clock times", () => {
    expect(normalizeTimeOfDay("")).toBeNull()
    expect(normalizeTimeOfDay("8:00")).toBeNull()
    expect(normalizeTimeOfDay("24:00")).toBeNull()
    expect(normalizeTimeOfDay("12:60")).toBeNull()
    expect(normalizeTimeOfDay("13:00 PM")).toBeNull()
    expect(normalizeTimeOfDay("00:00 AM")).toBeNull()
    expect(normalizeTimeOfDay("noon")).toBeNull()
    expect(normalizeTimeOfDay(null)).toBeNull()
    expect(normalizeTimeOfDay(8)).toBeNull()
  })
})

describe("formatTimeForDisplay", () => {
  it("renders canonical times as zero-padded 12-hour display times", () => {
    expect(formatTimeForDisplay("00:00")).toBe("12:00 AM")
    expect(formatTimeForDisplay("08:00")).toBe("08:00 AM")
    expect(formatTimeForDisplay("12:00")).toBe("12:00 PM")
    expect(formatTimeForDisplay("20:30")).toBe("08:30 PM")
    expect(formatTimeForDisplay("23:59")).toBe("11:59 PM")
  })
})

describe("periodFromTime", () => {
  it("derives the period at its boundaries", () => {
    expect(periodFromTime("00:00")).toBe("Morning")
    expect(periodFromTime("11:59")).toBe("Morning")
    expect(periodFromTime("12:00")).toBe("Afternoon")
    expect(periodFromTime("16:59")).toBe("Afternoon")
    expect(periodFromTime("17:00")).toBe("Evening")
    expect(periodFromTime("20:59")).toBe("Evening")
    expect(periodFromTime("21:00")).toBe("Night")
    expect(periodFromTime("23:59")).toBe("Night")
  })
})
