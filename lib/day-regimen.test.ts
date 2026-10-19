import { afterEach, describe, expect, it, vi } from "vitest"
import type { DoseLog, Supplement } from "./supplements-data"
import {
  addDays,
  dayOfWeek,
  dayRegimen,
  formatCalendarDate,
  formatTimeForDisplay,
  normalizeTimeOfDay,
  periodFromTime,
  scheduledDoses,
  today,
  upcomingScheduledDoses,
  weekDates,
} from "./day-regimen"

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

function makeSupplement(overrides: Partial<Supplement> = {}): Supplement {
  return { ...baseSupplement, ...overrides }
}

describe("time vocabulary", () => {
  it("normalizes canonical and legacy times and rejects invalid values", () => {
    expect(normalizeTimeOfDay("00:00")).toBe("00:00")
    expect(normalizeTimeOfDay("08:05")).toBe("08:05")
    expect(normalizeTimeOfDay("23:59")).toBe("23:59")
    expect(normalizeTimeOfDay("08:00 AM")).toBe("08:00")
    expect(normalizeTimeOfDay("12:00 AM")).toBe("00:00")
    expect(normalizeTimeOfDay("12:30 PM")).toBe("12:30")
    expect(normalizeTimeOfDay("8:05 am")).toBe("08:05")
    expect(normalizeTimeOfDay("")).toBeNull()
    expect(normalizeTimeOfDay("8:00")).toBeNull()
    expect(normalizeTimeOfDay("24:00")).toBeNull()
    expect(normalizeTimeOfDay("12:60")).toBeNull()
    expect(normalizeTimeOfDay("noon")).toBeNull()
    expect(normalizeTimeOfDay(null)).toBeNull()
  })

  it("formats canonical times as zero-padded 12-hour display times", () => {
    expect(formatTimeForDisplay("00:00")).toBe("12:00 AM")
    expect(formatTimeForDisplay("08:00")).toBe("08:00 AM")
    expect(formatTimeForDisplay("12:00")).toBe("12:00 PM")
    expect(formatTimeForDisplay("20:30")).toBe("08:30 PM")
    expect(formatTimeForDisplay("23:59")).toBe("11:59 PM")
  })

  it("derives the period at its boundaries, including midnight", () => {
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

describe("calendar vocabulary", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns today's local calendar date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 23, 30))
    expect(today()).toBe("2026-01-01")
    vi.setSystemTime(new Date(2026, 0, 2, 0, 30))
    expect(today()).toBe("2026-01-02")
  })

  it("adds days across month and year boundaries in local time", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
  })

  it("returns the Sunday-start week containing a date", () => {
    expect(weekDates("2026-05-06")).toEqual([
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
    ])
    expect(weekDates("2026-04-01")).toEqual([
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
    ])
    expect(weekDates("2027-01-01")).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ])
  })

  it("returns the local day of week", () => {
    expect(dayOfWeek("2026-05-03")).toBe(0)
    expect(dayOfWeek("2026-05-04")).toBe(1)
    expect(dayOfWeek("2026-05-09")).toBe(6)
  })

  it("formats calendar dates for display", () => {
    expect(formatCalendarDate("2026-05-06")).toBe("May 6")
    expect(
      formatCalendarDate("2026-05-06", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    ).toBe("Wednesday, May 6")
  })
})

