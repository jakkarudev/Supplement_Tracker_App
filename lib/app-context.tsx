"use client"

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react"
import { toast } from "sonner"
import {
  type Supplement,
  type WellnessLog,
} from "@/lib/supplements-data"
import type { AppState } from "@/lib/app-state"
import { nanoid } from "@/lib/nanoid"
import { scheduleNativeSupplementReminders } from "@/lib/reminders"
import {
  addSupplement,
  deleteSupplement,
  logDose,
  updateSupplement,
  type LogDoseInput,
} from "@/lib/regimen-actions"
import {
  createAppStorage,
  localStorageAdapter,
  type RecoveryCounts,
  type SaveFailureReason,
} from "@/lib/app-storage"
import {
  totalDroppedRecords,
  totalRepairedRecords,
} from "@/lib/storage-migration"
import { summarizeAdherence } from "@/lib/adherence"
import {
  addDays,
  dayRegimen,
  formatCalendarDate,
  today,
} from "@/lib/day-regimen"

// ─── State ────────────────────────────────────────────────────────────────────

// Re-exported so existing imports from the provider keep working.
export type { AppState }

// ─── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  | { type: "HYDRATE"; payload: AppState }
  | { type: "ADD_SUPPLEMENT"; payload: Supplement }
  | { type: "UPDATE_SUPPLEMENT"; payload: Supplement }
  | { type: "DELETE_SUPPLEMENT"; payload: string }
  | { type: "LOG_DOSE"; payload: LogDoseInput }
  | { type: "LOG_WELLNESS"; payload: WellnessLog }

// ─── Reducer ──────────────────────────────────────────────────────────────────

/** Thin adapter over the regimen write model plus wellness logs. */
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return action.payload

    case "ADD_SUPPLEMENT":
      return { ...state, ...addSupplement(state, action.payload) }

    case "UPDATE_SUPPLEMENT":
      return { ...state, ...updateSupplement(state, action.payload) }

    case "DELETE_SUPPLEMENT":
      return { ...state, ...deleteSupplement(state, action.payload) }

    case "LOG_DOSE":
      return { ...state, ...logDose(state, action.payload) }

    case "LOG_WELLNESS": {
      const existingIdx = state.wellnessLogs.findIndex(
        (w) => w.date === action.payload.date,
      )
      const newLogs =
        existingIdx >= 0
          ? state.wellnessLogs.map((w, i) =>
              i === existingIdx ? action.payload : w,
            )
          : [...state.wellnessLogs, action.payload]
      return { ...state, wellnessLogs: newLogs }
    }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const INITIAL_STATE: AppState = {
  supplements: [],
  doseLogs: [],
  wellnessLogs: [],
}

// The seam instance the provider hydrates and persists through.
const storage = createAppStorage(localStorageAdapter)

/**
 * The provider's hydration status. `recovered` means the payload lost or
 * repaired data or failed the top-level shape check, was backed up, and the
 * salvaged state should be written back in the current format. `incompatible`
 * means the stored payload was written by a newer build: the provider hydrates
 * empty, toasts why, and never writes, so the payload is left untouched.
 * `unavailable` means storage could not be reached at load time: the provider
 * serves the empty state, warns that changes will not be saved, and never
 * writes.
 */
type HydrationStatus =
  | "loading"
  | "ready"
  | "recovered"
  | "incompatible"
  | "unavailable"

/** The description shown when a save fails, keyed by its classified reason. */
const SAVE_FAILURE_DESCRIPTIONS: Record<SaveFailureReason, string> = {
  quota: "Storage is full. Your latest changes are not saved.",
  unavailable: "Storage is unavailable. Changes are not being saved.",
  unknown: "Storage is failing. Your latest changes are not saved.",
}

const StateCtx = createContext<AppState>(INITIAL_STATE)
const DispatchCtx = createContext<React.Dispatch<Action>>(() => {})

/** Compile-time exhaustiveness guard for discriminated unions. */
function assertNever(value: never): never {
  throw new Error(`Unexpected load status: ${String(value)}`)
}

/** Renders a record count with the right noun for the one-line summary. */
function recordCount(count: number): string {
  return `${count} record${count === 1 ? "" : "s"}`
}

/** "1 record was" / "2 records were": a count with its agreeing verb. */
function recordCountWithVerb(count: number): string {
  return `${recordCount(count)} ${count === 1 ? "was" : "were"}`
}

/** The one-line summary of a recovery, with its backup location appended. */
function recoverySummary(backupKey: string, counts: RecoveryCounts): string {
  const dropped = totalDroppedRecords(counts.dropped)
  const repaired = totalRepairedRecords(counts.repaired)

  if (dropped > 0 && repaired > 0) {
    return `Recovered your data; ${recordCountWithVerb(dropped)} dropped and ${repaired} repaired. Backup saved as ${backupKey}.`
  }
  if (repaired > 0) {
    return `Cleaned up your stored data; ${recordCountWithVerb(repaired)} repaired. Backup saved as ${backupKey}.`
  }
  if (dropped > 0) {
    return `Recovered your data; ${recordCountWithVerb(dropped)} dropped. Backup saved as ${backupKey}.`
  }
  return `Recovered your data from a damaged store; no records were dropped. Backup saved as ${backupKey}.`
}

