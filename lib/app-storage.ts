import type { AppState } from "./app-state"
import {
  CURRENT_SCHEMA_VERSION,
  detectSchemaVersion,
  hasDroppedRecords,
  hasRepairedRecords,
  migrateStoredAppState,
  type DroppedRecordCounts,
  type RepairedRecordCounts,
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
 * usable was stored; `recovered` means the stored payload could not be parsed,
 * failed the top-level shape check, or lost or repaired data, and a verbatim
 * backup was written before the salvaged state is saved back; `incompatible`
 * carries the stored version when it is newer than this build, and means the
 * payload is never migrated or written over; `unavailable` means storage
 * itself could not be reached, or a recovery backup could not be written, so
 * the app must stay usable in memory and never write.
 */
export type LoadStateResult =
  | { status: "ok"; state: AppState; migratedFrom: number | null }
  | { status: "empty" }
  | {
      status: "recovered"
      state: AppState
      backupKey: string
      dropped: DroppedRecordCounts
      repaired: RepairedRecordCounts
    }
  | { status: "incompatible"; version: number }
  | { status: "unavailable"; error: unknown }

export type SaveFailureReason = "quota" | "unavailable" | "unknown"

export type SaveStateResult =
  | { status: "saved" }
  | { status: "failed"; reason: SaveFailureReason; error: unknown }

/**
 * The drop and repair counts a recovered load carries, bundled so the two
 * always travel together. The `recovered` result still exposes them as
 * sibling fields because the spec names both there.
 */
export type RecoveryCounts = {
  dropped: DroppedRecordCounts
  repaired: RepairedRecordCounts
}

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

/** Zero drop and repair counts, for a load with nothing to report per collection. */
function noCounts(): RecoveryCounts {
  return {
    dropped: { supplements: 0, doseLogs: 0, wellnessLogs: 0 },
    repaired: { supplements: 0, doseLogs: 0, wellnessLogs: 0 },
  }
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

/** Every collection key a stored payload may carry, including the legacy name. */
const COLLECTION_KEYS = ["supplements", "doseLogs", "intakeLogs", "wellnessLogs"] as const

/**
 * The top-level shape check: a payload that carries a known collection key
 * whose value is not an array has lost that collection. It must be backed up
 * and recovered, never silently emptied by the normalizer and then written
 * over.
 */
function hasInvalidCollectionShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const payload = value as Record<string, unknown>
  return COLLECTION_KEYS.some(
    (key) => key in payload && !Array.isArray(payload[key]),
  )
}

/**
 * Builds the storage seam over an injected adapter. The seam owns reading,
 * parsing, version detection, migration, and normalization; callers only ever
 * see canonical state and discriminated results. Loading never throws.
 */
export function createAppStorage(adapter: StorageAdapter): AppStorage {
  // A load that cannot use the stored payload disables writes until a load
  // succeeds again, so the payload that failed to load is never written over.
  // A recovery that backs the raw payload up successfully re-enables writes so
  // the salvaged state is saved back; an incompatible newer-version payload
  // and unavailable storage keep them off.
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
        counts: RecoveryCounts,
      ): LoadStateResult => {
        try {
          const backupKey = backupPayload(adapter, storedPayload)
          writesDisabled = false
          return {
            status: "recovered",
            state,
            backupKey,
            dropped: counts.dropped,
            repaired: counts.repaired,
          }
        } catch (error) {
          writesDisabled = true
          return { status: "unavailable", error }
        }
      }

      try {
        const parsed = parsePayload(storedPayload)
        if (parsed.status === "unparseable") {
          return recover(emptyState(), noCounts())
        }

        const detection = detectSchemaVersion(parsed.value)
        if (detection.status !== "ok") {
          return recover(emptyState(), noCounts())
        }
        if (detection.version > CURRENT_SCHEMA_VERSION) {
          // Newer data is never migrated, downgraded, or backed up; writes are
          // disabled so this load cannot overwrite the only copy.
          writesDisabled = true
          return { status: "incompatible", version: detection.version }
        }

        const migration = migrateStoredAppState(parsed.value)
        if (migration.status !== "ok") {
          // Defensive: version detection already accepted the payload, but a
          // corrupt migration result still gets the recovery treatment.
          return recover(emptyState(), noCounts())
        }

        if (
          hasInvalidCollectionShape(parsed.value) ||
          hasDroppedRecords(migration.dropped) ||
          hasRepairedRecords(migration.repaired)
        ) {
          return recover(migration.state, {
            dropped: migration.dropped,
            repaired: migration.repaired,
          })
        }

        writesDisabled = false
        return {
          status: "ok",
          state: migration.state,
          migratedFrom: migration.migratedFrom,
        }
      } catch {
        // Anything unexpected while processing a non-empty payload still
        // backs the raw value up before recovering, so nothing can be
        // overwritten without a backup.
        return recover(emptyState(), noCounts())
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
