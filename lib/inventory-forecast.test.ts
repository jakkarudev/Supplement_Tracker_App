import { describe, expect, it } from "vitest"
import type { Supplement } from "./supplements-data"
import { addDays } from "./day-regimen"
import { buildInventory } from "./inventory"
import {
  describeInventoryForecast,
  forecastInventory,
  joinInventoryForecast,
} from "./inventory-forecast"

const baseSupplement: Supplement = {
  id: "vitamin-d",
  name: "Vitamin D3 + K2",
  brand: "Thorne",
  potency: "5000 IU",
  dosage: "1 capsule",
  form: "Capsule",
  startedOn: "2026-05-04",
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

const DATE = "2026-05-04"

function makeSupplement(overrides: Partial<Supplement> = {}): Supplement {
  return { ...baseSupplement, ...overrides }
}

describe("forecastInventory schedule coverage", () => {
  it("covers one full day per capsule and runs out after the last dose", () => {
    const forecast = forecastInventory(makeSupplement(), [], DATE)

    expect(forecast).toEqual({
      status: "ok",
      days: 60,
      runOutDate: addDays(DATE, 60),
      courseEndsFirst: false,
      courseEndDate: null,
    })
  })

  it("counts every calendar day for a weekday-only plan", () => {
    const supplement = makeSupplement({ days: [1, 3, 5] })

    const forecast = forecastInventory(supplement, [], DATE)

    expect(forecast).toMatchObject({
      status: "ok",
      days: 140,
      runOutDate: addDays(DATE, 140),
    })
  })

  it("skips cycle break days but still counts them as covered days", () => {
    const supplement = makeSupplement({
      startedOn: "2026-05-01",
      cycleActiveDays: 5,
      cycleBreakDays: 2,
    })

    const forecast = forecastInventory(supplement, [], "2026-05-01")

    expect(forecast).toMatchObject({
      status: "ok",
      days: 84,
      runOutDate: addDays("2026-05-01", 84),
    })
  })

  it("combines weekdays and multiple times per day", () => {
    const supplement = makeSupplement({
      days: [1, 3, 5],
      times: ["08:00", "20:00"],
    })

    const forecast = forecastInventory(supplement, [], DATE)

    expect(forecast).toMatchObject({
      status: "ok",
      days: 70,
      runOutDate: addDays(DATE, 70),
    })
  })

  it("consumes multiple scheduled times per day", () => {
    const supplement = makeSupplement({ times: ["08:00", "20:00"] })

    const forecast = forecastInventory(supplement, [], DATE)

    expect(forecast).toMatchObject({
      status: "ok",
      days: 30,
      runOutDate: addDays(DATE, 30),
    })
  })

  it.each([
    ["1/2 capsule", 120],
    ["1/3 capsule", 180],
    ["1/4 capsule", 240],
  ])("consumes the fractional dose %s", (dosage, days) => {
    const supplement = makeSupplement({ dosage })

    const forecast = forecastInventory(supplement, [], DATE)

    expect(forecast).toMatchObject({
      status: "ok",
      days,
      runOutDate: addDays(DATE, days),
    })
  })

  it.each([
    ["Liquid", "10.5 ml", 63, 6],
    ["Powder", "3.5 g", 14, 4],
  ] as const)(
    "consumes %s inventory in its own unit",
    (form, dosage, currentCount, days) => {
      const supplement = makeSupplement({ form, dosage, currentCount, totalCount: currentCount })

      const forecast = forecastInventory(supplement, [], DATE)

      expect(forecast).toMatchObject({
        status: "ok",
        days,
        runOutDate: addDays(DATE, days),
      })
    },
  )
})

describe("forecastInventory dose logs", () => {
  it("does not consume a taken dose twice", () => {
    const supplement = makeSupplement({ currentCount: 59, totalCount: 60 })
    const logs = [
      {
        id: "taken-today",
        supplementId: supplement.id,
        date: DATE,
        time: "08:00",
        status: "taken" as const,
      },
    ]

    const forecast = forecastInventory(supplement, logs, DATE)

    expect(forecast).toMatchObject({
      status: "ok",
      days: 60,
      runOutDate: addDays(DATE, 60),
    })
  })

  it("still counts a snoozed dose as a dose to come", () => {
    const supplement = makeSupplement()
    const logs = [
      {
        id: "snoozed-today",
        supplementId: supplement.id,
        date: DATE,
        time: "08:00",
        status: "snoozed" as const,
      },
    ]

    const forecast = forecastInventory(supplement, logs, DATE)

    expect(forecast).toMatchObject({
      status: "ok",
      days: 60,
      runOutDate: addDays(DATE, 60),
    })
  })
})

describe("forecastInventory edge cases", () => {
  it.each([0, -3])("reports out of stock when the count is %i", (currentCount) => {
    const supplement = makeSupplement({ currentCount })

    expect(forecastInventory(supplement, [], DATE)).toEqual({ status: "out-of-stock" })
  })

  it("reports less than a day when stock cannot cover today's remaining doses", () => {
    const supplement = makeSupplement({ currentCount: 0.5, totalCount: 1 })

    expect(forecastInventory(supplement, [], DATE)).toEqual({
      status: "less-than-a-day",
      days: 0,
      runOutDate: DATE,
    })
  })

  it.each([
    ["no times", { times: [] }],
    ["no weekdays", { days: [] }],
  ])("reports no upcoming doses when the plan has %s", (_label, overrides) => {
    const supplement = makeSupplement(overrides)

    expect(forecastInventory(supplement, [], DATE)).toEqual({
      status: "no-upcoming-doses",
    })
  })

  it("bounds the projection at ten years", () => {
    const supplement = makeSupplement({ currentCount: 100_000, totalCount: 100_000 })

    expect(forecastInventory(supplement, [], DATE)).toEqual({
      status: "ok",
      days: 3650,
      runOutDate: addDays(DATE, 3650),
      courseEndsFirst: false,
      courseEndDate: null,
    })
  })

  it("counts a dose-free day as covered before the next scheduled dose runs out", () => {
    // Sunday with a Monday-only plan and only half a capsule on hand.
    const supplement = makeSupplement({
      days: [1],
      currentCount: 0.5,
      totalCount: 1,
    })

    expect(forecastInventory(supplement, [], "2026-05-03")).toEqual({
      status: "ok",
      days: 1,
      runOutDate: "2026-05-04",
      courseEndsFirst: false,
      courseEndDate: null,
    })
  })
})

describe("joinInventoryForecast", () => {
  it("forecasts current rows and leaves upcoming and finished rows without one", () => {
    const current = makeSupplement({ id: "current", name: "Current" })
    const upcoming = makeSupplement({
      id: "upcoming",
      name: "Upcoming",
      startedOn: "2026-06-01",
    })
    const finished = makeSupplement({
      id: "finished",
      name: "Finished",
      startedOn: "2025-01-01",
      durationDays: 10,
      currentCount: 5,
    })
    const inventory = buildInventory([current, upcoming, finished], DATE)

    const joined = joinInventoryForecast(inventory, [], DATE)

    expect(
      joined.rows.map((row) => [row.supplement.id, row.forecast?.status ?? null]),
    ).toEqual([
      ["current", "ok"],
      ["upcoming", null],
      ["finished", null],
    ])
    expect(joined.rows[0].forecast).toMatchObject({ days: 60 })
    expect(joined.summary).toEqual(inventory.summary)
  })
})

describe("describeInventoryForecast", () => {
  it("makes the day count the headline and the run-out date secondary", () => {
    expect(
      describeInventoryForecast({
        status: "ok",
        days: 60,
        runOutDate: "2026-07-03",
        courseEndsFirst: false,
        courseEndDate: null,
      }),
    ).toEqual({
      headline: "60 days of inventory",
      secondary: "Runs out July 3",
    })
  })

  it("uses a singular day", () => {
    expect(
      describeInventoryForecast({
        status: "ok",
        days: 1,
        runOutDate: "2026-05-05",
        courseEndsFirst: false,
        courseEndDate: null,
      }),
    ).toEqual({
      headline: "1 day of inventory",
      secondary: "Runs out May 5",
    })
  })

  it("shows the course end beside the run-out date when the course ends first", () => {
    expect(
      describeInventoryForecast({
        status: "ok",
        days: 60,
        runOutDate: "2026-07-03",
        courseEndsFirst: true,
        courseEndDate: "2026-06-02",
      }),
    ).toEqual({
      headline: "60 days of inventory",
      secondary: "Runs out July 3 · Course ends June 2",
    })
  })

  it.each([
    [
      { status: "less-than-a-day" as const, days: 0 as const, runOutDate: DATE },
      { headline: "Less than a day of inventory", secondary: "Runs out today" },
    ],
    [
      { status: "out-of-stock" as const },
      { headline: "Out of stock", secondary: null },
    ],
    [
      { status: "no-upcoming-doses" as const },
      { headline: "No upcoming doses", secondary: null },
    ],
  ])("describes the %s status", (forecast, expected) => {
    expect(describeInventoryForecast(forecast)).toEqual(expected)
  })
})

describe("forecastInventory limited course", () => {
  it("continues at the plan's rate past the course end and reports both dates", () => {
    const supplement = makeSupplement({ startedOn: DATE, durationDays: 30 })

    const forecast = forecastInventory(supplement, [], DATE)

    expect(forecast).toEqual({
      status: "ok",
      days: 60,
      runOutDate: addDays(DATE, 60),
      courseEndsFirst: true,
      courseEndDate: addDays(DATE, 29),
    })
  })

  it("does not report a course ending first when the stock runs out sooner", () => {
    const supplement = makeSupplement({
      startedOn: DATE,
      durationDays: 30,
      currentCount: 10,
      totalCount: 30,
    })

    const forecast = forecastInventory(supplement, [], DATE)

    expect(forecast).toEqual({
      status: "ok",
      days: 10,
      runOutDate: addDays(DATE, 10),
      courseEndsFirst: false,
      courseEndDate: addDays(DATE, 29),
    })
  })
})
