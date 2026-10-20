import {
  SUPPLEMENT_FORMS,
  type DoseLog,
  type DoseStatus,
  type Supplement,
  type SupplementForm,
  type WellnessLog,
} from "./supplements-data"
import type { AppState } from "./app-state"
import { isCalendarDate, normalizeTimeList, normalizeTimeOfDay } from "./day-regimen"

type StoredPayload = Record<string, unknown>

export const CURRENT_SCHEMA_VERSION = 2

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

/** One record count per stored collection. */
export type CollectionRecordCounts = {
  supplements: number
  doseLogs: number
  wellnessLogs: number
}

/** How many records of each collection validation dropped. */
export type DroppedRecordCounts = CollectionRecordCounts

/** How many records of each collection validation repaired. */
export type RepairedRecordCounts = CollectionRecordCounts

/** The total number of records counted across every collection. */
function totalRecords(counts: CollectionRecordCounts): number {
  return counts.supplements + counts.doseLogs + counts.wellnessLogs
}

/** The total number of records dropped across every collection. */
export function totalDroppedRecords(dropped: DroppedRecordCounts): number {
  return totalRecords(dropped)
}

/** True when normalization dropped at least one record. */
export function hasDroppedRecords(dropped: DroppedRecordCounts): boolean {
  return totalRecords(dropped) > 0
}

/** The total number of records repaired across every collection. */
export function totalRepairedRecords(repaired: RepairedRecordCounts): number {
  return totalRecords(repaired)
}

/** True when normalization repaired at least one record. */
export function hasRepairedRecords(repaired: RepairedRecordCounts): boolean {
  return totalRecords(repaired) > 0
}

export type StoredAppStateMigration =
  | {
      status: "ok"
      state: AppState
      migratedFrom: number | null
      dropped: DroppedRecordCounts
      repaired: RepairedRecordCounts
    }
  | { status: "corrupt" }

function isDoseStatus(value: unknown): value is DoseStatus {
  return DOSE_STATUSES.includes(value as DoseStatus)
}

function isSupplementForm(value: unknown): value is SupplementForm {
  return SUPPLEMENT_FORMS.includes(value as SupplementForm)
}

function positiveOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined
}

/** A normalized record plus whether repairing it changed anything stored. */
type NormalizedRecord<T> = {
  record: T
  repaired: boolean
}

/** True when normalization did not reproduce the stored list element for element. */
function listRewritten<T>(
  normalized: readonly T[],
  stored: readonly unknown[],
): boolean {
  return (
    normalized.length !== stored.length ||
    normalized.some((entry, index) => entry !== stored[index])
  )
}

/**
 * True when normalization removed, replaced, or rewrote a value that was
 * present in storage. Absent values never count: filling them with a default
 * is not a repair.
 */
function valueRewritten(normalized: unknown, stored: unknown): boolean {
  if (stored === undefined) return false
  if (Array.isArray(normalized) && Array.isArray(stored)) {
    return listRewritten(normalized, stored)
  }
  return !Object.is(normalized, stored)
}

/**
 * True when any field the normalized record carries differs from its stored
 * value. Unknown stored keys are ignored: validation only judges the fields
 * the canonical record has, and the comparison cannot miss a field a
 * normalizer forgot to flag.
 */
function recordRewritten<T extends object>(
  normalized: T,
  stored: Record<string, unknown>,
): boolean {
  const normalizedValues = normalized as Record<string, unknown>
  return Object.keys(normalizedValues).some((key) =>
    valueRewritten(normalizedValues[key], stored[key]),
  )
}

/** Keeps only integers 0–6, in stored order, without duplicates. */
function normalizeDays(value: readonly unknown[]): number[] {
  const days: number[] = []
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isInteger(entry)) continue
    if (entry < 0 || entry > 6) continue
    if (days.includes(entry)) continue
    days.push(entry)
  }
  return days
}

/** Text fields keep stored strings; any other value becomes its default. */
function normalizeStoredText(
  value: unknown,
  fallback: string | undefined,
): string | undefined {
  return typeof value === "string" ? value : fallback
}

/**
 * Counts and thresholds keep finite stored numbers (negatives included: an
 * overdrawn inventory is real), coerce numeric strings, and fall back to their
 * defaults otherwise.
 */
function normalizeStoredNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}

