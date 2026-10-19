import type { LocalNotificationSchema } from "@capacitor/local-notifications"
import type { Supplement } from "./supplements-data"
import { upcomingScheduledDates } from "./supplement-schedule"
import { clockFromTime } from "./time"

export const REMINDER_CHANNEL_ID = "supplement-reminders"
const REMINDER_HORIZON_DAYS = 30

export function notificationIdForReminder(
  supplementId: string,
  date: string,
  time: string,
): number {
  const key = `${supplementId}|${date}|${time}`
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

function todayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function buildSupplementReminderNotifications(
  supplements: Supplement[],
  fromDate = todayString(),
  horizonDays = REMINDER_HORIZON_DAYS,
): LocalNotificationSchema[] {
  return supplements.flatMap((supplement) =>
    upcomingScheduledDates(supplement, fromDate, horizonDays).flatMap((date) =>
      supplement.times.map((time) => {
        const { hour, minute } = clockFromTime(time)
        const dose = [supplement.dosage, supplement.potency].filter(Boolean).join(" · ")

        return {
          id: notificationIdForReminder(supplement.id, date, time),
          title: `Time for ${supplement.name}`,
          body: dose || "Log this supplement.",
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
      }),
    ),
  )
}
