import { describe, expect, it } from "vitest"
import type { Supplement } from "./supplements-data"
import {
  buildSupplementReminderNotifications,
  displayTimeToClock,
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
  times: ["12:00 PM", "08:05 AM"],
  totalCount: 90,
  currentCount: 45,
  restockReminder: true,
  restockThreshold: 15,
}

describe("displayTimeToClock", () => {
  it("converts 12-hour display times to 24-hour clock parts", () => {
    expect(displayTimeToClock("12:00 PM")).toEqual({ hour: 12, minute: 0 })
    expect(displayTimeToClock("12:00 AM")).toEqual({ hour: 0, minute: 0 })
    expect(displayTimeToClock("08:05 AM")).toEqual({ hour: 8, minute: 5 })
    expect(displayTimeToClock("08:30 PM")).toEqual({ hour: 20, minute: 30 })
  })
})

describe("notificationIdForReminder", () => {
  it("returns a stable 32-bit integer id for a supplement date and time", () => {
    expect(notificationIdForReminder("magnesium", "2026-05-05", "12:00 PM")).toBe(
      notificationIdForReminder("magnesium", "2026-05-05", "12:00 PM"),
    )
    expect(notificationIdForReminder("magnesium", "2026-05-05", "12:00 PM")).not.toBe(
      notificationIdForReminder("magnesium", "2026-05-07", "12:00 PM"),
    )
  })
})

describe("buildSupplementReminderNotifications", () => {
  it("builds dated local notifications for active scheduled dates", () => {
    const notifications = buildSupplementReminderNotifications([baseSupplement], "2026-05-04", 7)

    expect(notifications).toHaveLength(6)
    expect(notifications[0]).toMatchObject({
      title: "Time for Magnesium Glycinate",
      body: "2 capsules · 120 mg",
      channelId: "supplement-reminders",
      schedule: {
        allowWhileIdle: true,
      },
      extra: {
        supplementId: "magnesium",
        date: "2026-05-04",
        time: "12:00 PM",
      },
    })
    expect(notifications[0].schedule?.at).toBeInstanceOf(Date)
  })
})
