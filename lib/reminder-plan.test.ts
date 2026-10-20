import { describe, expect, it } from "vitest"
import type { DoseLog, DoseStatus, SpacingRule, Supplement } from "./supplements-data"
import { addDays } from "./day-regimen"
import {
  MAX_PENDING_REMINDERS,
  REMINDER_HORIZON_DAYS,
  planReminders,
  reminderIdFor,
} from "./reminder-plan"

const baseSupplement: Supplement = {
  id: "magnesium",
  name: "Magnesium Glycinate",
  brand: "Pure Encapsulations",
  potency: "120 mg",
  dosage: "2 capsules",
  form: "Capsule",
  startedOn: "2026-01-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
  days: [0, 1, 2, 3, 4, 5, 6],
  times: ["08:00"],
  totalCount: 90,
  currentCount: 45,
  restockReminder: true,
  restockThreshold: 15,
}

function makeSupplement(overrides: Partial<Supplement> = {}): Supplement {
  return { ...baseSupplement, ...overrides }
}

function makeLog(
  supplementId: string,
  date: string,
  time: string,
  status: DoseStatus,
  takenAt?: string,
): DoseLog {
  const log: DoseLog = { id: `${supplementId}-${date}-${time}`, supplementId, date, time, status }
  if (takenAt !== undefined) log.takenAt = takenAt
  return log
}

