import type { DoseLog, DoseStatus, Supplement, WellnessLog } from "./supplements-data"
import type { AppState } from "./app-state"
import { isCalendarDate, normalizeTimeList, normalizeTimeOfDay } from "./day-regimen"

type StoredPayload = Record<string, unknown>

export const CURRENT_SCHEMA_VERSION = 1

const LEGACY_STARTED_ON = "1970-01-01"
const DOSE_STATUSES: readonly DoseStatus[] = ["taken", "pending", "snoozed"]

export type SchemaVersionDetection =
  | { status: "ok"; version: number }
  | { status: "corrupt" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Detects the stored schema version. Any finite numeric `schemaVersion` is
 * that version, fractions and negatives included: only the future-version
 * guard in the storage seam compares it against the current version. A
 * missing, non-numeric, or non-finite version is the unversioned legacy
 * shape, version 0. A value that is not a state object at all is corrupt.
 */
export function detectSchemaVersion(raw: unknown): SchemaVersionDetection {
  if (!isRecord(raw)) return { status: "corrupt" }

  const version = raw.schemaVersion
  if (typeof version === "number" && Number.isFinite(version)) {
    return { status: "ok", version }
  }

  return { status: "ok", version: 0 }
}

export type DroppedRecordCounts = {
  supplements: number
  doseLogs: number
  wellnessLogs: number
}

/** The total number of records dropped across every collection. */
export function totalDroppedRecords(dropped: DroppedRecordCounts): number {
  return dropped.supplements + dropped.doseLogs + dropped.wellnessLogs
}

/** True when normalization dropped at least one record. */
export function hasDroppedRecords(dropped: DroppedRecordCounts): boolean {
  return totalDroppedRecords(dropped) > 0
}

export type StoredAppStateMigration =
  | {
      status: "ok"
      state: AppState
      migratedFrom: number | null
      dropped: DroppedRecordCounts
    }
  | { status: "corrupt" }

function isDoseStatus(value: unknown): value is DoseStatus {
  return DOSE_STATUSES.includes(value as DoseStatus)
}

function positiveOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined
}

function normalizeSupplement(value: unknown): Supplement | null {
  if (!isRecord(value)) return null
  const s = value as Partial<Supplement>
  if (!s.id || !s.name || !s.form) return null

  return {
    id: s.id,
    name: s.name,
    brand: s.brand ?? "",
    potency: s.potency ?? "",
    dosage: s.dosage ?? "",
    form: s.form,
    notes: s.notes,
    purchaseUrl: s.purchaseUrl,
    startedOn: s.startedOn ?? LEGACY_STARTED_ON,
    durationDays: positiveOptionalNumber(s.durationDays),
    cycleActiveDays: positiveOptionalNumber(s.cycleActiveDays),
    cycleBreakDays: positiveOptionalNumber(s.cycleBreakDays),
    days: Array.isArray(s.days) ? s.days : [],
    times: normalizeTimeList(s.times),
    totalCount: Number.isFinite(s.totalCount) ? Number(s.totalCount) : 0,
    currentCount: Number.isFinite(s.currentCount) ? Number(s.currentCount) : 0,
    restockReminder: s.restockReminder ?? true,
    restockThreshold: Number.isFinite(s.restockThreshold) ? Number(s.restockThreshold) : 10,
  }
}

function normalizeDoseLog(value: unknown): DoseLog | null {
  if (!isRecord(value)) return null

  const { id, supplementId, date, time, status, inventoryAmount } = value
  if (typeof id !== "string" || id.length === 0) return null
  if (typeof supplementId !== "string" || supplementId.length === 0) return null
  if (!isCalendarDate(date)) return null
  if (!isDoseStatus(status)) return null

  const normalizedTime = normalizeTimeOfDay(time)
  if (!normalizedTime) return null

  const log: DoseLog = { id, supplementId, date, time: normalizedTime, status }
  if (
    status === "taken" &&
    typeof inventoryAmount === "number" &&
    Number.isFinite(inventoryAmount) &&
    inventoryAmount > 0
  ) {
    log.inventoryAmount = inventoryAmount
  }

  return log
}

function isWellnessScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10
}

function normalizeWellnessLog(value: unknown): WellnessLog | null {
  if (!isRecord(value)) return null

  const { date, energy, focus } = value
  if (!isCalendarDate(date)) return null
  if (!isWellnessScore(energy) || !isWellnessScore(focus)) return null

  return { date, energy, focus }
}

/** Validates wellness logs, keeping the last entry per date. */
function normalizeWellnessLogs(collection: unknown): {
  records: WellnessLog[]
  dropped: number
} {
  if (!Array.isArray(collection)) return { records: [], dropped: 0 }

  const byDate = new Map<string, WellnessLog>()
  let dropped = 0

  for (const value of collection) {
    const log = normalizeWellnessLog(value)
    if (log === null) {
      dropped++
    } else {
      byDate.set(log.date, log)
    }
  }

  return { records: [...byDate.values()], dropped }
}

