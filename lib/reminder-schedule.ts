import type { LocalNotificationSchema } from "@capacitor/local-notifications"
import type { Supplement } from "./supplements-data"
import { clockFromTime, doseKey, today, upcomingScheduledDoses } from "./day-regimen"

export const REMINDER_CHANNEL_ID = "supplement-reminders"
const REMINDER_HORIZON_DAYS = 30

export function notificationIdForReminder(
  supplementId: string,
  date: string,
  time: string,
): number {
  const key = doseKey(supplementId, date, time)
  let hash = 0x811c9dc5

  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0) & 0x7fffffff || 1
}

function dateTimeFromLocalParts(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d, hour, minute, 0, 0)
}

export function buildSupplementReminderNotifications(
  supplements: Supplement[],
  fromDate = today(),
  horizonDays = REMINDER_HORIZON_DAYS,
): LocalNotificationSchema[] {
  return upcomingScheduledDoses(supplements, fromDate, horizonDays).map((scheduled) => {
    const { supplement, date, time } = scheduled
    const { hour, minute } = clockFromTime(time)
    const dosageLabel = [supplement.dosage, supplement.potency].filter(Boolean).join(" · ")

    return {
      id: notificationIdForReminder(supplement.id, date, time),
      title: `Time for ${supplement.name}`,
      body: dosageLabel || "Log this supplement.",
      channelId: REMINDER_CHANNEL_ID,
      schedule: {
        at: dateTimeFromLocalParts(date, hour, minute),
        allowWhileIdle: true,
      },
      extra: {
        kind: "supplement-reminder",
        supplementId: supplement.id,
        date,
        time,
      },
    } satisfies LocalNotificationSchema
  })
}
