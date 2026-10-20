import {
  addDays,
  doseKey,
  formatCalendarDate,
  scheduledDoses,
  type CalendarDate,
} from "./day-regimen"
import { dosageInventoryAmount } from "./dosage"
import type {
  Inventory,
  InventoryRow,
  InventorySummary,
} from "./inventory"
import type { DoseLog, Supplement } from "./supplements-data"

/** How long a supplement's Inventory lasts against its remaining plan. */
export type InventoryForecast =
  | {
      status: "ok"
      days: number
      runOutDate: CalendarDate
      courseEndsFirst: boolean
      courseEndDate: CalendarDate | null
    }
  | {
      status: "less-than-a-day"
      days: 0
      runOutDate: CalendarDate
    }
  | { status: "out-of-stock" }
  | { status: "no-upcoming-doses" }

/** One stock row plus its forecast; null when the course is not current. */
export type InventoryRowWithForecast = InventoryRow & {
  forecast: InventoryForecast | null
}

export type InventoryWithForecast = {
  rows: InventoryRowWithForecast[]
  summary: InventorySummary
}

/** The copy the Inventory row renders for a forecast. */
export type InventoryForecastDescription = {
  headline: string
  secondary: string | null
}

const MAX_FORECAST_DAYS = 3650
const EPSILON = 1e-9

/** Projects a limited course past its end at the same weekday and cycle pattern. */
function openEnded(supplement: Supplement): Supplement {
  return supplement.durationDays === undefined
    ? supplement
    : { ...supplement, durationDays: undefined }
}

/** The dose keys already logged as taken, which the stock is already net of. */
function takenDoseKeys(supplementId: string, doseLogs: DoseLog[]): Set<string> {
  const taken = new Set<string>()

  for (const log of doseLogs) {
    if (log.supplementId !== supplementId || log.status !== "taken") continue
    taken.add(doseKey(log.supplementId, log.date, log.time))
  }

  return taken
}

/** Whether one full weekday and cycle pattern produces any Scheduled Dose. */
function hasUpcomingDoses(supplement: Supplement, fromDate: CalendarDate): boolean {
  const projected = openEnded(supplement)
  const cycleLength =
    supplement.cycleActiveDays && supplement.cycleBreakDays
      ? supplement.cycleActiveDays + supplement.cycleBreakDays
      : 1
  const patternDays = 7 * cycleLength

  for (let offset = 0; offset < patternDays; offset++) {
    if (scheduledDoses([projected], addDays(fromDate, offset)).length > 0) {
      return true
    }
  }

  return false
}

/**
 * Projects how many complete Logical Days the Inventory covers when every
 * remaining Scheduled Dose is taken as planned.
 */
export function forecastInventory(
  supplement: Supplement,
  doseLogs: DoseLog[],
  fromDate: CalendarDate,
): InventoryForecast {
  if (supplement.currentCount <= 0) return { status: "out-of-stock" }
  if (!hasUpcomingDoses(supplement, fromDate)) {
    return { status: "no-upcoming-doses" }
  }

  const projected = openEnded(supplement)
  const amountPerDose = dosageInventoryAmount(supplement.dosage)
  const taken = takenDoseKeys(supplement.id, doseLogs)
  const courseEndDate =
    supplement.durationDays === undefined
      ? null
      : addDays(supplement.startedOn, supplement.durationDays - 1)

  let remaining = supplement.currentCount

  for (let offset = 0; offset < MAX_FORECAST_DAYS; offset++) {
    const date = addDays(fromDate, offset)
    const remainingDoses = scheduledDoses([projected], date).filter(
      (dose) => !taken.has(dose.key),
    )
    const required = remainingDoses.length * amountPerDose

    if (required > remaining + EPSILON) {
      if (offset === 0) {
        return { status: "less-than-a-day", days: 0, runOutDate: date }
      }

      return {
        status: "ok",
        days: offset,
        runOutDate: date,
        courseEndsFirst: courseEndDate !== null && courseEndDate < date,
        courseEndDate,
      }
    }

    remaining -= required
    if (remaining < 0 && remaining > -EPSILON) remaining = 0
  }

  const runOutDate = addDays(fromDate, MAX_FORECAST_DAYS)
  return {
    status: "ok",
    days: MAX_FORECAST_DAYS,
    runOutDate,
    courseEndsFirst: courseEndDate !== null && courseEndDate < runOutDate,
    courseEndDate,
  }
}

/** Joins the date-only stock read model with each current row's forecast. */
export function joinInventoryForecast(
  inventory: Inventory,
  doseLogs: DoseLog[],
  fromDate: CalendarDate,
): InventoryWithForecast {
  return {
    rows: inventory.rows.map((row) => ({
      ...row,
      forecast:
        row.courseState === "current"
          ? forecastInventory(row.supplement, doseLogs, fromDate)
          : null,
    })),
    summary: inventory.summary,
  }
}

/** The headline and supporting copy for one Inventory forecast. */
export function describeInventoryForecast(
  forecast: InventoryForecast,
): InventoryForecastDescription {
  switch (forecast.status) {
    case "ok": {
      const days = forecast.days === 1 ? "1 day" : `${forecast.days} days`
      const runOut = `Runs out ${formatCalendarDate(forecast.runOutDate)}`
      return {
        headline: `${days} of inventory`,
        secondary:
          forecast.courseEndsFirst && forecast.courseEndDate
            ? `${runOut} · Course ends ${formatCalendarDate(forecast.courseEndDate)}`
            : runOut,
      }
    }

    case "less-than-a-day":
      return {
        headline: "Less than a day of inventory",
        secondary: "Runs out today",
      }

    case "out-of-stock":
      return { headline: "Out of stock", secondary: null }

    case "no-upcoming-doses":
      return { headline: "No upcoming doses", secondary: null }
  }
}
