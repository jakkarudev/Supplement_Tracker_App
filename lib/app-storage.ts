import type { AppState } from "./app-state"
import {
  CURRENT_SCHEMA_VERSION,
  detectSchemaVersion,
  migrateStoredAppState,
} from "./storage-migration"

/**
 * The opaque legacy localStorage key. It is not a schema version: it is kept
 * because old cached clients would otherwise diverge onto a second key.
 */
export const STORAGE_KEY = "regimen-v1"

/** The minimal Web Storage surface the seam needs. */
export type StorageAdapter = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * The outcome of a load. `ok` carries the canonical state and the version it
 * was migrated from (null when it was already current); `empty` means nothing
 * usable was stored; `unavailable` means storage itself could not be reached,
 * so the app must stay usable in memory and never write; `failed` carries the
 * error that stopped the load for every other case. Recovery (#23) and the
 * typed newer-version result (#24) refine the remaining `failed` cases.
 */
export type LoadStateResult =
  | { status: "ok"; state: AppState; migratedFrom: number | null }
  | { status: "empty" }
  | { status: "unavailable"; error: unknown }
  | { status: "failed"; error: unknown }

export type SaveFailureReason = "quota" | "unavailable" | "unknown"

export type SaveStateResult =
  | { status: "saved" }
  | { status: "failed"; reason: SaveFailureReason; error: unknown }

export type AppStorage = {
  loadState: () => LoadStateResult
  saveState: (state: AppState) => SaveStateResult
}

/** Serializes state as the flat stored payload: version beside the collections. */
function serializeState(state: AppState): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    supplements: state.supplements,
    doseLogs: state.doseLogs,
    wellnessLogs: state.wellnessLogs,
  })
}

/**
 * Builds the storage seam over an injected adapter. The seam owns reading,
 * parsing, version detection, migration, and normalization; callers only ever
 * see canonical state and discriminated results. Loading never throws.
 */
export function createAppStorage(adapter: StorageAdapter): AppStorage {
  // A load that cannot use the stored payload disables writes until a load
  // succeeds again, so the payload that failed to load is never written over.
  // Recovery (#23) restores writes after a successful backup; the typed
  // newer-version guard (#24) and unavailable storage (#25) keep them off.
  let writesDisabled = false

  return {
    loadState() {
      let raw: string | null
      try {
        raw = adapter.getItem(STORAGE_KEY)
      } catch (error) {
        // Storage itself is unreachable (blocked, denied, or missing). The
        // app keeps working in memory, but no write may follow this load.
        writesDisabled = true
        return { status: "unavailable", error }
      }

      try {
        if (raw === null || raw === "") {
          writesDisabled = false
          return { status: "empty" }
        }

        const parsed = JSON.parse(raw)
        const detection = detectSchemaVersion(parsed)
        if (detection.status !== "ok") {
          writesDisabled = true
          return {
            status: "failed",
            error: new Error("Stored payload is not a state object"),
          }
        }
        if (detection.version > CURRENT_SCHEMA_VERSION) {
          writesDisabled = true
          return {
            status: "failed",
            error: new Error(
              `Stored payload schema version ${detection.version} is newer than ${CURRENT_SCHEMA_VERSION}`,
            ),
          }
        }

        const migration = migrateStoredAppState(parsed)
        if (migration.status !== "ok") {
          writesDisabled = true
          return {
            status: "failed",
            error: new Error("Stored payload could not be normalized"),
          }
        }

        writesDisabled = false
        return {
          status: "ok",
          state: migration.state,
          migratedFrom: migration.migratedFrom,
        }
      } catch (error) {
        writesDisabled = true
        return { status: "failed", error }
      }
    },

    saveState(state) {
      if (writesDisabled) {
        return {
          status: "failed",
          reason: "unavailable",
          error: new Error("Writes are disabled after a failed load"),
        }
      }

      try {
        adapter.setItem(STORAGE_KEY, serializeState(state))
        return { status: "saved" }
      } catch (error) {
        return { status: "failed", reason: classifySaveError(error), error }
      }
    },
  }
}

/** Maps a thrown storage error onto the reason callers surface to the user. */
function classifySaveError(error: unknown): SaveFailureReason {
  const name = error instanceof Error ? error.name : ""
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return "quota"
  }
  if (name === "SecurityError" || name === "NotAllowedError") {
    return "unavailable"
  }
  return "unknown"
}

/** The only real adapter: the browser's localStorage. */
export const localStorageAdapter: StorageAdapter = {
  getItem(key) {
    return window.localStorage.getItem(key)
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value)
  },
}
