import type { IntakeLog, Supplement, WellnessLog } from "./supplements-data"

type AppStateShape = {
  supplements: Supplement[]
  intakeLogs: IntakeLog[]
  wellnessLogs: WellnessLog[]
}

const LEGACY_STARTED_ON = "1970-01-01"

const HISTORICAL_DRAFTS = [
  {
    id: "vit-d3",
    name: "Vitamin D3 + K2",
    brand: "Thorne",
    potency: "5000 IU",
    dosage: "1 capsule",
    form: "Capsule",
    days: [0, 1, 2, 3, 4, 5, 6],
    times: ["08:00 AM"],
    totalCount: 60,
    currentCount: 8,
    restockReminder: true,
    restockThreshold: 10,
  },
  {
    id: "omega-3",
    name: "Omega-3 Triglyceride",
    brand: "Nordic Naturals",
    potency: "1280 mg",
    dosage: "2 softgels",
    form: "Capsule",
    days: [0, 1, 2, 3, 4, 5, 6],
    times: ["08:00 AM"],
    totalCount: 120,
    currentCount: 74,
    restockReminder: true,
    restockThreshold: 20,
  },
  {
    id: "magnesium",
    name: "Magnesium Glycinate",
    brand: "Pure Encapsulations",
    potency: "120 mg",
    dosage: "2 capsules",
    form: "Capsule",
    days: [0, 1, 2, 3, 4, 5, 6],
    times: ["08:00 PM"],
    totalCount: 90,
    currentCount: 45,
    restockReminder: true,
    restockThreshold: 15,
  },
  {
    id: "creatine",
    name: "Creatine Monohydrate",
    brand: "Momentous",
    potency: "5 g",
    dosage: "1 scoop",
    form: "Powder",
    days: [1, 3, 5],
    times: ["12:30 PM"],
    totalCount: 60,
    currentCount: 52,
    restockReminder: false,
    restockThreshold: 10,
  },
  {
    id: "ashwagandha",
    name: "Ashwagandha KSM-66",
    brand: "Nootropics Depot",
    potency: "600 mg",
    dosage: "1 capsule",
    form: "Capsule",
    days: [0, 1, 2, 3, 4, 5, 6],
    times: ["08:00 PM"],
    totalCount: 90,
    currentCount: 6,
    restockReminder: true,
    restockThreshold: 12,
  },
] as const

function emptyState(): AppStateShape {
  return { supplements: [], intakeLogs: [], wellnessLogs: [] }
}

function positiveOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined
}

function sameNumberArray(a: unknown, b: readonly number[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index])
}

function sameStringArray(a: unknown, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index])
}

function normalizeSupplement(value: unknown): Supplement | null {
  if (!value || typeof value !== "object") return null
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
    times: Array.isArray(s.times) ? s.times : [],
    totalCount: Number.isFinite(s.totalCount) ? Number(s.totalCount) : 0,
    currentCount: Number.isFinite(s.currentCount) ? Number(s.currentCount) : 0,
    restockReminder: s.restockReminder ?? true,
    restockThreshold: Number.isFinite(s.restockThreshold) ? Number(s.restockThreshold) : 10,
  }
}

function isUnreferencedHistoricalDraft(value: unknown, intakeLogs: IntakeLog[]): boolean {
  if (!value || typeof value !== "object") return false
  const s = value as Partial<Supplement>
  if (!s.id || intakeLogs.some((log) => log.supplementId === s.id)) return false

  return HISTORICAL_DRAFTS.some(
    (draft) =>
      s.id === draft.id &&
      s.name === draft.name &&
      s.brand === draft.brand &&
      s.potency === draft.potency &&
      s.dosage === draft.dosage &&
      s.form === draft.form &&
      sameNumberArray(s.days, draft.days) &&
      sameStringArray(s.times, draft.times) &&
      s.totalCount === draft.totalCount &&
      s.currentCount === draft.currentCount &&
      s.restockReminder === draft.restockReminder &&
      s.restockThreshold === draft.restockThreshold,
  )
}

export function migrateStoredAppState(raw: unknown): AppStateShape {
  if (!raw || typeof raw !== "object") return emptyState()
  const input = raw as Partial<AppStateShape>
  const intakeLogs = Array.isArray(input.intakeLogs) ? input.intakeLogs : []
  const wellnessLogs = Array.isArray(input.wellnessLogs) ? input.wellnessLogs : []
  const supplements = Array.isArray(input.supplements)
    ? input.supplements
        .filter((s) => !isUnreferencedHistoricalDraft(s, intakeLogs))
        .map(normalizeSupplement)
        .filter((s): s is Supplement => s !== null)
    : []

  return { supplements, intakeLogs, wellnessLogs }
}

