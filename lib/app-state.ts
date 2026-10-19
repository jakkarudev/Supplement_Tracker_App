import type { DoseLog, Supplement, WellnessLog } from "./supplements-data"

/** The persisted shape of the user's app data. */
export type AppState = {
  supplements: Supplement[]
  doseLogs: DoseLog[]
  wellnessLogs: WellnessLog[]
}
