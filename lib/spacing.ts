import type { DoseLog, SpacingRule, Supplement } from "./supplements-data"
import {
  dayRegimen,
  minutesIntoLogicalDay,
  normalizeTimeOfDay,
  type CalendarDate,
  type ScheduledDose,
} from "./day-regimen"

/** Why a Scheduled Dose cannot satisfy the Spacing Rule it is part of. */
export type SpacingConflictKind = "gap-not-met" | "no-time-left-in-day"

/**
 * A Spacing Rule a dose cannot satisfy. The Dose Logs behind it are never
 * rewritten: the conflict is reported, and the earliest safe time says when
 * the dose could have been taken instead.
 */
export type SpacingConflict = {
  kind: SpacingConflictKind
  /** The Supplement whose dose the conflict is about. */
  supplementId: string
  /** The Supplement on the other side of the rule. */
  partnerSupplementId: string
  /** The rule's minimum interval, in minutes. */
  minimumIntervalMinutes: number
  /**
   * The time the dose could have been taken instead, when the Logical Day has
   * room for it. Null when no time on that day satisfies the rule.
   */
  earliestSafeTime: string | null
  /** The partner's Actual Intake Time, when the partner was already taken. */
  partnerTakenAt: string | null
}

/** What one Scheduled Dose may do on a Logical Day. */
export type SpacingPlanEntry = {
  /**
   * The rule's boundary for this dose: the earliest time the rule allows it
   * to be taken, or null when no rule constrains it.
   */
  earliestAllowedTime: string | null
  /** The time the dose should happen: the later of its scheduled time and the rule's boundary. */
  adjustedTime: string
  /** The conflict the dose is part of, if any. */
  conflict: SpacingConflict | null
}

/** The plan for one Logical Day, keyed by Scheduled Dose key. */
export type SpacingPlan = Record<string, SpacingPlanEntry>

/** The state the spacing read model is derived from. */
export type SpacingInput = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
  spacingRules: SpacingRule[]
}

/** A candidate Actual Intake Time for one Supplement on one Logical Day. */
export type SpacingCheckInput = {
  supplementId: string
  logicalDate: CalendarDate
  takenAt: string
}

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

/** The local hour at which one Logical Day becomes the next. */
const LOGICAL_DAY_START_MINUTES = 5 * MINUTES_PER_HOUR

/** The last minute of a Logical Day: 04:59. */
const LAST_MINUTE_OF_LOGICAL_DAY = MINUTES_PER_DAY - 1

/**
 * Converts minutes counted from the Logical Day's 05:00 start back into a
 * canonical "HH:mm" Time of Day. Null when the minutes fall outside the day.
 */
