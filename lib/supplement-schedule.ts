import type { Supplement } from "./supplements-data"
import {
  upcomingScheduledDoses,
  scheduledDoses,
  type CalendarDate,
} from "./day-regimen"

/**
 * Temporary adapter for Adherence and Reminders. Both callers move to the
 * day-regimen seams directly; this module is deleted in the contract ticket.
 */
export function isSupplementScheduledOnDate(
  supplement: Supplement,
  date: CalendarDate,
): boolean {
  return scheduledDoses([supplement], date).length > 0
}

export function upcomingScheduledDates(
  supplement: Supplement,
  startDate: CalendarDate,
  horizonDays: number,
): CalendarDate[] {
  return [
    ...new Set(
      upcomingScheduledDoses([supplement], startDate, horizonDays).map((dose) => dose.date),
    ),
  ]
}
