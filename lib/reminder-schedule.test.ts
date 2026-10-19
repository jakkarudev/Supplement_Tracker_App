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
    expect(notifications[0]).toEqual({
      id: notificationIdForReminder("magnesium", "2026-05-04", "08:05"),
      title: "Time for Magnesium Glycinate",
      body: "2 capsules · 120 mg",
      channelId: "supplement-reminders",
      schedule: {
        at: new Date(2026, 4, 4, 8, 5, 0, 0),
        allowWhileIdle: true,
      },
      extra: {
        kind: "supplement-reminder",
        supplementId: "magnesium",
        date: "2026-05-04",
        time: "08:05",
      },
    })
    expect(notifications[1]).toMatchObject({
      schedule: { at: new Date(2026, 4, 4, 12, 0, 0, 0) },
      extra: { date: "2026-05-04", time: "12:00" },
    })
  })

  it("orders notifications by date then time across supplements", () => {
    const morning: Supplement = {
      ...baseSupplement,
      id: "iron",
      name: "Iron",
      days: [1, 2, 3, 4, 5, 6, 0],
      times: ["07:00"],
    }
    const evening: Supplement = {
      ...baseSupplement,
      id: "zinc",
      name: "Zinc",
      days: [1, 2, 3, 4, 5, 6, 0],
      times: ["18:00"],
    }

    const notifications = buildSupplementReminderNotifications(
      [evening, morning],
      "2026-05-04",
      2,
    )

    expect(
      notifications.map((notification) => ({
        date: notification.extra?.date,
        time: notification.extra?.time,
        supplementId: notification.extra?.supplementId,
      })),
    ).toEqual([
      { date: "2026-05-04", time: "07:00", supplementId: "iron" },
      { date: "2026-05-04", time: "18:00", supplementId: "zinc" },
      { date: "2026-05-05", time: "07:00", supplementId: "iron" },
      { date: "2026-05-05", time: "18:00", supplementId: "zinc" },
    ])
  })

  it("covers the requested 30-day horizon", () => {
    const daily = { ...baseSupplement, days: [1, 2, 3, 4, 5, 6, 0], times: ["08:00"] }
    const notifications = buildSupplementReminderNotifications([daily], "2026-05-04", 30)

    expect(notifications).toHaveLength(30)
    expect(notifications[0].extra).toMatchObject({ date: "2026-05-04", time: "08:00" })
    expect(notifications[29].extra).toMatchObject({ date: "2026-06-02", time: "08:00" })
  })

  it("builds one notification per scheduled dose over the horizon", () => {
    const notifications = buildSupplementReminderNotifications([baseSupplement], "2026-05-04", 30)

    expect(notifications).toHaveLength(26)
    expect(notifications[25]).toMatchObject({
      schedule: { at: new Date(2026, 5, 1, 12, 0, 0, 0) },
      extra: { date: "2026-06-01", time: "12:00" },
    })
  })
})
