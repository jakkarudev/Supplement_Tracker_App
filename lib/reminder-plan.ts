import type { DoseLog, SpacingRule, Supplement } from "./supplements-data"
import {
  clockFromTime,
  doseKey,
  logicalDateFrom,
  periodFromTime,
  physicalDateForTime,
  upcomingScheduledDoses,
  type CalendarDate,
  type ScheduledDose,
} from "./day-regimen"
import { buildSpacingPlan, type SpacingPlan } from "./spacing"

export const REMINDER_HORIZON_DAYS = 30
export const MAX_PENDING_REMINDERS = 60

/** One reminder for every unlogged supplement due at a logical date and time. */
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
  spacingRules: SpacingRule[]
}

export type ReminderPlanOptions = {
  horizonDays?: number
  maxReminders?: number
}

/** A stable non-zero id for a logical date and time. The sign bit is cleared
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

/**
 * Maps a logical date and time to its physical timestamp. A time before 05:00
 * occurs on the following physical date; an ambiguous local time resolves to
 * its first occurrence and a nonexistent one rolls forward, as native Date does.
 */
function dateTimeFromLogicalTime(date: CalendarDate, time: string): Date {
  const { hour, minute } = clockFromTime(time)
  return dateTimeFromLocalParts(physicalDateForTime(date, time), hour, minute)
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
 * Builds the Reminder Plan from the Regimen, the Dose Logs, and the Spacing
 * Rules over a horizon that starts at the current Logical Day. Scheduled Doses
 * with any Dose Log, and physical times at or before `now`, produce no
 * reminder. A dose a Spacing Rule adjusted is planned at its adjusted time, so
 * it carries a new id and the old Reminder is cancelled by the sync. A dose
 * whose plan conflicts produces no reminder at all. Inventory is deliberately
 * ignored.
 */
export function planReminders(
  { supplements, doseLogs, spacingRules }: ReminderPlanInput,
  now: Date,
  {
    horizonDays = REMINDER_HORIZON_DAYS,
    maxReminders = MAX_PENDING_REMINDERS,
  }: ReminderPlanOptions = {},
): PlannedReminder[] {
  const logged = new Set(
    doseLogs.map((log) => doseKey(log.supplementId, log.date, log.time)),
  )
  const start = logicalDateFrom(now)
  const groups = new Map<string, { date: CalendarDate; time: string; at: Date; doses: ScheduledDose[] }>()

  // The spacing plan is per logical day, and only a rule can adjust a dose, so
  // the plan is built once per day that has one.
  const plans = new Map<CalendarDate, SpacingPlan>()
  function spacingPlanFor(date: CalendarDate): SpacingPlan {
    const existing = plans.get(date)
    if (existing) return existing

    const plan =
      spacingRules.length === 0
        ? {}
        : buildSpacingPlan({ supplements, doseLogs, spacingRules }, date)
    plans.set(date, plan)
    return plan
  }

  for (const dose of upcomingScheduledDoses(supplements, start, horizonDays)) {
    if (logged.has(dose.key)) continue

    const entry = spacingPlanFor(dose.date)[dose.key]
    if (entry?.conflict) continue

    const time = entry?.adjustedTime ?? dose.time
    const at = dateTimeFromLogicalTime(dose.date, time)
    if (at.getTime() <= now.getTime()) continue

    const slot = `${dose.date}|${time}`
    const group = groups.get(slot)
    if (group) {
      group.doses.push(dose)
    } else {
      groups.set(slot, { date: dose.date, time, at, doses: [dose] })
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, maxReminders)
    .map(({ date, time, at, doses }) => buildReminder(date, time, at, doses))
}
