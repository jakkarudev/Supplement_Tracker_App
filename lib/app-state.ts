import type { DoseLog, Supplement, WellnessLog } from "./supplements-data"
import type { TimeFormat } from "./day-regimen"

/** The user's display preferences. */
export type Settings = {
  timeFormat: TimeFormat
}

/** The preferences a fresh install starts with: 12-hour times, as always. */
export const DEFAULT_SETTINGS: Settings = { timeFormat: "12h" }

/** The persisted shape of the user's app data. */
export type AppState = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
  wellnessLogs: WellnessLog[]
  settings: Settings
}
