import type { Supplement } from "./supplements-data"
import {
  courseStateOn,
  type CalendarDate,
  type CourseState,
} from "./day-regimen"

/** One supplement's inventory as the views should render it. */
export type InventoryRow = {
  supplement: Supplement
  courseState: CourseState
  ratio: number | null
  percent: number
  lowStock: boolean
  overdrawn: boolean
}

/** Counts derived from the same rows the views render. */
export type InventorySummary = {
  current: number
  upcoming: number
  finished: number
  lowStock: number
  overdrawn: number
}

export type Inventory = {
  rows: InventoryRow[]
  summary: InventorySummary
}

const COURSE_STATE_ORDER: Record<CourseState, number> = {
  current: 0,
  upcoming: 1,
  finished: 2,
}

/**
 * Builds the inventory read model: every supplement's stock ratio, low-stock
 * state, course state, and overdrawn state, grouped current -> upcoming ->
 * finished and ordered by urgency within each group.
 *
 * Low stock is an alert, so only a current supplement can raise it. Overdrawn
 * is a data state and is reported for every course.
 */
export function buildInventory(
  supplements: Supplement[],
  date: CalendarDate,
): Inventory {
  const rows = supplements
    .map((supplement) => {
      const courseState = courseStateOn(supplement, date)
      const ratio =
        supplement.totalCount > 0
          ? supplement.currentCount / supplement.totalCount
          : null

      return {
        supplement,
        courseState,
        ratio,
        percent:
          ratio === null
            ? 0
            : Math.max(0, Math.min(100, Math.round(ratio * 100))),
        lowStock:
          courseState === "current" &&
          supplement.restockReminder &&
          supplement.currentCount <= supplement.restockThreshold,
        overdrawn: supplement.currentCount < 0,
      }
    })
    .sort(compareRows)

  return {
    rows,
    summary: {
      current: rows.filter((row) => row.courseState === "current").length,
      upcoming: rows.filter((row) => row.courseState === "upcoming").length,
      finished: rows.filter((row) => row.courseState === "finished").length,
      lowStock: rows.filter((row) => row.lowStock).length,
      overdrawn: rows.filter((row) => row.overdrawn).length,
    },
  }
}

/** Current courses first, then overdrawn, lowest ratio, and name. */
function compareRows(a: InventoryRow, b: InventoryRow): number {
  const byCourse =
    COURSE_STATE_ORDER[a.courseState] - COURSE_STATE_ORDER[b.courseState]
  if (byCourse !== 0) return byCourse

  if (a.overdrawn !== b.overdrawn) return a.overdrawn ? -1 : 1

  if (a.ratio === null || b.ratio === null) {
    if (a.ratio !== b.ratio) return a.ratio === null ? 1 : -1
  } else if (a.ratio !== b.ratio) {
    return a.ratio - b.ratio
  }

  return a.supplement.name.localeCompare(b.supplement.name)
}