describe("planReminders", () => {
  it("skips taken, snoozed, and past scheduled doses", () => {
    const now = new Date(2026, 4, 4, 10, 0, 0)
    const supplements = [makeSupplement({ times: ["08:00", "12:00", "15:00"] })]
    const doseLogs = [
      makeLog("magnesium", "2026-05-04", "12:00", "taken"),
      makeLog("magnesium", "2026-05-04", "15:00", "snoozed"),
    ]

    const plan = planReminders({ supplements, doseLogs, spacingRules: [] }, now)

    expect(plan[0]).toMatchObject({ date: "2026-05-05", time: "08:00" })
  })

  it("starts at the logical day and moves early-morning times to the next physical date", () => {
    const now = new Date(2026, 4, 5, 2, 0, 0) // Tuesday 02:00, still logical Monday
    const supplement = makeSupplement({ times: ["01:00", "03:00", "05:00", "23:00"] })

    const plan = planReminders({ supplements: [supplement], doseLogs: [], spacingRules: [] }, now)

    expect(plan[0]).toMatchObject({
      date: "2026-05-04",
      time: "03:00",
      at: new Date(2026, 4, 5, 3, 0, 0),
    })
    expect(plan.find((item) => item.date === "2026-05-04" && item.time === "01:00")).toBeUndefined()
    expect(
      plan.find((item) => item.date === "2026-05-04" && item.time === "23:00"),
    ).toBeUndefined()
    expect(
      plan.find((item) => item.date === "2026-05-05" && item.time === "01:00"),
    ).toMatchObject({ at: new Date(2026, 4, 6, 1, 0, 0) })
    expect(
      plan.find((item) => item.date === "2026-05-05" && item.time === "05:00"),
    ).toMatchObject({ at: new Date(2026, 4, 5, 5, 0, 0) })
  })

  it("matches weekdays against the logical day so a Saturday 01:00 dose fires on Sunday", () => {
    const now = new Date(2026, 4, 1, 6, 0, 0) // Friday 06:00
    const saturdayOnly = makeSupplement({ days: [6], times: ["01:00"] })

    const plan = planReminders({ supplements: [saturdayOnly], doseLogs: [], spacingRules: [] }, now)

    expect(plan[0]).toMatchObject({
      date: "2026-05-02",
      time: "01:00",
      at: new Date(2026, 4, 3, 1, 0, 0),
    })
  })

  it("excludes a time exactly at now and includes the next minute", () => {
    const now = new Date(2026, 4, 4, 8, 0, 0)
    const supplements = [makeSupplement({ times: ["08:00", "08:01"] })]

    const plan = planReminders({ supplements, doseLogs: [], spacingRules: [] }, now)

    expect(plan[0]).toMatchObject({ date: "2026-05-04", time: "08:01" })
  })

  it("groups supplements sharing a time into one reminder", () => {
    const now = new Date(2026, 4, 4, 7, 0, 0)
    const iron = makeSupplement({ id: "iron", name: "Iron", dosage: "1 capsule", potency: "25 mg" })
    const vitaminC = makeSupplement({
      id: "vitamin-c",
      name: "Vitamin C",
      dosage: "2 capsules",
      potency: "500 mg",
    })

    const plan = planReminders({ supplements: [iron, vitaminC], doseLogs: [], spacingRules: [] }, now)
    const reminder = plan.find((item) => item.date === "2026-05-04" && item.time === "08:00")

    expect(reminder).toMatchObject({
      title: "Morning supplements",
      body: "Iron · Vitamin C",
      supplementIds: ["iron", "vitamin-c"],
    })
  })

  it("drops a logged supplement from a shared reminder and uses single-supplement copy", () => {
    const now = new Date(2026, 4, 4, 7, 0, 0)
    const iron = makeSupplement({ id: "iron", name: "Iron", dosage: "1 capsule", potency: "25 mg" })
    const vitaminC = makeSupplement({
      id: "vitamin-c",
      name: "Vitamin C",
      dosage: "2 capsules",
      potency: "500 mg",
    })
    const doseLogs = [makeLog("iron", "2026-05-04", "08:00", "taken")]

    const plan = planReminders({ supplements: [iron, vitaminC], doseLogs, spacingRules: [] }, now)
    const reminder = plan.find((item) => item.date === "2026-05-04" && item.time === "08:00")

    expect(reminder).toMatchObject({
      title: "Time for Vitamin C",
      body: "2 capsules · 500 mg",
      supplementIds: ["vitamin-c"],
    })
  })

  it("removes a reminder when every supplement due then is logged", () => {
    const now = new Date(2026, 4, 4, 7, 0, 0)
    const iron = makeSupplement({ id: "iron", name: "Iron" })
    const vitaminC = makeSupplement({ id: "vitamin-c", name: "Vitamin C" })
    const doseLogs = [
      makeLog("iron", "2026-05-04", "08:00", "taken"),
      makeLog("vitamin-c", "2026-05-04", "08:00", "snoozed"),
    ]

    const plan = planReminders({ supplements: [iron, vitaminC], doseLogs, spacingRules: [] }, now)

    expect(plan.some((item) => item.date === "2026-05-04" && item.time === "08:00")).toBe(false)
  })

  it("covers 30 logical days from the logical day, nearest first", () => {
    const now = new Date(2026, 4, 4, 6, 0, 0)
    const daily = makeSupplement({ times: ["07:00"] })

    const plan = planReminders({ supplements: [daily], doseLogs: [], spacingRules: [] }, now)

    expect(plan).toHaveLength(REMINDER_HORIZON_DAYS)
    expect(plan[0]).toMatchObject({ date: "2026-05-04", time: "07:00" })
    expect(plan[plan.length - 1]).toMatchObject({
      date: addDays("2026-05-04", REMINDER_HORIZON_DAYS - 1),
      time: "07:00",
    })
  })

  it("orders the plan by time and caps it at 60 reminders", () => {
    const now = new Date(2026, 4, 4, 0, 0, 0)
    const threeTimes = makeSupplement({ times: ["18:00", "07:00", "12:00"] })

    const plan = planReminders({ supplements: [threeTimes], doseLogs: [], spacingRules: [] }, now)
    const times = plan.map((item) => item.at.getTime())

    expect(plan).toHaveLength(MAX_PENDING_REMINDERS)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(plan[plan.length - 1]).toMatchObject({ date: "2026-05-23", time: "18:00" })
  })

  it("keeps a stable non-zero id for a date and time regardless of membership", () => {
    const now = new Date(2026, 4, 4, 0, 0, 0)
    const iron = makeSupplement({ id: "iron", name: "Iron" })
    const zinc = makeSupplement({ id: "zinc", name: "Zinc" })

    const ironPlan = planReminders({ supplements: [iron], doseLogs: [], spacingRules: [] }, now)
    const zincPlan = planReminders({ supplements: [zinc], doseLogs: [], spacingRules: [] }, now)

    expect(ironPlan[0].id).toBe(zincPlan[0].id)
    expect(ironPlan[0].id).not.toBe(ironPlan[1].id)
    expect(ironPlan[0].id).toBeGreaterThan(0)
    expect(ironPlan[0].id).toBeLessThan(2 ** 31)
  })

  it("ignores inventory and falls back to generic copy without a dosage", () => {
    const now = new Date(2026, 4, 4, 6, 0, 0)
    const supplement = makeSupplement({
      currentCount: 0,
      restockReminder: true,
      dosage: "",
      potency: "",
    })

    const plan = planReminders({ supplements: [supplement], doseLogs: [], spacingRules: [] }, now)

    expect(plan).toHaveLength(REMINDER_HORIZON_DAYS)
    expect(plan[0].body).toBe("Log this supplement.")
  })
})

