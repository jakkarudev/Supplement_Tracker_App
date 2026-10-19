import { Capacitor } from "@capacitor/core"
import type {
  Channel,
  LocalNotificationDescriptor,
  LocalNotificationSchema,
  PermissionStatus,
} from "@capacitor/local-notifications"
import {
  planReminders,
  type PlannedReminder,
  type ReminderPlanInput,
} from "./reminder-plan"

export type { ReminderPlanInput }

export const REMINDER_CHANNEL_ID = "supplement-reminders"
export const REMINDER_KIND = "supplement-reminder"

/** The notification operations the sync needs from the operating system. */
export type ReminderDriver = {
  checkPermissions: () => Promise<PermissionStatus>
  requestPermissions: () => Promise<PermissionStatus>
  getPending: () => Promise<{ notifications: Array<LocalNotificationSchema> }>
  cancel: (options: { notifications: LocalNotificationDescriptor[] }) => Promise<void>
  createChannel: (channel: Channel) => Promise<void>
  schedule: (options: { notifications: LocalNotificationSchema[] }) => Promise<unknown>
}

export type ReminderSyncResult =
  | { status: "synced"; scheduled: number; cancelled: number }
  | { status: "permission-denied"; scheduled: 0; cancelled: 0 }
  | { status: "not-native"; scheduled: 0; cancelled: 0 }
  | { status: "error"; scheduled: 0; cancelled: 0; error: unknown }

export type ReminderPermissionResult =
  | { status: PermissionStatus["display"] }
  | { status: "not-native" }
  | { status: "error"; error: unknown }

const REMINDER_CHANNEL: Channel = {
  id: REMINDER_CHANNEL_ID,
  name: "Supplement reminders",
  description: "Scheduled reminders for supplement doses.",
  importance: 4,
  visibility: 1,
  vibration: true,
}

type LocalNotificationsPlugin =
  (typeof import("@capacitor/local-notifications"))["LocalNotifications"]

type NativeNotifications = Pick<
  LocalNotificationsPlugin,
  | "checkPermissions"
  | "requestPermissions"
  | "getPending"
  | "cancel"
  | "createChannel"
  | "schedule"
>

function notificationTime(notification: LocalNotificationSchema): number {
  const at: unknown = notification.schedule?.at
  if (at instanceof Date) return at.getTime()
  if (typeof at === "string" || typeof at === "number") return new Date(at).getTime()
  return NaN
}

/** Whether a pending reminder already carries the planned content. */
function matchesPlan(
  notification: LocalNotificationSchema,
  reminder: PlannedReminder,
): boolean {
  if (notification.id !== reminder.id) return false
  if (notificationTime(notification) !== reminder.at.getTime()) return false
  if (notification.title !== reminder.title) return false
  if (notification.body !== reminder.body) return false

  const extra = notification.extra
  const supplementIds = extra?.supplementIds
  return (
    extra?.kind === REMINDER_KIND &&
    extra.date === reminder.date &&
    extra.time === reminder.time &&
    Array.isArray(supplementIds) &&
    supplementIds.length === reminder.supplementIds.length &&
    supplementIds.every((id, index) => id === reminder.supplementIds[index])
  )
}

function toNotification(reminder: PlannedReminder): LocalNotificationSchema {
  return {
    id: reminder.id,
    title: reminder.title,
    body: reminder.body,
    channelId: REMINDER_CHANNEL_ID,
    schedule: { at: reminder.at, allowWhileIdle: true },
    extra: {
      kind: REMINDER_KIND,
      date: reminder.date,
      time: reminder.time,
      supplementIds: reminder.supplementIds,
    },
  }
}

/**
 * Reconciles pending Reminders with the current Reminder Plan. Permission is
 * only checked, never requested: a denied or unprompted app leaves pending
 * reminders untouched so a later grant can reconcile on the next sync.
 */
