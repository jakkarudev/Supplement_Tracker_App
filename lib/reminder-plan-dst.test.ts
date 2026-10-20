import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Supplement } from "./supplements-data"
import { planReminders } from "./reminder-plan"

// Pinned so the DST edge cases do not depend on the machine running the suite.
const originalTimeZone = process.env.TZ

const supplement: Supplement = {
  id: "night-dose",
  name: "Night Dose",
  brand: "",
  potency: "",
  dosage: "1 capsule",
  form: "Capsule",
  startedOn: "2026-01-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
  days: [0, 1, 2, 3, 4, 5, 6],
  times: ["01:30", "02:30", "05:00"],
  totalCount: 90,
  currentCount: 45,
  restockReminder: false,
  restockThreshold: 15,
}

beforeAll(() => {
  process.env.TZ = "America/New_York"
})

afterAll(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = originalTimeZone
  }
})

describe("planReminders across DST transitions", () => {
  it("rolls a nonexistent spring-forward time forward", () => {
    const now = new Date(2026, 2, 7, 6, 0, 0) // Saturday 06:00 EST
    const plan = planReminders({ supplements: [supplement], doseLogs: [] }, now)
    const reminder = plan.find((item) => item.date === "2026-03-07" && item.time === "02:30")

    // 02:30 does not exist on 2026-03-08; the local clock lands on 03:30 EDT.
    expect(reminder?.at.toISOString()).toBe("2026-03-08T07:30:00.000Z")
  })

  it("resolves an ambiguous fall-back time to its first occurrence", () => {
    const now = new Date(2026, 9, 31, 6, 0, 0) // Saturday 06:00 EDT
    const plan = planReminders({ supplements: [supplement], doseLogs: [] }, now)
    const reminder = plan.find((item) => item.date === "2026-10-31" && item.time === "01:30")

    // 01:30 occurs twice on 2026-11-01; the first is still EDT.
    expect(reminder?.at.toISOString()).toBe("2026-11-01T05:30:00.000Z")
  })

  it("keeps a 05:00 dose on the physical date of its logical day", () => {
    const springNow = new Date(2026, 2, 7, 6, 0, 0)
    const springPlan = planReminders({ supplements: [supplement], doseLogs: [] }, springNow)
    const springReminder = springPlan.find(
      (item) => item.date === "2026-03-08" && item.time === "05:00",
    )

    // The transition happens before 05:00, so the boundary itself is unmoved.
    expect(springReminder?.at.toISOString()).toBe("2026-03-08T09:00:00.000Z")

    const fallNow = new Date(2026, 9, 31, 6, 0, 0)
    const fallPlan = planReminders({ supplements: [supplement], doseLogs: [] }, fallNow)
    const fallReminder = fallPlan.find(
      (item) => item.date === "2026-11-01" && item.time === "05:00",
    )

    expect(fallReminder?.at.toISOString()).toBe("2026-11-01T10:00:00.000Z")
  })
})