describe("planReminders with spacing rules", () => {
  const RULE: SpacingRule = {
    id: "rule-1",
    supplementAId: "copper",
    supplementBId: "zinc",
    minimumIntervalMinutes: 240,
  }

  it("plans a shifted dose at its adjusted time with the matching id", () => {
    const now = new Date(2026, 4, 4, 6, 0, 0)
    const copper = makeSupplement({ id: "copper", name: "Copper", times: ["08:00"] })
    const zinc = makeSupplement({ id: "zinc", name: "Zinc", times: ["12:00"] })
    const doseLogs = [makeLog("copper", "2026-05-04", "08:00", "taken", "10:00")]

    const plan = planReminders(
      { supplements: [copper, zinc], doseLogs, spacingRules: [RULE] },
      now,
    )

    const reminder = plan.find((item) => item.date === "2026-05-04")

    expect(reminder).toMatchObject({
      time: "14:00",
      at: new Date(2026, 4, 4, 14, 0, 0),
      supplementIds: ["zinc"],
    })
    expect(reminder?.id).toBe(reminderIdFor("2026-05-04", "14:00"))
  })

  it("gives the shifted dose a different id from the slot it left", () => {
    const now = new Date(2026, 4, 4, 6, 0, 0)
    const copper = makeSupplement({ id: "copper", name: "Copper", times: ["08:00"] })
    const zinc = makeSupplement({ id: "zinc", name: "Zinc", times: ["12:00"] })
    const doseLogs = [makeLog("copper", "2026-05-04", "08:00", "taken", "10:00")]

    const plan = planReminders(
      { supplements: [copper, zinc], doseLogs, spacingRules: [RULE] },
      now,
    )

    expect(plan[0].id).not.toBe(reminderIdFor("2026-05-04", "12:00"))
  })

  it("plans no reminder for a dose whose plan conflicts", () => {
    const now = new Date(2026, 4, 4, 6, 0, 0)
    const copper = makeSupplement({ id: "copper", name: "Copper", times: ["01:00"] })
    const zinc = makeSupplement({ id: "zinc", name: "Zinc", times: ["12:00"] })
    const doseLogs = [makeLog("copper", "2026-05-04", "01:00", "taken", "01:00")]

    const plan = planReminders(
      { supplements: [copper, zinc], doseLogs, spacingRules: [RULE] },
      now,
    )

    expect(plan.some((item) => item.date === "2026-05-04")).toBe(false)
  })

  it("plans a shifted dose that only moves later days", () => {
    const now = new Date(2026, 4, 4, 6, 0, 0)
    const copper = makeSupplement({ id: "copper", name: "Copper", times: ["08:00"] })
    const zinc = makeSupplement({ id: "zinc", name: "Zinc", times: ["12:00"] })
    const doseLogs = [makeLog("copper", "2026-05-04", "08:00", "taken", "10:00")]

    const plan = planReminders(
      { supplements: [copper, zinc], doseLogs, spacingRules: [RULE] },
      now,
    )

    const nextDay = plan.find(
      (item) => item.date === "2026-05-05" && item.supplementIds.includes("zinc"),
    )
    expect(nextDay).toMatchObject({ time: "12:00" })
  })
})
