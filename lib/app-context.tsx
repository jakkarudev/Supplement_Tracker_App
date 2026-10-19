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
  type IntakeLog,
  type WellnessLog,
} from "@/lib/supplements-data"
import { nanoid } from "@/lib/nanoid"
import { scheduleNativeSupplementReminders } from "@/lib/reminders"
import { dosageInventoryAmount } from "@/lib/dosage"
import { migrateStoredAppState } from "@/lib/storage-migration"
import { isSupplementScheduledOnDate } from "@/lib/supplement-schedule"

// ─── State ────────────────────────────────────────────────────────────────────

export type AppState = {
  supplements: Supplement[]
  intakeLogs: IntakeLog[]
  wellnessLogs: WellnessLog[]
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  | { type: "HYDRATE"; payload: AppState }
  | { type: "ADD_SUPPLEMENT"; payload: Supplement }
  | { type: "UPDATE_SUPPLEMENT"; payload: Supplement }
  | { type: "DELETE_SUPPLEMENT"; payload: string }
  | { type: "LOG_INTAKE"; payload: IntakeLog }
  | { type: "LOG_WELLNESS"; payload: WellnessLog }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date as "YYYY-MM-DD" in local time. */
export function todayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Parses "YYYY-MM-DD" to local day-of-week (0=Sun … 6=Sat). */
export function dowFromDate(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number)
  return new Date(y, mo - 1, d).getDay()
}

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
        intakeLogs: state.intakeLogs.filter(
          (l) => l.supplementId !== action.payload,
        ),
      }

    case "LOG_INTAKE": {
      const existingIdx = state.intakeLogs.findIndex(
        (l) =>
          l.supplementId === action.payload.supplementId &&
          l.date === action.payload.date &&
          l.time === action.payload.time,
      )
      const existingLog = state.intakeLogs[existingIdx]

      // Guard: never double-decrement inventory
      const alreadyTaken = existingLog?.status === "taken"
      const beingTaken = action.payload.status === "taken"

      const newLogs =
        existingIdx >= 0
          ? state.intakeLogs.map((l, i) =>
              i === existingIdx ? action.payload : l,
            )
          : [...state.intakeLogs, action.payload]

      // Decrement inventory only on first "taken" for this dose
      let supplements = state.supplements
      if (beingTaken && !alreadyTaken) {
        supplements = state.supplements.map((s) => {
          if (s.id !== action.payload.supplementId) return s
          const amount = dosageInventoryAmount(s.dosage)
          return { ...s, currentCount: Math.max(0, s.currentCount - amount) }
        })
      }

      return { ...state, supplements, intakeLogs: newLogs }
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
  intakeLogs: [],
  wellnessLogs: [],
}

const STORAGE_KEY = "regimen-v1"

const StateCtx = createContext<AppState>(INITIAL_STATE)
// eslint-disable-next-line @typescript-eslint/no-empty-function
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
  const { supplements, intakeLogs, wellnessLogs } = useAppState()

  return useMemo(() => {
    // Build an array of the last 7 days in local time ("YYYY-MM-DD")
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      return `${y}-${mo}-${day}`
    })

    const dailyAdherence: (number | null)[] = days.map((date) => {
      const scheduled = supplements.flatMap((s) =>
        isSupplementScheduledOnDate(s, date) ? s.times.map((time) => ({ sid: s.id, time })) : [],
      )
      if (scheduled.length === 0) return null  // nothing scheduled → don't count
      const takenCount = scheduled.filter(({ sid, time }) =>
        intakeLogs.some(
          (l) =>
            l.supplementId === sid &&
            l.date === date &&
            l.time === time &&
            l.status === "taken",
        ),
      ).length
      return Math.round((takenCount / scheduled.length) * 100)
    })

    const scheduledDailyRates = dailyAdherence.filter((v): v is number => v !== null)
    const adherenceRate =
      scheduledDailyRates.length > 0
        ? Math.round(scheduledDailyRates.reduce((a, b) => a + b, 0) / scheduledDailyRates.length)
        : 0

    // Streak: consecutive 100% scheduled days walking backwards from yesterday (index 5)
    let streak = 0
    for (let i = 5; i >= 0; i--) {
      if (dailyAdherence[i] === 100) streak++
      else if (dailyAdherence[i] !== null) break
      // null (no schedule) days don't break or extend streak
    }
    // Also count today if fully completed
    if (dailyAdherence[6] === 100) streak++

    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const chartData = days.map((date, i) => {
      const wlog = wellnessLogs.find((w) => w.date === date)
      return {
        day: DAY_NAMES[dowFromDate(date)],
        adherence: dailyAdherence[i],
        energy: wlog?.energy ?? null,
        focus: wlog?.focus ?? null,
      }
    })

    const lowStock = supplements.filter(
      (s) => s.restockReminder && s.currentCount <= s.restockThreshold,
    )

    return { adherenceRate, streak, chartData, lowStock }
  }, [supplements, intakeLogs, wellnessLogs])
}

/** Generate a stable ID for a supplement intake action. */
export { nanoid }
