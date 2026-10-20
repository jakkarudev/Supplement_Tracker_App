import { describe, expect, it, vi } from "vitest"
import type {
  Channel,
  LocalNotificationDescriptor,
  LocalNotificationSchema,
  PermissionStatus,
} from "@capacitor/local-notifications"
import type { DoseStatus, Supplement } from "./supplements-data"
import {
  createNativeDriver,
  createReminderSyncQueue,
  requestReminderPermission,
  scheduleNativeSupplementReminders,
  syncReminders,
  type ReminderPlanInput,
  type ReminderSyncResult,
} from "./reminders"

const supplement: Supplement = {
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

const now = new Date(2026, 4, 4, 7, 0, 0)
const input: ReminderPlanInput = { supplements: [supplement], doseLogs: [], spacingRules: [] }

function makeDriver() {
  return {
    checkPermissions: vi.fn(async (): Promise<PermissionStatus> => ({ display: "granted" })),
    requestPermissions: vi.fn(async (): Promise<PermissionStatus> => ({ display: "granted" })),
    getPending: vi.fn(
      async (): Promise<{ notifications: LocalNotificationSchema[] }> => ({ notifications: [] }),
    ),
    cancel: vi.fn(async (_options: { notifications: LocalNotificationDescriptor[] }) => {}),
    createChannel: vi.fn(async (_channel: Channel) => {}),
    schedule: vi.fn(
      async (_options: { notifications: LocalNotificationSchema[] }) => ({ notifications: [] }),
    ),
  }
}

function makeLog(date: string, time: string, status: DoseStatus) {
  return { id: `${date}-${time}`, supplementId: supplement.id, date, time, status }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("syncReminders", () => {
  it("schedules the plan and creates the channel before scheduling", async () => {
    const driver = makeDriver()

    const result = await syncReminders(input, now, driver)
    const notifications = driver.schedule.mock.calls[0][0].notifications

    expect(result).toEqual({ status: "synced", scheduled: 30, cancelled: 0 })
    expect(notifications).toHaveLength(30)
    expect(notifications[0]).toMatchObject({
      title: "Time for Magnesium Glycinate",
      body: "2 capsules · 120 mg",
      channelId: "supplement-reminders",
      schedule: {
        at: new Date(2026, 4, 4, 8, 0, 0, 0),
        allowWhileIdle: true,
      },
      extra: {
        kind: "supplement-reminder",
        date: "2026-05-04",
        time: "08:00",
        supplementIds: ["magnesium"],
      },
    })
    expect(driver.cancel).not.toHaveBeenCalled()
    expect(driver.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "supplement-reminders" }),
    )
    expect(driver.createChannel.mock.invocationCallOrder[0]).toBeLessThan(
      driver.schedule.mock.invocationCallOrder[0],
    )
  })

  it("schedules and cancels nothing when the plan is unchanged", async () => {
    const seeded = makeDriver()
    await syncReminders(input, now, seeded)
    const pending = seeded.schedule.mock.calls[0][0].notifications

    const driver = makeDriver()
    driver.getPending.mockResolvedValue({ notifications: pending })
    const result = await syncReminders(input, now, driver)

    expect(result).toEqual({ status: "synced", scheduled: 0, cancelled: 0 })
    expect(driver.cancel).not.toHaveBeenCalled()
    expect(driver.createChannel).not.toHaveBeenCalled()
    expect(driver.schedule).not.toHaveBeenCalled()
  })

  it("cancels the reminder for a logged dose", async () => {
    const seeded = makeDriver()
    await syncReminders(input, now, seeded)
    const pending = seeded.schedule.mock.calls[0][0].notifications

    const driver = makeDriver()
    driver.getPending.mockResolvedValue({ notifications: pending })
    const result = await syncReminders(
      { supplements: [supplement], doseLogs: [makeLog("2026-05-04", "08:00", "taken")], spacingRules: [] },
      now,
      driver,
    )

    expect(result).toEqual({ status: "synced", scheduled: 0, cancelled: 1 })
    expect(driver.cancel).toHaveBeenCalledWith({ notifications: [{ id: pending[0].id }] })
    expect(driver.createChannel).not.toHaveBeenCalled()
    expect(driver.schedule).not.toHaveBeenCalled()
  })

  it("replaces a reminder when a supplement is renamed or its dosage changes", async () => {
    const seeded = makeDriver()
    await syncReminders(input, now, seeded)
    const pending = seeded.schedule.mock.calls[0][0].notifications
    const renamed = { ...supplement, name: "Magnesium Bisglycinate", dosage: "3 capsules" }

    const driver = makeDriver()
    driver.getPending.mockResolvedValue({ notifications: pending })
    const result = await syncReminders({ supplements: [renamed], doseLogs: [], spacingRules: [] }, now, driver)
    const scheduled = driver.schedule.mock.calls[0][0].notifications

    expect(result).toEqual({ status: "synced", scheduled: 30, cancelled: 30 })
    expect(scheduled[0]).toMatchObject({
      id: pending[0].id,
      title: "Time for Magnesium Bisglycinate",
      body: "3 capsules · 120 mg",
    })
  })

  it("cancels the old id and schedules the new one when a time changes", async () => {
    const seeded = makeDriver()
    await syncReminders(input, now, seeded)
    const pending = seeded.schedule.mock.calls[0][0].notifications
    const shifted = { ...supplement, times: ["09:00"] }

    const driver = makeDriver()
    driver.getPending.mockResolvedValue({ notifications: pending })
    const result = await syncReminders({ supplements: [shifted], doseLogs: [], spacingRules: [] }, now, driver)
    const scheduled = driver.schedule.mock.calls[0][0].notifications

    expect(result).toEqual({ status: "synced", scheduled: 30, cancelled: 30 })
    expect(driver.cancel.mock.calls[0][0].notifications).toContainEqual({ id: pending[0].id })
    expect(scheduled[0]).toMatchObject({
      schedule: { at: new Date(2026, 4, 4, 9, 0, 0, 0) },
    })
    expect(scheduled[0].id).not.toBe(pending[0].id)
  })

  it("cancels legacy dose-id pending reminders", async () => {
    const driver = makeDriver()
    driver.getPending.mockResolvedValue({
      notifications: [
        {
          id: 12345,
          title: "Time for Magnesium Glycinate",
          body: "2 capsules · 120 mg",
          extra: {
            kind: "supplement-reminder",
            supplementId: "magnesium",
            date: "2026-05-04",
            time: "08:00",
          },
        },
      ],
    })

    const result = await syncReminders({ supplements: [], doseLogs: [], spacingRules: [] }, now, driver)

    expect(result).toEqual({ status: "synced", scheduled: 0, cancelled: 1 })
    expect(driver.cancel).toHaveBeenCalledWith({ notifications: [{ id: 12345 }] })
  })

  it("does not touch pending reminders when permission is denied", async () => {
    const driver = makeDriver()
    driver.checkPermissions.mockResolvedValue({ display: "denied" })

    const result = await syncReminders(input, now, driver)

    expect(result).toEqual({ status: "permission-denied", scheduled: 0, cancelled: 0 })
    expect(driver.requestPermissions).not.toHaveBeenCalled()
    expect(driver.getPending).not.toHaveBeenCalled()
    expect(driver.cancel).not.toHaveBeenCalled()
    expect(driver.createChannel).not.toHaveBeenCalled()
    expect(driver.schedule).not.toHaveBeenCalled()
  })

  it("never requests permission while syncing", async () => {
    const driver = makeDriver()
    driver.checkPermissions.mockResolvedValue({ display: "prompt" })

    const result = await syncReminders(input, now, driver)

    expect(result).toEqual({ status: "permission-denied", scheduled: 0, cancelled: 0 })
    expect(driver.requestPermissions).not.toHaveBeenCalled()
  })

  it("does not create the channel or schedule when the plan is empty", async () => {
    const driver = makeDriver()

    const result = await syncReminders({ supplements: [], doseLogs: [], spacingRules: [] }, now, driver)

    expect(result).toEqual({ status: "synced", scheduled: 0, cancelled: 0 })
    expect(driver.createChannel).not.toHaveBeenCalled()
    expect(driver.schedule).not.toHaveBeenCalled()
  })

  it("returns an error result when a driver call fails", async () => {
    const driver = makeDriver()
    driver.getPending.mockRejectedValue(new Error("bridge failed"))

    const result = await syncReminders(input, now, driver)

    expect(result).toEqual({
      status: "error",
      scheduled: 0,
      cancelled: 0,
      error: expect.any(Error),
    })
  })

  it("returns not-native before planning off a native platform", async () => {
    const result = await scheduleNativeSupplementReminders(input)

    expect(result).toEqual({ status: "not-native", scheduled: 0, cancelled: 0 })
  })

  it("also reports not-native when asking permission off a native platform", async () => {
    await expect(requestReminderPermission()).resolves.toEqual({ status: "not-native" })
  })
})