describe("scheduledDoses schedule eligibility", () => {
  it("excludes dates before the start date and at or after the duration end", () => {
    const supplement = makeSupplement({ startedOn: "2026-05-01", durationDays: 10 })

    expect(scheduledDoses([supplement], "2026-04-30")).toEqual([])
    expect(scheduledDoses([supplement], "2026-05-01")).toHaveLength(1)
    expect(scheduledDoses([supplement], "2026-05-10")).toHaveLength(1)
    expect(scheduledDoses([supplement], "2026-05-11")).toEqual([])
  })

  it("uses elapsed calendar days for active and break cycles", () => {
    const supplement = makeSupplement({
      startedOn: "2026-05-01",
      cycleActiveDays: 3,
      cycleBreakDays: 2,
    })
    const isScheduled = (date: string) => scheduledDoses([supplement], date).length === 1

    expect(isScheduled("2026-05-01")).toBe(true)
    expect(isScheduled("2026-05-02")).toBe(true)
    expect(isScheduled("2026-05-03")).toBe(true)
    expect(isScheduled("2026-05-04")).toBe(false)
    expect(isScheduled("2026-05-05")).toBe(false)
    expect(isScheduled("2026-05-06")).toBe(true)
    expect(isScheduled("2026-05-07")).toBe(true)
  })

  it("checks weekday membership after the active and break cycle", () => {
    const mondayOnly = makeSupplement({ days: [1] })

    expect(scheduledDoses([mondayOnly], "2026-05-04")).toHaveLength(1)
    expect(scheduledDoses([mondayOnly], "2026-05-05")).toEqual([])
  })

  it("produces no doses for invalid times", () => {
    const supplement = makeSupplement({ times: ["noon", "24:00", "8:00"] })

    expect(scheduledDoses([supplement], "2026-05-04")).toEqual([])
  })

  it("collapses duplicate times after normalizing them to canonical", () => {
    const supplement = makeSupplement({ times: ["08:00 AM", "08:00", "8:00 am"] })
    const doses = scheduledDoses([supplement], "2026-05-04")

    expect(doses).toHaveLength(1)
    expect(doses[0]).toMatchObject({ time: "08:00", period: "Morning" })
  })
})

describe("scheduledDoses ordering and shape", () => {
  it("orders by time and preserves supplement and time insertion order for ties", () => {
    const first = makeSupplement({ id: "first", times: ["09:00", "08:00", "07:30"] })
    const second = makeSupplement({ id: "second", times: ["08:00", "07:00"] })

    const doses = scheduledDoses([first, second], "2026-05-04")

    expect(doses.map((dose) => `${dose.time} ${dose.supplement.id}`)).toEqual([
      "07:00 second",
      "07:30 first",
      "08:00 first",
      "08:00 second",
      "09:00 first",
    ])
  })

  it("carries a stable key, nested supplement, date, canonical time, and period", () => {
    const supplement = makeSupplement({ id: "magnesium", times: ["20:30"] })

    const [dose] = scheduledDoses([supplement], "2026-05-04")

    expect(dose).toMatchObject({
      key: "magnesium|2026-05-04|20:30",
      supplement,
      date: "2026-05-04",
      time: "20:30",
      period: "Evening",
      log: null,
      status: "pending",
    })
    expect(dose.supplement).toBe(supplement)
  })
})

