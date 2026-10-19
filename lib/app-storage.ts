import type { AppState } from "./app-state"
import {
  CURRENT_SCHEMA_VERSION,
  detectSchemaVersion,
  migrateStoredAppState,
  type DroppedRecordCounts,
} from "./storage-migration"

/**
 * The opaque legacy localStorage key. It is not a schema version: it is kept
 * because old cached clients would otherwise diverge onto a second key.
 */
export const STORAGE_KEY = "regimen-v1"

/** Recovery copies live beside the live key, one per corrupt load. */
export const BACKUP_KEY_PREFIX = `${STORAGE_KEY}.corrupt.`

/** Keep only this many of the newest recovery copies. */
const MAX_BACKUPS = 3

/** The minimal Web Storage surface the seam needs. */
export type StorageAdapter = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

/**
 * The outcome of a load. `ok` carries the canonical state and the version it
 * was migrated from (null when it was already current); `empty` means nothing
 * usable was stored; `unavailable` means storage itself could not be reached,
 * so the app must stay usable in memory and never write; `recovered` means the
 * stored payload lost data and a verbatim backup was written before the
 * salvaged state is saved back; `failed` carries the error that stopped the
 * load for every other case. The typed newer-version result (#24) refines the
 * remaining `failed` cases.
 */
export type LoadStateResult =
  | { status: "ok"; state: AppState; migratedFrom: number | null }
  | { status: "empty" }
  | { status: "unavailable"; error: unknown }
  | {
      status: "recovered"
      state: AppState
      backupKey: string
      dropped: DroppedRecordCounts
    }
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

function emptyState(): AppState {
  return { supplements: [], doseLogs: [], wellnessLogs: [] }
}

function noDrops(): DroppedRecordCounts {
  return { supplements: 0, doseLogs: 0, wellnessLogs: 0 }
}

function hasDroppedRecords(dropped: DroppedRecordCounts): boolean {
  return dropped.supplements + dropped.doseLogs + dropped.wellnessLogs > 0
}

/**
 * Writes the raw stored string verbatim to a timestamped backup key before
 * anything can overwrite it, then prunes older copies. Throws when the backup
 * or pruning cannot be written, so the caller can leave the original alone.
 */
function backupPayload(adapter: StorageAdapter, raw: string): string {
  const backupKey = `${BACKUP_KEY_PREFIX}${new Date().toISOString()}`
  adapter.setItem(backupKey, raw)
  pruneBackups(adapter)
  return backupKey
}

/** Keeps only the three newest backup keys; ISO timestamps sort oldest first. */
function pruneBackups(adapter: StorageAdapter): void {
  const backupKeys = adapter
    .keys()
    .filter((key) => key.startsWith(BACKUP_KEY_PREFIX))
    .sort()

  for (const key of backupKeys.slice(0, Math.max(0, backupKeys.length - MAX_BACKUPS))) {
    adapter.removeItem(key)
  }
}

type ParsedPayload =
  | { status: "parsed"; value: unknown }
  | { status: "unparseable" }

/**
 * Parses the raw payload without throwing. An unparseable payload is
 * reported as such so the load can back it up before recovering.
 */
function parsePayload(raw: string): ParsedPayload {
  try {
    return { status: "parsed", value: JSON.parse(raw) }
  } catch {
    return { status: "unparseable" }
  }
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

        const storedPayload = raw

        // Backs the raw payload up verbatim before any write can follow and
        // returns the recovered result. A backup that cannot be written
        // leaves the original untouched and makes the load unavailable, so
        // no write follows it either.
        const recover = (
          state: AppState,
          dropped: DroppedRecordCounts,
        ): LoadStateResult => {
          try {
            const backupKey = backupPayload(adapter, storedPayload)
            writesDisabled = false
            return { status: "recovered", state, backupKey, dropped }
          } catch (error) {
            writesDisabled = true
            return { status: "unavailable", error }
          }
        }

        const parsed = parsePayload(storedPayload)
        if (parsed.status === "unparseable") {
          return recover(emptyState(), noDrops())
        }

        const detection = detectSchemaVersion(parsed.value)
        if (detection.status !== "ok") {
          return recover(emptyState(), noDrops())
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

        const migration = migrateStoredAppState(parsed.value)
        if (migration.status !== "ok") {
          writesDisabled = true
          return {
            status: "failed",
            error: new Error("Stored payload could not be normalized"),
          }
        }

        if (hasDroppedRecords(migration.dropped)) {
          return recover(migration.state, migration.dropped)
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
  removeItem(key) {
    window.localStorage.removeItem(key)
  },
  keys() {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (key !== null) keys.push(key)
    }
    return keys
  },
}