export async function syncReminders(
  input: ReminderPlanInput,
  now: Date,
  driver: ReminderDriver,
): Promise<ReminderSyncResult> {
  try {
    const permission = await driver.checkPermissions()
    if (permission.display !== "granted") {
      return { status: "permission-denied", scheduled: 0, cancelled: 0 }
    }

    const plan = planReminders(input, now)
    const pending = (await driver.getPending()).notifications.filter(
      (notification) => notification.extra?.kind === REMINDER_KIND,
    )
    const planned = new Map(plan.map((reminder) => [reminder.id, reminder]))
    const existing = new Map(pending.map((notification) => [notification.id, notification]))

    const toCancel = pending.filter((notification) => {
      const reminder = planned.get(notification.id)
      return !reminder || !matchesPlan(notification, reminder)
    })
    const toSchedule = plan.filter((reminder) => {
      const notification = existing.get(reminder.id)
      return !notification || !matchesPlan(notification, reminder)
    })

    if (toCancel.length > 0) {
      await driver.cancel({ notifications: toCancel.map(({ id }) => ({ id })) })
    }

    if (toSchedule.length > 0) {
      await driver.createChannel(REMINDER_CHANNEL)
      await driver.schedule({ notifications: toSchedule.map(toNotification) })
    }

    return { status: "synced", scheduled: toSchedule.length, cancelled: toCancel.length }
  } catch (error) {
    return { status: "error", scheduled: 0, cancelled: 0, error }
  }
}

/**
 * Requests notification permission from a user action. Only a pending prompt
 * asks the OS; granted and denied are returned without prompting. Failures are
 * returned, never thrown, so a save can continue.
 */
export async function requestReminderPermission(): Promise<ReminderPermissionResult> {
  try {
    const driver = await loadNativeDriver()
    if (!driver) return { status: "not-native" }

    const current = await driver.checkPermissions()
    if (current.display !== "prompt") {
      return { status: current.display }
    }

    const requested = await driver.requestPermissions()
    return { status: requested.display }
  } catch (error) {
    return { status: "error", error }
  }
}

/** The native driver, or null off a native platform. */
export async function loadNativeDriver(): Promise<ReminderDriver | null> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return null

  const { LocalNotifications } = await import("@capacitor/local-notifications")
  return createNativeDriver(LocalNotifications, Capacitor.getPlatform())
}

/** Maps the native plugin onto the sync seam. The channel is Android-only. */
export function createNativeDriver(
  notifications: NativeNotifications,
  platform: string,
): ReminderDriver {
  return {
    checkPermissions: () => notifications.checkPermissions(),
    requestPermissions: () => notifications.requestPermissions(),
    getPending: () => notifications.getPending(),
    cancel: (options) => notifications.cancel(options),
    createChannel: async (channel) => {
      if (platform !== "android") return
      await notifications.createChannel(channel)
    },
    schedule: (options) => notifications.schedule(options),
  }
}

/**
 * Single-flight runner: one sync at a time, with the latest submitted state
 * queued behind it. Overlapping calls share the run's result, so a burst of
 * state changes coalesces into the newest plan.
 */
export function createReminderSyncQueue(
  run: (input: ReminderPlanInput) => Promise<ReminderSyncResult>,
): (input: ReminderPlanInput) => Promise<ReminderSyncResult> {
  let running: Promise<ReminderSyncResult> | null = null
  let queued: ReminderPlanInput | null = null

  return (input) => {
    queued = input
    if (running) return running

    running = (async () => {
      let result: ReminderSyncResult = { status: "synced", scheduled: 0, cancelled: 0 }

      while (queued) {
        const next = queued
        queued = null
        try {
          result = await run(next)
        } catch (error) {
          result = { status: "error", scheduled: 0, cancelled: 0, error }
        }
      }

      return result
    })().finally(() => {
      running = null
    })

    return running
  }
}

const syncNativeReminders = createReminderSyncQueue(async (input) => {
  const driver = await loadNativeDriver()
  if (!driver) return { status: "not-native", scheduled: 0, cancelled: 0 }
  return syncReminders(input, new Date(), driver)
})

/** Syncs reminders through the native driver, coalescing overlapping calls. */
export function scheduleNativeSupplementReminders(
  input: ReminderPlanInput,
): Promise<ReminderSyncResult> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return Promise.resolve({ status: "not-native", scheduled: 0, cancelled: 0 })
  }

  return syncNativeReminders(input)
}
