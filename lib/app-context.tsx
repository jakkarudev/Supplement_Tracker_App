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
import { createAppStorage, localStorageAdapter } from "@/lib/app-storage"
import type { DroppedRecordCounts } from "@/lib/storage-migration"
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
 * The provider's hydration status. `recovered` means the payload lost data,
 * was backed up, and the salvaged state should be written back in the current
 * format. `failed` is the stopgap for a load that reported a failure — an
 * unreadable payload, an invalid shape, or a version newer than this build:
 * the provider hydrates empty and never writes, so the stored payload is left
 * untouched. #24–#25 split it into incompatible and unavailable.
 */
type HydrationStatus = "loading" | "ready" | "recovered" | "failed"

const StateCtx = createContext<AppState>(INITIAL_STATE)
const DispatchCtx = createContext<React.Dispatch<Action>>(() => {})

function totalDropped(dropped: DroppedRecordCounts): number {
  return dropped.supplements + dropped.doseLogs + dropped.wellnessLogs
}

/**
 * Toasts the backup location and how much was lost. The per-collection
 * details go to the console so the one-line summary stays readable.
 */
function announceRecovery(backupKey: string, dropped: DroppedRecordCounts) {
  const total = totalDropped(dropped)
  console.warn("Recovered stored data", { backupKey, dropped })

  toast.warning(
    total === 0
      ? `Recovered your data from a damaged store; no records were dropped. Backup saved as ${backupKey}.`
      : `Recovered your data; ${total} record${total === 1 ? "" : "s"} were dropped. Backup saved as ${backupKey}.`,
  )
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

  useEffect(() => {
    const result = storage.loadState()

    switch (result.status) {
      case "ok":
        dispatch({ type: "HYDRATE", payload: result.state })
        setStatus("ready")
        return

      case "recovered":
        announceRecovery(result.backupKey, result.dropped)
        dispatch({ type: "HYDRATE", payload: result.state })
        setStatus("recovered")
        return

      case "empty":
        freshInstall.current = true
        setStatus("ready")
        return

      default:
        // The load failed and the payload was left untouched. Never enable
        // writes after a failed read.
        setStatus("failed")
    }
  }, [])

  // Persist after hydration: once for a loaded payload and on every change
  // after that. A recovered load also writes once here, which saves the
  // salvaged state back in the current format so recovery cannot repeat.
  // Nothing is written while loading or after a failed load.
  useEffect(() => {
    if (status !== "ready" && status !== "recovered") return

    if (freshInstall.current) {
      freshInstall.current = false
      return
    }

    storage.saveState(state)
    // Save failures are classified by the seam; #25 surfaces them to the user.
  }, [state, status])

  useEffect(() => {
    if (status !== "ready") return

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
