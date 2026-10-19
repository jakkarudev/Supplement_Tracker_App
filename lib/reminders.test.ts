import { describe, expect, it, vi } from "vitest"
import type { Supplement } from "./supplements-data"
import { syncSupplementReminders } from "./reminders"

const supplement: Supplement = {
  id: "creatine",
  name: "Creatine Monohydrate",
  brand: "Momentous",
  potency: "5 g",
  dosage: "1 scoop",
  form: "Powder",
  startedOn: "1970-01-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
  days: [1],
  times: ["12:00"],
  totalCount: 60,
  currentCount: 52,
  restockReminder: false,
  restockThreshold: 10,
}

describe("syncSupplementReminders", () => {
  it("requests permission, cancels stale reminders, creates the Android channel, and schedules current reminders", async () => {
    const driver = {
      checkPermissions: vi.fn().mockResolvedValue({ display: "prompt" }),
      requestPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
      getPending: vi.fn().mockResolvedValue({
        notifications: [
          {
            id: 99,
            extra: { kind: "supplement-reminder", supplementId: "deleted" },
          },
          {
            id: 100,
            extra: { kind: "other" },
          },
        ],
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      createChannel: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue({ notifications: [] }),
    }

    const result = await syncSupplementReminders([supplement], driver, "android")

    expect(result.status).toBe("scheduled")
    if (result.status === "scheduled") {
      expect(result.scheduled).toBeGreaterThan(0)
    }
    expect(driver.requestPermissions).toHaveBeenCalled()
    expect(driver.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "supplement-reminders" }),
    )
    expect(driver.cancel).toHaveBeenCalledWith({ notifications: [{ id: 99 }] })
    expect(driver.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      driver.schedule.mock.invocationCallOrder[0],
    )
    expect(driver.schedule).toHaveBeenCalledTimes(1)
    const firstScheduleArg = driver.schedule.mock.calls[0][0]
    expect(firstScheduleArg.notifications.length).toBeGreaterThan(0)
    expect(firstScheduleArg.notifications[0]).toEqual(
      expect.objectContaining({
        title: "Time for Creatine Monohydrate",
        channelId: "supplement-reminders",
      }),
    )
  })

  it("does not schedule reminders when notification permission is denied", async () => {
    const driver = {
      checkPermissions: vi.fn().mockResolvedValue({ display: "denied" }),
      requestPermissions: vi.fn(),
      getPending: vi.fn(),
      cancel: vi.fn(),
      createChannel: vi.fn(),
      schedule: vi.fn(),
    }

    const result = await syncSupplementReminders([supplement], driver, "android")

    expect(result).toEqual({ status: "permission-denied", scheduled: 0 })
    expect(driver.schedule).not.toHaveBeenCalled()
  })
})
