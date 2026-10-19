import { describe, expect, it } from "vitest"
import type { Supplement } from "./supplements-data"
import {
  buildSupplementReminderNotifications,
  notificationIdForReminder,
} from "./reminder-schedule"

const baseSupplement: Supplement = {
  id: "magnesium",
  name: "Magnesium Glycinate",
  brand: "Pure Encapsulations",
  potency: "120 mg",
  dosage: "2 capsules",
  form: "Capsule",
  startedOn: "2026-05-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
  days: [1, 3, 5],
  times: ["12:00", "08:05"],
  totalCount: 90,
  currentCount: 45,
  restockReminder: true,
  restockThreshold: 15,
}

describe("notificationIdForReminder", () => {
  it("returns a stable 32-bit integer id for a supplement, date, and canonical time", () => {
    expect(notificationIdForReminder("magnesium", "2026-05-05", "12:00")).toBe(
      notificationIdForReminder("magnesium", "2026-05-05", "12:00"),
    )
    expect(notificationIdForReminder("magnesium", "2026-05-05", "12:00")).not.toBe(
      notificationIdForReminder("magnesium", "2026-05-07", "12:00"),
    )
    expect(notificationIdForReminder("magnesium", "2026-05-05", "12:00")).not.toBe(
      notificationIdForReminder("magnesium", "2026-05-05", "12:01"),
    )
  })
})

describe("buildSupplementReminderNotifications", () => {
  it("builds dated local notifications from canonical times", () => {
    const notifications = buildSupplementReminderNotifications([baseSupplement], "2026-05-04", 7)

    expect(notifications).toHaveLength(6)
    expect(notifications[0]).toMatchObject({
      title: "Time for Magnesium Glycinate",
      body: "2 capsules · 120 mg",
      channelId: "supplement-reminders",
      schedule: {
        at: new Date(2026, 4, 4, 12, 0, 0, 0),
        allowWhileIdle: true,
      },
      extra: {
        supplementId: "magnesium",
        date: "2026-05-04",
        time: "12:00",
      },
    })
    expect(notifications[1].schedule?.at).toEqual(new Date(2026, 4, 4, 8, 5, 0, 0))
    expect(notifications[1].extra).toMatchObject({ date: "2026-05-04", time: "08:05" })
  })

  it("covers the requested 30-day horizon", () => {
    const daily = { ...baseSupplement, days: [1, 2, 3, 4, 5, 6, 0], times: ["08:00"] }
    const notifications = buildSupplementReminderNotifications([daily], "2026-05-04", 30)

    expect(notifications).toHaveLength(30)
    expect(notifications[0].extra).toMatchObject({ date: "2026-05-04", time: "08:00" })
    expect(notifications[29].extra).toMatchObject({ date: "2026-06-02", time: "08:00" })
  })
})
