import {
  addDays,
  minutesIntoLogicalDay,
  scheduledDoses,
  type CalendarDate,
} from "./day-regimen"
import type { Supplement } from "./supplements-data"

/**
 * The smallest gap, in minutes, between the two Supplements' scheduled times
 * on a day where both are scheduled. Null when they never share a day in the
 * scanned horizon, which means the base Schedules say nothing about the gap.
 *
 * The gap is a projection over the base Schedules rather than part of the
 * day's plan, so it lives here: the Spacing Rule decides what a day may look
 * like, and this says what the Schedules already ask for.
 */
export function minimumScheduledGap(
  supplementA: Supplement,
  supplementB: Supplement,
  fromDate: CalendarDate,
  horizonDays = 28,
): number | null {
  let smallest: number | null = null

  for (let index = 0; index < horizonDays; index++) {
    const date = addDays(fromDate, index)
    const doses = scheduledDoses([supplementA, supplementB], date)
    const timesA = doses
      .filter((dose) => dose.supplement.id === supplementA.id)
      .map((dose) => dose.time)
    const timesB = doses
      .filter((dose) => dose.supplement.id === supplementB.id)
      .map((dose) => dose.time)

    for (const a of timesA) {
      for (const b of timesB) {
        const gap = Math.abs(minutesIntoLogicalDay(a) - minutesIntoLogicalDay(b))
        if (smallest === null || gap < smallest) smallest = gap
      }
    }
  }

  return smallest
}