function normalizeRecords<T>(
  collection: unknown,
  normalize: (value: unknown) => T | null,
): { records: T[]; dropped: number } {
  if (!Array.isArray(collection)) return { records: [], dropped: 0 }

  const records: T[] = []
  let dropped = 0

  for (const value of collection) {
    const record = normalize(value)
    if (record === null) {
      dropped++
    } else {
      records.push(record)
    }
  }

  return { records, dropped }
}

/**
 * The stored dose logs. Current storage writes `doseLogs`; legacy state wrote
 * `intakeLogs`, and the current key wins when both exist. Neither key holding
 * an array means there are no logs to read.
 */
function storedDoseLogs(payload: StoredPayload): unknown[] {
  if (Array.isArray(payload.doseLogs)) return payload.doseLogs
  if (Array.isArray(payload.intakeLogs)) return payload.intakeLogs
  return []
}

/** Validates and salvages the collections of a canonical-shaped payload. */
function normalizeStoredState(payload: StoredPayload): {
  state: AppState
  dropped: DroppedRecordCounts
} {
  const rawDoseLogs = storedDoseLogs(payload)
  const rawSupplements = Array.isArray(payload.supplements) ? payload.supplements : []

  const supplements = normalizeRecords(rawSupplements, normalizeSupplement)
  const doseLogs = normalizeRecords(rawDoseLogs, normalizeDoseLog)
  const wellnessLogs = normalizeWellnessLogs(payload.wellnessLogs)

  return {
    state: {
      supplements: supplements.records,
      doseLogs: doseLogs.records,
      wellnessLogs: wellnessLogs.records,
    },
    dropped: {
      supplements: supplements.dropped,
      doseLogs: doseLogs.dropped,
      wellnessLogs: wellnessLogs.dropped,
    },
  }
}

/** Rewrites one legacy supplement as canonical: 24-hour times, timeline defaults. */
function migrateSupplementV0ToV1(value: unknown): unknown {
  if (!isRecord(value)) return value

  return {
    ...value,
    startedOn: value.startedOn ?? LEGACY_STARTED_ON,
    times: normalizeTimeList(value.times),
  }
}

/** Rewrites one legacy dose log as canonical: 24-hour time, no stored period. */
function migrateDoseLogV0ToV1(value: unknown): unknown {
  if (!isRecord(value)) return value

  const migrated = { ...value }
  delete migrated.period

  const time = normalizeTimeOfDay(value.time)
  if (time !== null) migrated.time = time

  return migrated
}

type MigrationStep = (payload: StoredPayload) => StoredPayload

/**
 * Version 0 → 1 owns every legacy concern: `intakeLogs` when `doseLogs` is
 * absent, `doseLogs` preferred when both exist, 12-hour times rewritten to
 * `HH:mm`, stored `period` dropped, and timeline defaults added. The step is
 * pure: re-running it on its own output is a no-op.
 */
function migrateV0ToV1(payload: StoredPayload): StoredPayload {
  const rawDoseLogs = storedDoseLogs(payload)

  return {
    schemaVersion: 1,
    supplements: Array.isArray(payload.supplements)
      ? payload.supplements.map(migrateSupplementV0ToV1)
      : [],
    doseLogs: rawDoseLogs.map(migrateDoseLogV0ToV1),
    wellnessLogs: Array.isArray(payload.wellnessLogs) ? payload.wellnessLogs : [],
  }
}

const MIGRATION_STEPS: readonly MigrationStep[] = [migrateV0ToV1]

function runMigrationSteps(payload: StoredPayload, fromVersion: number): StoredPayload {
  let migrated = payload

  for (let version = fromVersion; version < CURRENT_SCHEMA_VERSION; version++) {
    const step = MIGRATION_STEPS[version]
    if (!step) break
    migrated = step(migrated)
  }

  return migrated
}

/**
 * Runs versioned migration steps and then the always-on normalizer. Returns the
 * canonical state, the version it migrated from (null when already current),
 * and how many records of each collection validation dropped.
 */
export function migrateStoredAppState(raw: unknown): StoredAppStateMigration {
  const detection = detectSchemaVersion(raw)
  if (detection.status !== "ok") return { status: "corrupt" }

  const migrated = runMigrationSteps(raw as StoredPayload, detection.version)
  const { state, dropped } = normalizeStoredState(migrated)

  return {
    status: "ok",
    state,
    migratedFrom: detection.version < CURRENT_SCHEMA_VERSION ? detection.version : null,
    dropped,
  }
}