describe("createNativeDriver", () => {
  function makeNotifications() {
    return {
      checkPermissions: vi.fn(async (): Promise<PermissionStatus> => ({ display: "granted" })),
      requestPermissions: vi.fn(async (): Promise<PermissionStatus> => ({ display: "granted" })),
      getPending: vi.fn(
        async (): Promise<{ notifications: LocalNotificationSchema[] }> => ({ notifications: [] }),
      ),
      cancel: vi.fn(async (_options: { notifications: LocalNotificationDescriptor[] }) => {}),
      createChannel: vi.fn(async (_channel: Channel) => {}),
      schedule: vi.fn(
        async (_options: { notifications: LocalNotificationSchema[] }) => ({ notifications: [] }),
      ),
    }
  }

  it("creates the Android channel", async () => {
    const notifications = makeNotifications()
    const driver = createNativeDriver(notifications, "android")

    await driver.createChannel({ id: "supplement-reminders", name: "Supplement reminders" })

    expect(notifications.createChannel).toHaveBeenCalledWith({
      id: "supplement-reminders",
      name: "Supplement reminders",
    })
  })

  it("skips the Android-only channel on other platforms", async () => {
    const notifications = makeNotifications()
    const driver = createNativeDriver(notifications, "ios")

    await driver.createChannel({ id: "supplement-reminders", name: "Supplement reminders" })

    expect(notifications.createChannel).not.toHaveBeenCalled()
  })
})

