"use client"

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useMemo,
} from "react"
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
import { migrateStoredAppState } from "@/lib/storage-migration"
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

const STORAGE_KEY = "regimen-v1"

const StateCtx = createContext<AppState>(INITIAL_STATE)
const DispatchCtx = createContext<React.Dispatch<Action>>(() => {})

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Always render the same initial state on server and first client pass.
  // Hydrate from localStorage in an effect to prevent SSR/client mismatches.
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage after mount.
  useEffect(() => {
    let payload: AppState = INITIAL_STATE

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      const migration = migrateStoredAppState(parsed)
      if (migration.status === "ok") payload = migration.state
    } catch {
      // Corrupted storage — keep default state
    } finally {
      dispatch({ type: "HYDRATE", payload })
      setHydrated(true)
    }
  }, [])

  // Mark hydrated after first render (prevents persistence effect from overwriting on mount)
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage quota exceeded or private mode
    }
  }, [state, hydrated])

  useEffect(() => {
    if (!hydrated) return

    void scheduleNativeSupplementReminders(state.supplements).then((result) => {
      if (result.status === "error") {
        console.warn("Unable to schedule supplement reminders", result.error)
      }
    })
  }, [state.supplements, hydrated])

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
