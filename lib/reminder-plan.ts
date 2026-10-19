import type { DoseLog, Supplement } from "./supplements-data"
import {
  calendarDateFrom,
  clockFromTime,
  doseKey,
  periodFromTime,
  upcomingScheduledDoses,
  type CalendarDate,
  type ScheduledDose,
} from "./day-regimen"

export const REMINDER_HORIZON_DAYS = 30
export const MAX_PENDING_REMINDERS = 60

/** One reminder for every unlogged supplement due at a calendar date and time. */
export type PlannedReminder = {
  id: number
  date: CalendarDate
  time: string
  at: Date
  title: string
  body: string
  supplementIds: string[]
}

export type ReminderPlanInput = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
}

export type ReminderPlanOptions = {
  horizonDays?: number
  maxReminders?: number
}

/** A stable non-zero id for a calendar date and time. The sign bit is cleared
 * because pending local notification ids are signed 32-bit integers. */
export function reminderIdFor(date: CalendarDate, time: string): number {
  const key = `reminder|${date}|${time}`
  let hash = 0x811c9dc5

  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return ((hash >>> 0) & 0x7fffffff) || 1
}

function dateTimeFromLocalParts(
  date: CalendarDate,
  hour: number,
  minute: number,
): Date {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function dosageLabel(supplement: Supplement): string {
  const label = [supplement.dosage, supplement.potency].filter(Boolean).join(" · ")
  return label || "Log this supplement."
}

function buildReminder(
  date: CalendarDate,
  time: string,
  at: Date,
  doses: ScheduledDose[],
): PlannedReminder {
  const supplementIds = doses.map((dose) => dose.supplement.id)
  const single = doses.length === 1 ? doses[0].supplement : null

  return {
    id: reminderIdFor(date, time),
    date,
    time,
    at,
    title: single ? `Time for ${single.name}` : `${periodFromTime(time)} supplements`,
    body: single
      ? dosageLabel(single)
      : doses.map((dose) => dose.supplement.name).join(" · "),
    supplementIds,
  }
}

/**
 * Builds the Reminder Plan from the Regimen and Dose Logs. Scheduled Doses with
 * any Dose Log, and times at or before `now`, produce no reminder. Inventory is
 * deliberately ignored.
 */
export function planReminders(
  { supplements, doseLogs }: ReminderPlanInput,
  now: Date,
  {
    horizonDays = REMINDER_HORIZON_DAYS,
    maxReminders = MAX_PENDING_REMINDERS,
  }: ReminderPlanOptions = {},
): PlannedReminder[] {
  const logged = new Set(
    doseLogs.map((log) => doseKey(log.supplementId, log.date, log.time)),
  )
  const start = calendarDateFrom(now)
  const groups = new Map<string, { date: CalendarDate; time: string; at: Date; doses: ScheduledDose[] }>()

  for (const dose of upcomingScheduledDoses(supplements, start, horizonDays)) {
    if (logged.has(dose.key)) continue

    const { hour, minute } = clockFromTime(dose.time)
    const at = dateTimeFromLocalParts(dose.date, hour, minute)
    if (at.getTime() <= now.getTime()) continue

    const slot = `${dose.date}|${dose.time}`
    const group = groups.get(slot)
    if (group) {
      group.doses.push(dose)
    } else {
      groups.set(slot, { date: dose.date, time: dose.time, at, doses: [dose] })
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, maxReminders)
    .map(({ date, time, at, doses }) => buildReminder(date, time, at, doses))
}