describe("createReminderSyncQueue", () => {
  it("coalesces overlapping syncs to the latest state", async () => {
    const first = deferred<ReminderSyncResult>()
    const run = vi
      .fn<(next: ReminderPlanInput) => Promise<ReminderSyncResult>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ status: "synced", scheduled: 2, cancelled: 1 })
    const sync = createReminderSyncQueue(run)
    const a = { supplements: [], doseLogs: [], spacingRules: [] }
    const b = { supplements: [supplement], doseLogs: [], spacingRules: [] }
    const c = { supplements: [], doseLogs: [makeLog("2026-05-04", "08:00", "taken")], spacingRules: [] }

    const firstCall = sync(a)
    const secondCall = sync(b)
    const thirdCall = sync(c)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenLastCalledWith(a)

    first.resolve({ status: "synced", scheduled: 0, cancelled: 0 })
    const [firstResult, secondResult, thirdResult] = await Promise.all([
      firstCall,
      secondCall,
      thirdCall,
    ])

    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls).toEqual([[a], [c]])
    expect(firstResult).toEqual({ status: "synced", scheduled: 2, cancelled: 1 })
    expect(secondResult).toEqual(firstResult)
    expect(thirdResult).toEqual(firstResult)
  })

  it("reports a failed run as an error result", async () => {
    const sync = createReminderSyncQueue(async () => {
      throw new Error("planner failed")
    })

    const result = await sync(input)

    expect(result).toEqual({
      status: "error",
      scheduled: 0,
      cancelled: 0,
      error: expect.any(Error),
    })
  })
})
