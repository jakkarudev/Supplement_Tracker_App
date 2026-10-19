import { Capacitor } from "@capacitor/core"
import type {
  Channel,
  LocalNotificationDescriptor,
  LocalNotificationSchema,
  PermissionStatus,
} from "@capacitor/local-notifications"
import type { Supplement } from "./supplements-data"
import {
  buildSupplementReminderNotifications,
  REMINDER_CHANNEL_ID,
} from "./reminder-schedule"

type NativePlatform = "android" | "ios" | "web"

type ReminderDriver = {
  checkPermissions: () => Promise<PermissionStatus>
  requestPermissions: () => Promise<PermissionStatus>
  getPending: () => Promise<{ notifications: Array<LocalNotificationSchema> }>
  cancel: (options: { notifications: LocalNotificationDescriptor[] }) => Promise<void>
  createChannel: (channel: Channel) => Promise<void>
  schedule: (options: { notifications: LocalNotificationSchema[] }) => Promise<unknown>
}

export type ReminderSyncResult =
  | { status: "scheduled"; scheduled: number }
  | { status: "permission-denied"; scheduled: 0 }
  | { status: "not-native"; scheduled: 0 }
  | { status: "error"; scheduled: 0; error: unknown }

export async function syncSupplementReminders(
  supplements: Supplement[],
  driver: ReminderDriver,
  platform: NativePlatform,
): Promise<ReminderSyncResult> {
  const permission = await ensureNotificationPermission(driver)
  if (permission.display !== "granted") {
    return { status: "permission-denied", scheduled: 0 }
  }

  const notifications = buildSupplementReminderNotifications(supplements)
  const pending = await driver.getPending()
  const staleReminders = pending.notifications
    .filter((notification) => notification.extra?.kind === "supplement-reminder")
    .map((notification) => ({ id: notification.id }))

  if (staleReminders.length > 0) {
    await driver.cancel({ notifications: staleReminders })
  }

  if (platform === "android") {
    await driver.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: "Supplement reminders",
      description: "Scheduled reminders for supplement doses.",
      importance: 4,
      visibility: 1,
      vibration: true,
    })
  }

  if (notifications.length > 0) {
    await driver.schedule({ notifications })
  }

  return { status: "scheduled", scheduled: notifications.length }
}

export async function scheduleNativeSupplementReminders(
  supplements: Supplement[],
): Promise<ReminderSyncResult> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return { status: "not-native", scheduled: 0 }
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications")
    const platform = Capacitor.getPlatform() as NativePlatform
    return syncSupplementReminders(supplements, LocalNotifications, platform)
  } catch (error) {
    return { status: "error", scheduled: 0, error }
  }
}

async function ensureNotificationPermission(
  driver: Pick<ReminderDriver, "checkPermissions" | "requestPermissions">,
): Promise<PermissionStatus> {
  const current = await driver.checkPermissions()
  if (current.display === "prompt" || current.display === "prompt-with-rationale") {
    return driver.requestPermissions()
  }

  return current
}
