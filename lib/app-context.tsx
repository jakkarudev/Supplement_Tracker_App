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
  type DoseLog,
  type WellnessLog,
} from "@/lib/supplements-data"
import { nanoid } from "@/lib/nanoid"
import { scheduleNativeSupplementReminders } from "@/lib/reminders"
import { dosageInventoryAmount } from "@/lib/dosage"
import { migrateStoredAppState } from "@/lib/storage-migration"
import { summarizeAdherence } from "@/lib/adherence"
import {
  addDays,
  dayRegimen,
  doseKey,
  formatCalendarDate,
  today,
} from "@/lib/day-regimen"

// ─── State ────────────────────────────────────────────────────────────────────

export type AppState = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
  wellnessLogs: WellnessLog[]
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  | { type: "HYDRATE"; payload: AppState }
  | { type: "ADD_SUPPLEMENT"; payload: Supplement }
  | { type: "UPDATE_SUPPLEMENT"; payload: Supplement }
  | { type: "DELETE_SUPPLEMENT"; payload: string }
  | { type: "LOG_DOSE"; payload: DoseLog }
  | { type: "LOG_WELLNESS"; payload: WellnessLog }

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return action.payload

    case "ADD_SUPPLEMENT":
      return { ...state, supplements: [...state.supplements, action.payload] }

    case "UPDATE_SUPPLEMENT":
      return {
        ...state,
        supplements: state.supplements.map((s) =>
          s.id === action.payload.id ? action.payload : s,
        ),
      }

    case "DELETE_SUPPLEMENT":
      return {
        ...state,
        supplements: state.supplements.filter((s) => s.id !== action.payload),
        doseLogs: state.doseLogs.filter(
          (l) => l.supplementId !== action.payload,
        ),
      }

    case "LOG_DOSE": {
      const incomingKey = doseKey(
        action.payload.supplementId,
        action.payload.date,
        action.payload.time,
      )
      const existingIdx = state.doseLogs.findIndex(
        (l) => doseKey(l.supplementId, l.date, l.time) === incomingKey,
      )
      const existingLog = state.doseLogs[existingIdx]

      // Guard: never double-decrement inventory
      const alreadyTaken = existingLog?.status === "taken"
      const beingTaken = action.payload.status === "taken"

      const newLogs =
        existingIdx >= 0
          ? state.doseLogs.map((l, i) =>
              i === existingIdx ? action.payload : l,
            )
          : [...state.doseLogs, action.payload]

      // Decrement inventory only on first "taken" for this dose
      let supplements = state.supplements
      if (beingTaken && !alreadyTaken) {
        supplements = state.supplements.map((s) => {
          if (s.id !== action.payload.supplementId) return s
          const amount = dosageInventoryAmount(s.dosage)
          return { ...s, currentCount: Math.max(0, s.currentCount - amount) }
        })
      }

      return { ...state, supplements, doseLogs: newLogs }
    }

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
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      dispatch({
        type: "HYDRATE",
        payload: migrateStoredAppState(parsed),
      })
    } catch {
      // Corrupted storage — keep default state
      dispatch({
        type: "HYDRATE",
        payload: migrateStoredAppState(null),
      })
    } finally {
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
