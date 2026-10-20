"use client"

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react"
import { toast } from "sonner"
import {
  type SpacingRule,
  type Supplement,
  type WellnessLog,
} from "@/lib/supplements-data"
import type { AppState, Settings } from "@/lib/app-state"
import { DEFAULT_SETTINGS } from "@/lib/app-state"
import { nanoid } from "@/lib/nanoid"
import {
  scheduleNativeSupplementReminders,
  type ReminderPlanInput,
} from "@/lib/reminders"
import {
  addSpacingRule,
  addSupplement,
  deleteSpacingRule,
  deleteSupplement,
  logDose,
  updateSpacingRule,
  updateSupplement,
  type LogDoseInput,
} from "@/lib/regimen-actions"
import {
  createAppStorage,
  localStorageAdapter,
  type LoadStateResult,
  type RecoveryCounts,
  type SaveFailureReason,
} from "@/lib/app-storage"
import {
  totalDroppedRecords,
  totalRepairedRecords,
  totalRepairedSettings,
} from "@/lib/storage-migration"
import { summarizeAdherence } from "@/lib/adherence"
import { buildInventory } from "@/lib/inventory"
import { joinInventoryForecast } from "@/lib/inventory-forecast"
import {
  addDays,
  dayRegimen,
  formatCalendarDate,
  formatTimeForDisplay,
  today,
  type TimeFormat,
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
  | { type: "ADD_SPACING_RULE"; payload: SpacingRule }
  | { type: "UPDATE_SPACING_RULE"; payload: SpacingRule }
  | { type: "DELETE_SPACING_RULE"; payload: string }
  | { type: "LOG_DOSE"; payload: LogDoseInput }
  | { type: "LOG_WELLNESS"; payload: WellnessLog }
  | { type: "SET_TIME_FORMAT"; payload: TimeFormat }

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

    case "ADD_SPACING_RULE":
      return { ...state, ...addSpacingRule(state, action.payload) }

    case "UPDATE_SPACING_RULE":
      return { ...state, ...updateSpacingRule(state, action.payload) }

    case "DELETE_SPACING_RULE":
      return { ...state, ...deleteSpacingRule(state, action.payload) }

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

    case "SET_TIME_FORMAT":
      return {
        ...state,
        settings: { ...state.settings, timeFormat: action.payload },
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
  spacingRules: [],
  settings: { ...DEFAULT_SETTINGS },
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

/**
 * The app state context, exported so a test can supply state without the
 * storage-backed provider and everything it brings along.
 */
export const AppStateContext = StateCtx

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
  const repairedSettings = totalRepairedSettings(counts.repaired)

  // A repaired display setting is not a repaired record, so it gets its own
  // words: the user chose a format, and this says what happened to it.
  if (repairedSettings > 0) {
    const repairs =
      repaired > 0
        ? `${recordCountWithVerb(repaired)} repaired; the time display setting was reset to 12-hour`
        : "the time display setting was reset to 12-hour"

    if (dropped > 0) {
      return `Recovered your data; ${recordCountWithVerb(dropped)} dropped and ${repairs}. Backup saved as ${backupKey}.`
    }
    return `Cleaned up your stored data; ${repairs}. Backup saved as ${backupKey}.`
  }

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

  // The state object last adopted from another tab. Reference identity lets
  // the persist effect render an adoption without writing it back, while the
  // next local action (a new object) still saves.
  const adoptedState = useRef<AppState | null>(null)

  // Resume listeners outlive any single render, so they read the newest
  // committed state and status through this ref.
  const latest = useRef({ state, status })

  useEffect(() => {
    latest.current = { state, status }
  }, [state, status])

  const syncRemindersFromState = useCallback((input: ReminderPlanInput) => {
    void scheduleNativeSupplementReminders(input).then((result) => {
      if (result.status === "error") {
        console.warn("Unable to sync supplement reminders", result.error)
      }
    })
  }, [])

  /**
   * Routes a load result to state and toasts. A cold start and an external
   * write share this path, with one difference: an external adoption is
   * rendered but never written back, so two tabs cannot echo each other or
   * fight over the key.
   */
  const applyLoadResult = useCallback(
    (result: LoadStateResult, origin: "initial" | "external") => {
      if (origin === "external") {
        // An external adoption replaces whatever a fresh install was waiting
        // to skip; the next local action must save.
        freshInstall.current = false
      }

      /** Renders an adopted state and records it for the write skip. */
      function adopt(nextState: AppState) {
        adoptedState.current = nextState
        dispatch({ type: "HYDRATE", payload: nextState })
      }

      switch (result.status) {
        case "ok":
          if (origin === "external") adopt(result.state)
          else dispatch({ type: "HYDRATE", payload: result.state })
          setStatus("ready")
          return

        case "recovered":
          announceRecovery(result.backupKey, {
            dropped: result.dropped,
            repaired: result.repaired,
          })
          if (origin === "external") adopt(result.state)
          else dispatch({ type: "HYDRATE", payload: result.state })
          setStatus("recovered")
          return

        case "empty":
          if (origin === "initial") {
            freshInstall.current = true
          } else {
            // A fresh object, so the write skip cannot depend on React
            // bailing out of an update that is already the same reference.
            adopt({ ...INITIAL_STATE })
          }
          setStatus("ready")
          return

        case "incompatible":
          // A newer build wrote this payload. Hydrate empty without writing
          // so the stored data survives until the user updates.
          toast.error("Your data was written by a newer version", {
            description:
              "This version can't read it, so nothing is shown. Update the app to see your data.",
          })
          if (origin === "external") {
            adopt({ ...INITIAL_STATE })
          }
          setStatus("incompatible")
          return

        case "unavailable":
          // Storage could not be reached. On a cold start the empty state is
          // already in place; on an external write the current data stays on
          // screen. Writes are off either way, so the session is memory-only.
          toast.error("Storage is unavailable", {
            description: "Changes will not be saved during this session.",
          })
          setStatus("unavailable")
          return
      }

      // Unreachable: every load result variant returns above. A new variant
      // makes this fail to compile rather than silently hydrating nothing.
      assertNever(result)
    },
    [],
  )

  useEffect(() => {
    applyLoadResult(storage.loadState(), "initial")

    // Adopt writes made by another tab through the same pipeline as a cold
    // start. A frozen or bfcache-restored tab can miss the event, so a
    // re-read on return catches anything that arrived while hidden.
    const unsubscribe = storage.subscribe((result) => {
      applyLoadResult(result, "external")
    })

    function handleResume() {
      if (document.visibilityState === "hidden") return
      storage.refresh()

      // refresh() only notifies when the stored payload changed, so a
      // returned tab must re-plan explicitly too. A run that overlaps the
      // adoption effect coalesces onto the newest state.
      const { state: latestState, status: latestStatus } = latest.current
      if (latestStatus === "ready" || latestStatus === "recovered") {
        syncRemindersFromState({
          supplements: latestState.supplements,
          doseLogs: latestState.doseLogs,
          spacingRules: latestState.spacingRules,
        })
      }
    }

    document.addEventListener("visibilitychange", handleResume)
    window.addEventListener("pageshow", handleResume)

    return () => {
      unsubscribe()
      document.removeEventListener("visibilitychange", handleResume)
      window.removeEventListener("pageshow", handleResume)
    }
  }, [applyLoadResult, syncRemindersFromState])

  // Persist after hydration: once for a loaded payload and on every change
  // after that. A recovered load also writes once here, which saves the
  // salvaged state back in the current format so recovery cannot repeat.
  // Nothing is written while loading, while storage is unavailable, or when
  // the stored data is incompatible with this build.
  useEffect(() => {
    // An adoption from another tab renders but never writes back. The ref
    // still matches only within this render, so a local action that follows
    // saves normally.
    if (adoptedState.current === state) {
      adoptedState.current = null
      if (status === "ready" || status === "recovered") return
    }

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

  // Re-plan when hydration completes and whenever the regimen, the dose logs,
  // or the spacing rules change. The sync only checks permission; asking for
  // it belongs to a successful supplement save.
  useEffect(() => {
    if (status !== "ready" && status !== "recovered") return
    syncRemindersFromState({
      supplements: state.supplements,
      doseLogs: state.doseLogs,
      spacingRules: state.spacingRules,
    })
  }, [state.supplements, state.doseLogs, state.spacingRules, status, syncRemindersFromState])

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

/**
 * The stored display preference, or the default when the state carries no
 * settings to read.
 */
function timeFormatOf(settings: Settings | undefined): TimeFormat {
  return settings?.timeFormat ?? DEFAULT_SETTINGS.timeFormat
}

/**
 * The user's time display preference and a formatter bound to it, so a view
 * shows times in the chosen format without threading the format through props.
 */
export function useTimeFormat() {
  const { settings } = useAppState()
  const timeFormat = timeFormatOf(settings)

  const formatTime = useCallback(
    (time: string) => formatTimeForDisplay(time, timeFormat),
    [timeFormat],
  )

  return { timeFormat, formatTime }
}

/** Returns the current inventory read model: sorted rows, forecasts, and summary counts. */
export function useInventory() {
  const { supplements, doseLogs } = useAppState()
  const date = today()

  return useMemo(() => {
    const inventory = buildInventory(supplements, date)
    return joinInventoryForecast(inventory, doseLogs, date)
  }, [supplements, doseLogs, date])
}

/** Returns 7-day adherence stats and chart data derived from stored logs. */
export function useAdherenceStats() {
  const { supplements, doseLogs, wellnessLogs } = useAppState()
  const currentDate = today()

  return useMemo(() => {
    // The last 7 logical days, ending with the current one.
    const days = Array.from({ length: 7 }, (_, i) => addDays(currentDate, i - 6))

    const dailyAdherence: (number | null)[] = days.map((day) => {
      const { summary } = dayRegimen({ supplements, doseLogs }, day)
      if (summary.total === 0) return null // nothing scheduled → don't count
      return Math.round((summary.taken / summary.total) * 100)
    })

    // Completed days only: a partial today is excluded from the headline rate
    // and neither helps nor breaks the streak, but it stays in the chart data.
    const { adherenceRate, streak } = summarizeAdherence(dailyAdherence)

    const chartData = days.map((day, i) => {
      const wlog = wellnessLogs.find((w) => w.date === day)
      return {
        day: formatCalendarDate(day, { weekday: "short" }),
        adherence: dailyAdherence[i],
        energy: wlog?.energy ?? null,
        focus: wlog?.focus ?? null,
      }
    })

    return { adherenceRate, streak, chartData }
  }, [supplements, doseLogs, wellnessLogs, currentDate])
}

/** Generate a stable ID for new supplements and dose logs. */
export { nanoid }
