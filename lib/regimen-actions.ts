import type { DoseLog, DoseStatus, Supplement } from "./supplements-data"
import { dosageInventoryAmount } from "./dosage"
import { doseKey, type CalendarDate } from "./day-regimen"
import { nanoid } from "./nanoid"

/** The tracked state this module owns: supplements and their dose logs. */
export type RegimenState = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
}

/** A user's decision about one scheduled dose. */
export type LogDoseInput = {
  supplementId: string
  date: CalendarDate
  time: string
  status: DoseStatus
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

/** Removes a supplement and its entire dose history. */
export function deleteSupplement(
  state: RegimenState,
  supplementId: string,
): RegimenState {
  return {
    supplements: state.supplements.filter((s) => s.id !== supplementId),
    doseLogs: state.doseLogs.filter((log) => log.supplementId !== supplementId),
  }
}

/**
 * Records the status of one scheduled dose and moves inventory by the
 * difference: entering "taken" consumes the supplement's dosage amount, and
 * leaving "taken" restores the amount recorded when it was taken. "pending"
 * means no log exists; inventory may go negative rather than clamping, so the
 * arithmetic stays reversible.
 */
export function logDose(state: RegimenState, input: LogDoseInput): RegimenState {
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
    const nextLog: DoseLog = { ...existing, status: input.status }
    if (isTaken) {
      nextLog.inventoryAmount =
        existing.inventoryAmount ??
        (supplement ? dosageInventoryAmount(supplement.dosage) : undefined)
    } else {
      delete nextLog.inventoryAmount
    }

    return {
      supplements,
      doseLogs: state.doseLogs.map((log, logIndex) =>
        logIndex === index ? nextLog : log,
      ),
    }
  }

  const newLog: DoseLog = {
    id: nanoid(),
    supplementId: input.supplementId,
    date: input.date,
    time: input.time,
    status: input.status,
  }
  if (isTaken && supplement) {
    newLog.inventoryAmount = dosageInventoryAmount(supplement.dosage)
  }

  return { supplements, doseLogs: [...state.doseLogs, newLog] }
}