function timeFromLogicalMinutes(minutes: number): string | null {
  if (minutes < 0 || minutes > LAST_MINUTE_OF_LOGICAL_DAY) return null

  const absolute = (minutes + LOGICAL_DAY_START_MINUTES) % MINUTES_PER_DAY
  const hour = Math.floor(absolute / MINUTES_PER_HOUR)
  const minute = absolute % MINUTES_PER_HOUR

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** "4 hours" for a 240-minute rule. */
export function intervalLabel(minutes: number): string {
  const hours = minutes / MINUTES_PER_HOUR
  return `${hours} ${hours === 1 ? "hour" : "hours"}`
}

/** A taken dose and the Actual Intake Time it was recorded with. */
type TakenDose = {
  dose: ScheduledDose
  /** Minutes into the Logical Day the Actual Intake Time falls at. */
  minutes: number
  takenAt: string
}

/** The taken doses that carry an Actual Intake Time, the only ones that constrain. */
function takenDosesWithActualTime(doses: ScheduledDose[]): TakenDose[] {
  const taken: TakenDose[] = []

  for (const dose of doses) {
    if (dose.status !== "taken") continue
    const takenAt = normalizeTimeOfDay(dose.log?.takenAt)
    if (takenAt === null) continue

    taken.push({
      dose,
      minutes: minutesIntoLogicalDay(takenAt),
      takenAt,
    })
  }

  return taken
}

/**
 * The earliest time a dose may be taken without breaking the gap with a
 * partner taken at `partnerMinutes`: the partner's actual time plus the
 * interval. Null when that time falls outside the Logical Day, because the
 * time before the partner is in the past and cannot be taken.
 */
export function earliestSafeTime(
  partnerMinutes: number,
  intervalMinutes: number,
): string | null {
  return timeFromLogicalMinutes(partnerMinutes + intervalMinutes)
}

/**
 * Builds the spacing plan for one Logical Day.
 *
 * Only a recorded Actual Intake Time constrains a partner: a Dose Log
 * without one says nothing about when the dose was taken, so it constrains
 * nothing. A rule holds a pending dose back only when the dose's own
 * scheduled slot falls inside the forbidden window around the partner's
 * actual time: the gap is symmetric and is measured between actual intake
 * times, so a dose that is already far enough away keeps its slot. A taken
 * dose keeps its slot and its log either way.
 */
export function buildSpacingPlan(
  { supplements, doseLogs, spacingRules }: SpacingInput,
  logicalDate: CalendarDate,
): SpacingPlan {
  const doses = dayRegimen({ supplements, doseLogs }, logicalDate).doses
  const taken = takenDosesWithActualTime(doses)

  // The rule's boundary for each dose, and the conflict it carries.
  const boundary = new Map<string, number>()
  const conflicts = new Map<string, SpacingConflict>()

  for (const rule of spacingRules) {
    // A rule that links a supplement to itself cannot be honoured, and the
    // normalizer drops it; the read model ignores it too rather than
    // measuring a dose against itself.
    if (rule.supplementAId === rule.supplementBId) continue

    const interval = rule.minimumIntervalMinutes

    for (const [partnerId, pendingId] of [
      [rule.supplementAId, rule.supplementBId],
      [rule.supplementBId, rule.supplementAId],
    ] as const) {
      const partnerDoses = taken.filter((entry) => entry.dose.supplement.id === partnerId)
      const pendingDoses = doses.filter(
        (dose) => dose.supplement.id === pendingId && dose.status === "pending",
      )

      for (const fact of partnerDoses) {
        for (const dose of pendingDoses) {
          const scheduled = minutesIntoLogicalDay(dose.time)

          // The rule bites only when the dose's own slot falls inside the
          // forbidden window around the partner's actual time.
          if (Math.abs(scheduled - fact.minutes) >= interval) continue

          const allowed = fact.minutes + interval
          const current = boundary.get(dose.key)
          if (current === undefined || allowed > current) {
            boundary.set(dose.key, allowed)
          }

          if (allowed > LAST_MINUTE_OF_LOGICAL_DAY && !conflicts.has(dose.key)) {
            conflicts.set(dose.key, {
              kind: "no-time-left-in-day",
              supplementId: dose.supplement.id,
              partnerSupplementId: fact.dose.supplement.id,
              minimumIntervalMinutes: interval,
              earliestSafeTime: earliestSafeTime(fact.minutes, interval),
              partnerTakenAt: fact.takenAt,
            })
          }
        }
      }
    }

    // Two doses taken inside the forbidden window cannot both be right.
    const takenA = taken.filter((entry) => entry.dose.supplement.id === rule.supplementAId)
    const takenB = taken.filter((entry) => entry.dose.supplement.id === rule.supplementBId)

    for (const a of takenA) {
      for (const b of takenB) {
        if (Math.abs(a.minutes - b.minutes) >= interval) continue

        conflicts.set(a.dose.key, {
          kind: "gap-not-met",
          supplementId: a.dose.supplement.id,
          partnerSupplementId: b.dose.supplement.id,
          minimumIntervalMinutes: interval,
          earliestSafeTime: earliestSafeTime(b.minutes, interval),
          partnerTakenAt: b.takenAt,
        })
        conflicts.set(b.dose.key, {
          kind: "gap-not-met",
          supplementId: b.dose.supplement.id,
          partnerSupplementId: a.dose.supplement.id,
          minimumIntervalMinutes: interval,
          earliestSafeTime: earliestSafeTime(a.minutes, interval),
          partnerTakenAt: a.takenAt,
        })
      }
    }
  }

  const plan: SpacingPlan = {}

  for (const dose of doses) {
    const allowed = boundary.get(dose.key)
    const scheduled = minutesIntoLogicalDay(dose.time)
    const adjusted =
      allowed === undefined
        ? dose.time
        : (timeFromLogicalMinutes(Math.max(scheduled, allowed)) ?? dose.time)

    plan[dose.key] = {
      earliestAllowedTime: allowed === undefined ? null : timeFromLogicalMinutes(allowed),
      adjustedTime: adjusted,
      conflict: conflicts.get(dose.key) ?? null,
    }
  }

  return plan
}

/**
 * The conflict a candidate Actual Intake Time would cause, or null when the
 * time keeps every rule's gap. This is the check the time sheet applies
 * before it records a time.
 */
export function findSpacingConflict(
  { supplements, doseLogs, spacingRules }: SpacingInput,
  { supplementId, logicalDate, takenAt }: SpacingCheckInput,
): SpacingConflict | null {
  const normalized = normalizeTimeOfDay(takenAt)
  if (normalized === null) return null

  const candidate = minutesIntoLogicalDay(normalized)
  const doses = dayRegimen({ supplements, doseLogs }, logicalDate).doses
  const taken = takenDosesWithActualTime(doses)

  for (const rule of spacingRules) {
    if (rule.supplementAId === rule.supplementBId) continue

    const isFirstSide = rule.supplementAId === supplementId
    const isSecondSide = rule.supplementBId === supplementId
    if (!isFirstSide && !isSecondSide) continue

    const partnerId = isFirstSide ? rule.supplementBId : rule.supplementAId
    const interval = rule.minimumIntervalMinutes

    for (const fact of taken) {
      if (fact.dose.supplement.id !== partnerId) continue
      if (Math.abs(candidate - fact.minutes) >= interval) continue

      return {
        kind: "gap-not-met",
        supplementId,
        partnerSupplementId: partnerId,
        minimumIntervalMinutes: interval,
        earliestSafeTime: earliestSafeTime(fact.minutes, interval),
        partnerTakenAt: fact.takenAt,
      }
    }
  }

  return null
}
