import type { DoseLog, DoseStatus, SpacingRule, Supplement } from "./supplements-data"
import { dosageInventoryAmount } from "./dosage"
import { doseKey, normalizeTimeOfDay, type CalendarDate } from "./day-regimen"
import { nanoid } from "./nanoid"

/** The tracked state this module owns: supplements, their dose logs, and their spacing rules. */
export type RegimenState = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
  spacingRules: SpacingRule[]
}

/**
 * The state the dose log write model owns: the supplements and their dose
 * logs. The write model knows nothing about rules, so it never carries them.
 */
export type DoseLogState = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
}

/** A user's decision about one scheduled dose. */
export type LogDoseInput = {
  supplementId: string
  date: CalendarDate
  time: string
  status: DoseStatus
  takenAt?: string
}

/** Appends a supplement. Scheduled doses are derived, so nothing is seeded. */
export function addSupplement(
  state: RegimenState,
  supplement: Supplement,
): RegimenState {
  return { ...state, supplements: [...state.supplements, supplement] }
}

/** Replaces a supplement by id. Dose logs are history and are never rewritten. */
export function updateSupplement(
  state: RegimenState,
  supplement: Supplement,
): RegimenState {
  return {
    ...state,
    supplements: state.supplements.map((existing) =>
      existing.id === supplement.id ? supplement : existing,
    ),
  }
}

/** Removes a supplement, its entire dose history, and the rules that involve it. */
export function deleteSupplement(
  state: RegimenState,
  supplementId: string,
): RegimenState {
  return {
    supplements: state.supplements.filter((s) => s.id !== supplementId),
    doseLogs: state.doseLogs.filter((log) => log.supplementId !== supplementId),
    spacingRules: state.spacingRules.filter(
      (rule) =>
        rule.supplementAId !== supplementId && rule.supplementBId !== supplementId,
    ),
  }
}

/** Appends a spacing rule. Rules are permanent; nothing else moves. */
export function addSpacingRule(
  state: RegimenState,
  rule: SpacingRule,
): RegimenState {
  return { ...state, spacingRules: [...state.spacingRules, rule] }
}

/** Replaces a spacing rule by id. */
export function updateSpacingRule(
  state: RegimenState,
  rule: SpacingRule,
): RegimenState {
  return {
    ...state,
    spacingRules: state.spacingRules.map((existing) =>
      existing.id === rule.id ? rule : existing,
    ),
  }
}

/** Removes a spacing rule by id. */
export function deleteSpacingRule(
  state: RegimenState,
  ruleId: string,
): RegimenState {
  return {
    ...state,
    spacingRules: state.spacingRules.filter((rule) => rule.id !== ruleId),
  }
}

/**
 * Returns a copy of `log` carrying the normalized actual time when the input
 * supplies a valid one. An omitted or invalid value leaves the recorded time
 * untouched rather than erasing it.
 */
function withTakenAt(log: DoseLog, value: string | undefined): DoseLog {
  const takenAt = normalizeTimeOfDay(value)
  return takenAt === null ? log : { ...log, takenAt }
}

/**
 * Records the status of one scheduled dose and moves inventory by the
 * difference: entering "taken" consumes the supplement's dosage amount, and
 * leaving "taken" restores the amount recorded when it was taken. "pending"
 * means no log exists; inventory may go negative rather than clamping, so the
 * arithmetic stays reversible. The write model owns the supplements and their
 * dose logs only: a Spacing Rule never reaches it.
 */
export function logDose(state: DoseLogState, input: LogDoseInput): DoseLogState {
  const key = doseKey(input.supplementId, input.date, input.time)
  const index = state.doseLogs.findIndex(
    (log) => doseKey(log.supplementId, log.date, log.time) === key,
  )
  const existing = index >= 0 ? state.doseLogs[index] : null
  const supplement = state.supplements.find((s) => s.id === input.supplementId)

  const wasTaken = existing?.status === "taken"
  const isTaken = input.status === "taken"

  let supplements = state.supplements
  if (supplement && wasTaken !== isTaken) {
    const amount = wasTaken
      ? existing?.inventoryAmount ?? dosageInventoryAmount(supplement.dosage)
      : dosageInventoryAmount(supplement.dosage)
    const delta = isTaken ? -amount : amount
    supplements = state.supplements.map((candidate) =>
      candidate.id === supplement.id
        ? { ...candidate, currentCount: candidate.currentCount + delta }
        : candidate,
    )
  }

  if (input.status === "pending") {
    return {
      supplements,
      doseLogs: existing
        ? state.doseLogs.filter((_, logIndex) => logIndex !== index)
        : state.doseLogs,
    }
  }

  if (existing) {
    let nextLog: DoseLog = { ...existing, status: input.status }
    if (isTaken) {
      nextLog.inventoryAmount =
        existing.inventoryAmount ??
        (supplement ? dosageInventoryAmount(supplement.dosage) : undefined)
      nextLog = withTakenAt(nextLog, input.takenAt)
    } else {
      delete nextLog.inventoryAmount
      delete nextLog.takenAt
    }

    return {
      supplements,
      doseLogs: state.doseLogs.map((log, logIndex) =>
        logIndex === index ? nextLog : log,
      ),
    }
  }

  let newLog: DoseLog = {
    id: nanoid(),
    supplementId: input.supplementId,
    date: input.date,
    time: input.time,
    status: input.status,
  }
  if (isTaken) {
    if (supplement) {
      newLog.inventoryAmount = dosageInventoryAmount(supplement.dosage)
    }
    newLog = withTakenAt(newLog, input.takenAt)
  }

  return { supplements, doseLogs: [...state.doseLogs, newLog] }
}