/**
 * Toasts the backup location and how much was lost or repaired. The
 * per-collection details go to the console so the one-line summary stays
 * readable.
 */
function announceRecovery(backupKey: string, counts: RecoveryCounts) {
  console.warn("Recovered stored data", { backupKey, ...counts })

  toast.warning(recoverySummary(backupKey, counts))
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Always render the same initial state on server and first client pass.
  // Hydrate through the storage seam in an effect to prevent SSR/client
  // mismatches.
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [status, setStatus] = useState<HydrationStatus>("loading")

  // Set when hydration found nothing stored. The first persistence pass after
  // hydration consumes it so a fresh install writes nothing until the user
  // actually changes something.
  const freshInstall = useRef(false)

  // True while saves keep failing; a failed save logs every time but toasts
  // only when this flips, so one failure streak warns once. A successful save
  // resets it so the next streak warns again.
  const saveFailureActive = useRef(false)

  useEffect(() => {
    const result = storage.loadState()

    switch (result.status) {
      case "ok":
        dispatch({ type: "HYDRATE", payload: result.state })
        setStatus("ready")
        return

      case "recovered":
        announceRecovery(result.backupKey, {
          dropped: result.dropped,
          repaired: result.repaired,
        })
        dispatch({ type: "HYDRATE", payload: result.state })
        setStatus("recovered")
        return

      case "empty":
        freshInstall.current = true
        setStatus("ready")
        return

      case "incompatible":
        // A newer build wrote this payload. Hydrate empty without writing so
        // the stored data survives until the user updates.
        toast.error("Your data was written by a newer version", {
          description:
            "This version can't read it, so nothing is shown. Update the app to see your data.",
        })
        setStatus("incompatible")
        return

      case "unavailable":
        // Storage could not be reached. Serve the empty state (already the
        // initial state), warn that nothing will be saved, and keep writes
        // off so the session stays usable in memory only.
        toast.error("Storage is unavailable", {
          description: "Changes will not be saved during this session.",
        })
        setStatus("unavailable")
        return
    }

    // Unreachable: every load result variant returns above. A new variant
    // makes this fail to compile rather than silently hydrating nothing.
    assertNever(result)
  }, [])

  // Persist after hydration: once for a loaded payload and on every change
  // after that. A recovered load also writes once here, which saves the
  // salvaged state back in the current format so recovery cannot repeat.
  // Nothing is written while loading, while storage is unavailable, or when
  // the stored data is incompatible with this build.
  useEffect(() => {
    if (status !== "ready" && status !== "recovered") return

    if (freshInstall.current) {
      freshInstall.current = false
      return
    }

    const result = storage.saveState(state)

    if (result.status === "saved") {
      saveFailureActive.current = false
      return
    }

    console.error(`Failed to save app state (${result.reason})`, result.error)
    if (!saveFailureActive.current) {
      saveFailureActive.current = true
      toast.error("Changes could not be saved", {
        description: SAVE_FAILURE_DESCRIPTIONS[result.reason],
      })
    }
  }, [state, status])

  // Recovered loads carry salvageable supplements too, so they schedule
  // reminders like any loaded state. Incompatible and unavailable loads
  // hydrate empty and never schedule.
  useEffect(() => {
    if (status !== "ready" && status !== "recovered") return

    void scheduleNativeSupplementReminders(state.supplements).then((result) => {
      if (result.status === "error") {
        console.warn("Unable to schedule supplement reminders", result.error)
      }
    })
  }, [state.supplements, status])

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  )
}

// ─── Public hooks ─────────────────────────────────────────────────────────────

export function useAppState() {
  return useContext(StateCtx)
}

export function useAppDispatch() {
  return useContext(DispatchCtx)
}

/** Returns 7-day adherence stats and chart data derived from stored logs. */
export function useAdherenceStats() {
  const { supplements, doseLogs, wellnessLogs } = useAppState()

  return useMemo(() => {
    // Build an array of the last 7 days in local time ("YYYY-MM-DD")
    const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6))

    const dailyAdherence: (number | null)[] = days.map((date) => {
      const { summary } = dayRegimen({ supplements, doseLogs }, date)
      if (summary.total === 0) return null // nothing scheduled → don't count
      return Math.round((summary.taken / summary.total) * 100)
    })

    // Completed days only: a partial today is excluded from the headline rate
    // and neither helps nor breaks the streak, but it stays in the chart data.
    const { adherenceRate, streak } = summarizeAdherence(dailyAdherence)

    const chartData = days.map((date, i) => {
      const wlog = wellnessLogs.find((w) => w.date === date)
      return {
        day: formatCalendarDate(date, { weekday: "short" }),
        adherence: dailyAdherence[i],
        energy: wlog?.energy ?? null,
        focus: wlog?.focus ?? null,
      }
    })

    const lowStock = supplements.filter(
      (s) => s.restockReminder && s.currentCount <= s.restockThreshold,
    )

    return { adherenceRate, streak, chartData, lowStock }
  }, [supplements, doseLogs, wellnessLogs])
}

/** Generate a stable ID for new supplements and dose logs. */
export { nanoid }