/** Booleans keep their stored value; anything else becomes the default. */
function normalizeStoredBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function normalizeSupplement(value: unknown): NormalizedRecord<Supplement> | null {
  if (!isRecord(value)) return null
  const s = value as Partial<Supplement>
  if (typeof s.id !== "string" || s.id.length === 0) return null
  if (typeof s.name !== "string" || s.name.length === 0) return null
  if (!isSupplementForm(s.form)) return null
  if (!isCalendarDate(s.startedOn)) return null
  if (!Array.isArray(s.days) || !Array.isArray(s.times)) return null

  const record: Supplement = {
    id: s.id,
    name: s.name,
    brand: normalizeStoredText(s.brand, "") ?? "",
    potency: normalizeStoredText(s.potency, "") ?? "",
    dosage: normalizeStoredText(s.dosage, "") ?? "",
    form: s.form,
    notes: normalizeStoredText(s.notes, undefined),
    purchaseUrl: normalizeStoredText(s.purchaseUrl, undefined),
    startedOn: s.startedOn,
    durationDays: positiveOptionalNumber(s.durationDays),
    cycleActiveDays: positiveOptionalNumber(s.cycleActiveDays),
    cycleBreakDays: positiveOptionalNumber(s.cycleBreakDays),
    days: normalizeDays(s.days),
    times: normalizeTimeList(s.times),
    totalCount: normalizeStoredNumber(s.totalCount, 0),
    currentCount: normalizeStoredNumber(s.currentCount, 0),
    restockReminder: normalizeStoredBoolean(s.restockReminder, true),
    restockThreshold: normalizeStoredNumber(s.restockThreshold, 10),
  }

  return { record, repaired: recordRewritten(record, value) }
}

function normalizeDoseLog(value: unknown): NormalizedRecord<DoseLog> | null {
  if (!isRecord(value)) return null

  const { id, supplementId, date, time, status, inventoryAmount, takenAt } = value
  if (typeof id !== "string" || id.length === 0) return null
  if (typeof supplementId !== "string" || supplementId.length === 0) return null
  if (!isCalendarDate(date)) return null
  if (!isDoseStatus(status)) return null

  const normalizedTime = normalizeTimeOfDay(time)
  if (!normalizedTime) return null

  const record: DoseLog = { id, supplementId, date, time: normalizedTime, status }
  if (
    status === "taken" &&
    typeof inventoryAmount === "number" &&
    Number.isFinite(inventoryAmount) &&
    inventoryAmount > 0
  ) {
    record.inventoryAmount = inventoryAmount
  }
  const normalizedTakenAt = status === "taken" ? normalizeTimeOfDay(takenAt) : null
  if (normalizedTakenAt !== null) record.takenAt = normalizedTakenAt

  // A stripped `inventoryAmount` or `takenAt` is deliberately absent from the
  // normalized record, so the field comparison cannot see it; compare both
  // explicitly. An absent optional value is not a repair.
  const repaired =
    recordRewritten(record, value) ||
    valueRewritten(record.inventoryAmount, inventoryAmount) ||
    valueRewritten(record.takenAt, takenAt)

  return { record, repaired }
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
  repaired: number
} {
  if (!Array.isArray(collection)) return { records: [], dropped: 0, repaired: 0 }

  const byDate = new Map<string, WellnessLog>()
  let dropped = 0
  let repaired = 0

  for (const value of collection) {
    const log = normalizeWellnessLog(value)
    if (log === null) {
      dropped++
    } else {
      // A later entry replacing an earlier one for the same date collapses a
      // stored record, so it is a repair rather than a drop.
      if (byDate.has(log.date)) repaired++
      byDate.set(log.date, log)
    }
  }

  return { records: [...byDate.values()], dropped, repaired }
}

function normalizeRecords<T>(
  collection: unknown,
  normalize: (value: unknown) => NormalizedRecord<T> | null,
): { records: T[]; dropped: number; repaired: number } {
  if (!Array.isArray(collection)) return { records: [], dropped: 0, repaired: 0 }

  const records: T[] = []
  let dropped = 0
  let repaired = 0

  for (const value of collection) {
    const normalized = normalize(value)
    if (normalized === null) {
      dropped++
    } else {
      records.push(normalized.record)
      if (normalized.repaired) repaired++
    }
  }

  return { records, dropped, repaired }
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
  repaired: RepairedRecordCounts
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
    repaired: {
      supplements: supplements.repaired,
      doseLogs: doseLogs.repaired,
      wellnessLogs: wellnessLogs.repaired,
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

/**
 * Version 1 → 2 adds the optional `takenAt` Actual Intake Time field. Logs
 * written before it existed are valid without one, so the step transforms
 * nothing beyond the version marker.
 */
function migrateV1ToV2(payload: StoredPayload): StoredPayload {
  return { ...payload, schemaVersion: 2 }
}

const MIGRATION_STEPS: readonly MigrationStep[] = [migrateV0ToV1, migrateV1ToV2]

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
 * and how many records of each collection validation dropped and repaired.
 */
export function migrateStoredAppState(raw: unknown): StoredAppStateMigration {
  const detection = detectSchemaVersion(raw)
  if (detection.status !== "ok") return { status: "corrupt" }

  const migrated = runMigrationSteps(raw as StoredPayload, detection.version)
  const { state, dropped, repaired } = normalizeStoredState(migrated)

  return {
    status: "ok",
    state,
    migratedFrom: detection.version < CURRENT_SCHEMA_VERSION ? detection.version : null,
    dropped,
    repaired,
  }
}