describe("dayRegimen", () => {
  const date = "2026-05-04"

  it("joins the first log matching supplement, date, and canonical time", () => {
    const supplement = makeSupplement({ id: "magnesium", times: ["08:00", "20:00"] })
    const first: DoseLog = {
      id: "log-1",
      supplementId: "magnesium",
      date,
      time: "08:00",
      status: "taken",
    }
    const duplicate: DoseLog = {
      id: "log-2",
      supplementId: "magnesium",
      date,
      time: "08:00",
      status: "snoozed",
    }

    const regimen = dayRegimen(
      { supplements: [supplement], doseLogs: [first, duplicate] },
      date,
    )

    expect(regimen.doses[0]).toMatchObject({ time: "08:00", log: first, status: "taken" })
    expect(regimen.doses[1]).toMatchObject({ time: "20:00", log: null, status: "pending" })
  })

  it("reports taken, snoozed, and pending statuses", () => {
    const supplement = makeSupplement({ id: "magnesium", times: ["08:00", "12:00", "20:00"] })
    const logs: DoseLog[] = [
      { id: "taken", supplementId: "magnesium", date, time: "08:00", status: "taken" },
      { id: "snoozed", supplementId: "magnesium", date, time: "12:00", status: "snoozed" },
    ]

    const regimen = dayRegimen({ supplements: [supplement], doseLogs: logs }, date)

    expect(regimen.doses.map((dose) => dose.status)).toEqual(["taken", "snoozed", "pending"])
  })

  it("counts only taken doses in the summary", () => {
    const supplement = makeSupplement({ id: "magnesium", times: ["08:00", "12:00", "20:00"] })
    const logs: DoseLog[] = [
      { id: "taken", supplementId: "magnesium", date, time: "08:00", status: "taken" },
      { id: "snoozed", supplementId: "magnesium", date, time: "12:00", status: "snoozed" },
    ]

    const regimen = dayRegimen({ supplements: [supplement], doseLogs: logs }, date)

    expect(regimen.summary).toEqual({ total: 3, taken: 1 })
  })

  it("returns an empty regimen for a day with no scheduled doses", () => {
    const regimen = dayRegimen(
      {
        supplements: [makeSupplement({ days: [1] })],
        doseLogs: [
          { id: "orphan", supplementId: "vitamin-d", date, time: "08:00", status: "taken" },
        ],
      },
      "2026-05-05",
    )

    expect(regimen).toEqual({
      date: "2026-05-05",
      doses: [],
      summary: { total: 0, taken: 0 },
    })
  })

  it("ignores orphan logs from removed supplements, other times, and other dates", () => {
    const supplement = makeSupplement({ id: "magnesium", times: ["08:00"] })
    const logs: DoseLog[] = [
      { id: "unknown", supplementId: "removed", date, time: "08:00", status: "taken" },
      { id: "wrong-time", supplementId: "magnesium", date, time: "09:00", status: "taken" },
      { id: "wrong-date", supplementId: "magnesium", date: "2026-05-03", time: "08:00", status: "taken" },
    ]

    const regimen = dayRegimen({ supplements: [supplement], doseLogs: logs }, date)

    expect(regimen.doses[0]).toMatchObject({ time: "08:00", log: null, status: "pending" })
    expect(regimen.summary).toEqual({ total: 1, taken: 0 })
  })
})

describe("upcomingScheduledDoses", () => {
  it("returns a date-major horizon that respects active and break days", () => {
    const supplement = makeSupplement({
      startedOn: "2026-05-01",
      cycleActiveDays: 3,
      cycleBreakDays: 2,
      times: ["08:00", "20:00"],
    })

    const doses = upcomingScheduledDoses([supplement], "2026-05-01", 7)

    expect(doses.map((dose) => `${dose.date} ${dose.time}`)).toEqual([
      "2026-05-01 08:00",
      "2026-05-01 20:00",
      "2026-05-02 08:00",
      "2026-05-02 20:00",
      "2026-05-03 08:00",
      "2026-05-03 20:00",
      "2026-05-06 08:00",
      "2026-05-06 20:00",
      "2026-05-07 08:00",
      "2026-05-07 20:00",
    ])
    expect(doses.every((dose) => dose.log === null && dose.status === "pending")).toBe(true)
  })

  it("keeps time and stable supplement ordering within each date", () => {
    const first = makeSupplement({ id: "first", times: ["09:00", "08:00"] })
    const second = makeSupplement({ id: "second", times: ["08:00"] })

    const doses = upcomingScheduledDoses([first, second], "2026-05-04", 2)

    expect(doses.map((dose) => `${dose.date} ${dose.time} ${dose.supplement.id}`)).toEqual([
      "2026-05-04 08:00 first",
      "2026-05-04 08:00 second",
      "2026-05-04 09:00 first",
      "2026-05-05 08:00 first",
      "2026-05-05 08:00 second",
      "2026-05-05 09:00 first",
    ])
  })

  it("returns nothing for a zero-day horizon", () => {
    expect(upcomingScheduledDoses([makeSupplement()], "2026-05-04", 0)).toEqual([])
  })
})
