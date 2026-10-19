# Dosage Regimen Persistence Mobile Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text solid dosages with controlled choices, remove built-in draft supplements without wiping user data, add start/duration/break-aware scheduling, and stop mobile tab content from being hidden under the header.

**Architecture:** Keep the existing localStorage-backed reducer and `Supplement` model, but add small pure helper modules for dosage formatting/parsing, stored-state migration, and schedule eligibility. Reuse those helpers from the form, Today view, adherence stats, inventory decrement, and native notification builder so daily schedule and notifications agree. Preserve the current storage key (`regimen-v1`) and migrate old records in place instead of resetting state.

**Tech Stack:** Next.js 16, React 19, TypeScript, react-hook-form, zod, TailwindCSS, shadcn/ui, Capacitor Local Notifications, Vitest.

---

## Scope Decisions

- New installs start with no supplements. The old built-in supplement examples must not be used as `INITIAL_STATE`.
- Existing localStorage data must remain under `regimen-v1`; do not change the storage key.
- Existing stored supplements are migrated by adding missing timeline fields. They are not replaced with defaults.
- Unmodified built-in drafts may be removed only when they exactly match the old seed records and have no intake history. User-edited records with the same IDs must be preserved.
- For `Capsule` and `Tablet`, dosage is chosen from `1/4`, `1/3`, `1/2`, then whole numbers `1` through `30`.
- For `Liquid`, the user enters milliliters and the app displays `N ml`.
- For `Powder`, the user enters grams and the app displays `N g`.
- Keep storing `dosage` as a display string for compatibility, but parse it through a helper for inventory decrement.
- Add timeline fields directly to `Supplement`: `startedOn`, `durationDays`, `cycleActiveDays`, and `cycleBreakDays`.
- A supplement is scheduled on a date only when the date is on/after `startedOn`, before the optional duration end, inside the active segment of the optional active/break cycle, and included in `days`.
- Native reminders should be generated as one-shot dated notifications for the next 30 days instead of infinite weekly repeating notifications, so future breaks do not keep firing reminders.
- Mobile header spacing should be fixed in `app/page.tsx` and `app/globals.css`, then verified at mobile widths.

## Files

- Modify: `lib/supplements-data.ts`
  - Add timeline fields to `Supplement`.
  - Remove exported draft seed supplements from app initial state.
- Create: `lib/dosage.ts`
  - Centralize solid dosage options, dosage formatting, old-value parsing, and inventory decrement amount.
- Create: `lib/dosage.test.ts`
  - Cover solid options, liquid/powder formatting, and fractional inventory amounts.
- Create: `lib/supplement-schedule.ts`
  - Centralize date math, schedule activity checks, and upcoming eligible reminder dates.
- Create: `lib/supplement-schedule.test.ts`
  - Cover start date, duration, break cycle, weekdays, and upcoming date expansion.
- Create: `lib/storage-migration.ts`
  - Normalize persisted app state without changing the storage key or losing user supplements.
- Create: `lib/storage-migration.test.ts`
  - Cover empty installs, legacy supplements, and safe draft removal.
- Modify: `lib/app-context.tsx`
  - Use `EMPTY_STATE` instead of seed data.
  - Hydrate through `migrateStoredAppState`.
  - Use schedule helpers for adherence.
  - Use dosage helper for inventory decrement.
- Modify: `components/supplement-form.tsx`
  - Render dosage as a select for capsule/tablet and as a numeric input with unit text for liquid/powder.
  - Add timeline controls for start date, duration, and break cycle.
  - Persist migrated timeline fields on create/update.
- Modify: `components/today-routine.tsx`
  - Use `isSupplementScheduledOnDate` instead of checking only weekday.
- Modify: `lib/reminder-schedule.ts`
  - Generate next-30-day dated notifications only for active scheduled dates.
- Modify: `lib/reminder-schedule.test.ts`
  - Update expectations from repeating weekly reminders to dated reminders.
- Modify: `lib/reminders.test.ts`
  - Add timeline fields to fixtures.
- Modify: `app/page.tsx`
  - Add a header ref/content ref and scroll content under the sticky header when tabs change.
- Modify: `app/globals.css`
  - Add mobile scroll-padding/header-clearance utility.

## Task 1: Add Data Contract And Safe Storage Migration

**Files:**
- Modify: `lib/supplements-data.ts`
- Create: `lib/storage-migration.ts`
- Create: `lib/storage-migration.test.ts`
- Modify: `lib/app-context.tsx`

- [ ] **Step 1: Extend `Supplement` with timeline fields**

In `lib/supplements-data.ts`, update the type:

```ts
export type Supplement = {
  id: string
  name: string
  brand: string
  potency: string
  dosage: string
  form: SupplementForm
  notes?: string
  purchaseUrl?: string
  startedOn: string
  durationDays?: number
  cycleActiveDays?: number
  cycleBreakDays?: number
  days: number[]
  times: string[]
  totalCount: number
  currentCount: number
  restockReminder: boolean
  restockThreshold: number
}
```

- [ ] **Step 2: Remove app draft supplements**

Replace the exported seed list with an empty list:

```ts
export const supplements: Supplement[] = []
```

Keep historical draft fingerprints only inside `lib/storage-migration.ts` for exact-match cleanup. Do not export them to the app UI.

- [ ] **Step 3: Write migration tests**

Create `lib/storage-migration.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { migrateStoredAppState } from "./storage-migration"

describe("migrateStoredAppState", () => {
  it("returns an empty user state for first install or corrupt storage", () => {
    expect(migrateStoredAppState(null)).toEqual({
      supplements: [],
      intakeLogs: [],
      wellnessLogs: [],
    })
    expect(migrateStoredAppState({ supplements: "bad" })).toEqual({
      supplements: [],
      intakeLogs: [],
      wellnessLogs: [],
    })
  })

  it("preserves legacy user supplements and adds non-destructive timeline defaults", () => {
    const state = migrateStoredAppState({
      supplements: [{
        id: "custom-magnesium",
        name: "Magnesium",
        brand: "My brand",
        potency: "120 mg",
        dosage: "2 capsules",
        form: "Capsule",
        days: [1, 2, 3],
        times: ["08:00 PM"],
        totalCount: 90,
        currentCount: 44,
        restockReminder: true,
        restockThreshold: 15,
      }],
      intakeLogs: [],
      wellnessLogs: [],
    })

    expect(state.supplements).toHaveLength(1)
    expect(state.supplements[0]).toMatchObject({
      id: "custom-magnesium",
      name: "Magnesium",
      startedOn: "1970-01-01",
    })
  })

  it("removes exact unmodified historical drafts only when no logs reference them", () => {
    const state = migrateStoredAppState({
      supplements: [{
        id: "vit-d3",
        name: "Vitamin D3 + K2",
        brand: "Thorne",
        potency: "5000 IU",
        dosage: "1 capsule",
        form: "Capsule",
        notes: "Take with a fat-containing meal for absorption.",
        purchaseUrl: "https://www.google.com/search?q=Thorne+Vitamin+D3+K2",
        days: [0, 1, 2, 3, 4, 5, 6],
        times: ["08:00 AM"],
        totalCount: 60,
        currentCount: 8,
        restockReminder: true,
        restockThreshold: 10,
      }],
      intakeLogs: [],
      wellnessLogs: [],
    })

    expect(state.supplements).toEqual([])
  })
})
```

- [ ] **Step 4: Implement `migrateStoredAppState`**

Create `lib/storage-migration.ts` with this public shape:

```ts
import type { IntakeLog, Supplement, WellnessLog } from "./supplements-data"

type AppStateShape = {
  supplements: Supplement[]
  intakeLogs: IntakeLog[]
  wellnessLogs: WellnessLog[]
}

const LEGACY_STARTED_ON = "1970-01-01"

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

function emptyState(): AppStateShape {
  return { supplements: [], intakeLogs: [], wellnessLogs: [] }
}
```

Implement `normalizeSupplement` to copy known fields and default missing values:

```ts
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
```

Add the small helpers used by `normalizeSupplement`:

```ts
function positiveOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined
}

function sameNumberArray(a: unknown, b: number[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index])
}

function sameStringArray(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index])
}
```

Add exact historical draft fingerprints for the old seeded examples:

```ts
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
```

Implement exact-match cleanup:

```ts
function isUnreferencedHistoricalDraft(value: unknown, intakeLogs: IntakeLog[]): boolean {
  if (!value || typeof value !== "object") return false
  const s = value as Partial<Supplement>
  if (!s.id || intakeLogs.some((log) => log.supplementId === s.id)) return false

  return HISTORICAL_DRAFTS.some((draft) =>
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
```

- [ ] **Step 5: Hydrate through the migrator**

In `lib/app-context.tsx`, keep `STORAGE_KEY = "regimen-v1"`, change the initial state to empty, and replace the current hydration payload construction:

```ts
const INITIAL_STATE: AppState = {
  supplements: [],
  intakeLogs: [],
  wellnessLogs: [],
}
```

```ts
const parsed = JSON.parse(raw)
dispatch({
  type: "HYDRATE",
  payload: migrateStoredAppState(parsed),
})
```

When `raw` is absent, dispatch `migrateStoredAppState(null)` or keep `INITIAL_STATE`; both must produce empty supplements.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- lib/storage-migration.test.ts
```

Expected: all migration tests pass.

## Task 2: Centralize Dosage Options, Formatting, And Inventory Amounts

**Files:**
- Create: `lib/dosage.ts`
- Create: `lib/dosage.test.ts`
- Modify: `lib/app-context.tsx`

- [ ] **Step 1: Write dosage helper tests**

Create `lib/dosage.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  SOLID_DOSAGE_OPTIONS,
  dosageInventoryAmount,
  formatDosage,
  parseDosageValueForForm,
} from "./dosage"

describe("SOLID_DOSAGE_OPTIONS", () => {
  it("contains fractions then whole doses through 30", () => {
    expect(SOLID_DOSAGE_OPTIONS.slice(0, 5)).toEqual(["1/4", "1/3", "1/2", "1", "2"])
    expect(SOLID_DOSAGE_OPTIONS.at(-1)).toBe("30")
    expect(SOLID_DOSAGE_OPTIONS).toHaveLength(33)
  })
})

describe("formatDosage", () => {
  it("formats controlled solid dosages with the selected form", () => {
    expect(formatDosage("Capsule", "1/2")).toBe("1/2 capsule")
    expect(formatDosage("Tablet", "2")).toBe("2 tablets")
  })

  it("formats liquid and powder typed values with units", () => {
    expect(formatDosage("Liquid", "15")).toBe("15 ml")
    expect(formatDosage("Powder", "3.5")).toBe("3.5 g")
  })
})

describe("parseDosageValueForForm", () => {
  it("extracts existing saved values for edit mode", () => {
    expect(parseDosageValueForForm("Capsule", "2 capsules")).toBe("2")
    expect(parseDosageValueForForm("Tablet", "1/4 tablet")).toBe("1/4")
    expect(parseDosageValueForForm("Liquid", "10 ml")).toBe("10")
    expect(parseDosageValueForForm("Powder", "5 g")).toBe("5")
  })
})

describe("dosageInventoryAmount", () => {
  it("returns fractional or decimal amount for inventory decrement", () => {
    expect(dosageInventoryAmount("1/2 capsule")).toBe(0.5)
    expect(dosageInventoryAmount("1/3 tablet")).toBeCloseTo(1 / 3)
    expect(dosageInventoryAmount("2 capsules")).toBe(2)
  })
})
```

- [ ] **Step 2: Implement dosage helpers**

Create `lib/dosage.ts`:

```ts
import type { SupplementForm } from "./supplements-data"

export const SOLID_DOSAGE_OPTIONS = [
  "1/4",
  "1/3",
  "1/2",
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
]

export function isSolidForm(form: SupplementForm): boolean {
  return form === "Capsule" || form === "Tablet"
}

export function dosageUnitForForm(form: SupplementForm): string {
  if (form === "Liquid") return "ml"
  if (form === "Powder") return "g"
  return form.toLowerCase()
}

export function formatDosage(form: SupplementForm, value: string): string {
  const clean = value.trim()
  if (!clean) return ""
  const unit = dosageUnitForForm(form)
  if (form === "Capsule" || form === "Tablet") {
    const plural = clean === "1" ? unit : `${unit}s`
    return `${clean} ${plural}`
  }
  return `${clean} ${unit}`
}

export function parseDosageValueForForm(form: SupplementForm, dosage: string): string {
  const value = dosage.trim().split(/\s+/)[0] ?? ""
  if (form === "Capsule" || form === "Tablet") {
    return SOLID_DOSAGE_OPTIONS.includes(value) ? value : ""
  }
  return value
}

export function dosageInventoryAmount(dosage: string): number {
  const value = dosage.trim().split(/\s+/)[0] ?? ""
  if (value.includes("/")) {
    const [n, d] = value.split("/").map(Number)
    return Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : 1
  }
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 1
}
```

- [ ] **Step 3: Use dosage helper for inventory decrement**

In `lib/app-context.tsx`, replace:

```ts
const amount = parseInt(s.dosage, 10) || 1
return { ...s, currentCount: Math.max(0, s.currentCount - amount) }
```

with:

```ts
const amount = dosageInventoryAmount(s.dosage)
return { ...s, currentCount: Math.max(0, s.currentCount - amount) }
```

Inventory counts may become fractional when the user logs `1/2` or `1/3` capsule/tablet doses.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test -- lib/dosage.test.ts
```

Expected: all dosage helper tests pass.

## Task 3: Add Active Date And Break Cycle Scheduling Helpers

**Files:**
- Create: `lib/supplement-schedule.ts`
- Create: `lib/supplement-schedule.test.ts`
- Modify: `components/today-routine.tsx`
- Modify: `lib/app-context.tsx`

- [ ] **Step 1: Write scheduling helper tests**

Create `lib/supplement-schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Supplement } from "./supplements-data"
import {
  isSupplementActiveOnDate,
  isSupplementScheduledOnDate,
  upcomingScheduledDates,
} from "./supplement-schedule"

const supplement: Supplement = {
  id: "cycle",
  name: "Cycle supplement",
  brand: "",
  potency: "",
  dosage: "1 capsule",
  form: "Capsule",
  startedOn: "2026-05-01",
  durationDays: 10,
  cycleActiveDays: 3,
  cycleBreakDays: 2,
  days: [1, 2, 3, 4, 5, 6, 0],
  times: ["08:00 AM"],
  totalCount: 60,
  currentCount: 60,
  restockReminder: true,
  restockThreshold: 10,
}

describe("isSupplementActiveOnDate", () => {
  it("excludes dates before start and after finite duration", () => {
    expect(isSupplementActiveOnDate(supplement, "2026-04-30")).toBe(false)
    expect(isSupplementActiveOnDate(supplement, "2026-05-01")).toBe(true)
    expect(isSupplementActiveOnDate(supplement, "2026-05-10")).toBe(true)
    expect(isSupplementActiveOnDate(supplement, "2026-05-11")).toBe(false)
  })

  it("excludes break days inside an active/break cycle", () => {
    expect(isSupplementActiveOnDate(supplement, "2026-05-01")).toBe(true)
    expect(isSupplementActiveOnDate(supplement, "2026-05-03")).toBe(true)
    expect(isSupplementActiveOnDate(supplement, "2026-05-04")).toBe(false)
    expect(isSupplementActiveOnDate(supplement, "2026-05-05")).toBe(false)
    expect(isSupplementActiveOnDate(supplement, "2026-05-06")).toBe(true)
  })
})

describe("isSupplementScheduledOnDate", () => {
  it("also requires the selected weekday", () => {
    const mondayOnly = { ...supplement, cycleActiveDays: undefined, cycleBreakDays: undefined, days: [1] }
    expect(isSupplementScheduledOnDate(mondayOnly, "2026-05-04")).toBe(true)
    expect(isSupplementScheduledOnDate(mondayOnly, "2026-05-05")).toBe(false)
  })
})

describe("upcomingScheduledDates", () => {
  it("returns active scheduled dates in the requested horizon", () => {
    const dates = upcomingScheduledDates(supplement, "2026-05-01", 7)
    expect(dates).toEqual(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-06", "2026-05-07"])
  })
})
```

- [ ] **Step 2: Implement schedule helpers**

Create `lib/supplement-schedule.ts`:

```ts
import type { Supplement } from "./supplements-data"

export function isSupplementScheduledOnDate(supplement: Supplement, date: string): boolean {
  return isSupplementActiveOnDate(supplement, date) && supplement.days.includes(dayOfWeek(date))
}

export function isSupplementActiveOnDate(supplement: Supplement, date: string): boolean {
  const elapsed = daysBetween(supplement.startedOn, date)
  if (elapsed < 0) return false
  if (supplement.durationDays && elapsed >= supplement.durationDays) return false

  const activeDays = supplement.cycleActiveDays
  const breakDays = supplement.cycleBreakDays
  if (activeDays && breakDays) {
    const cycleLength = activeDays + breakDays
    return elapsed % cycleLength < activeDays
  }

  return true
}

export function upcomingScheduledDates(
  supplement: Supplement,
  startDate: string,
  horizonDays: number,
): string[] {
  return Array.from({ length: horizonDays }, (_, index) => addDays(startDate, index))
    .filter((date) => isSupplementScheduledOnDate(supplement, date))
}
```

Include local-date helpers in the same file:

```ts
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d).getDay()
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const next = new Date(y, m - 1, d)
  next.setDate(next.getDate() + days)
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-")
}

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number)
  const [ey, em, ed] = end.split("-").map(Number)
  const a = Date.UTC(sy, sm - 1, sd)
  const b = Date.UTC(ey, em - 1, ed)
  return Math.floor((b - a) / 86_400_000)
}
```

- [ ] **Step 3: Use helper in Today schedule**

In `components/today-routine.tsx`, replace:

```ts
if (!s.days.includes(todayDow)) continue
```

with:

```ts
if (!isSupplementScheduledOnDate(s, today)) continue
```

Remove `todayDow` if no longer used in that component.

- [ ] **Step 4: Use helper in adherence stats**

In `lib/app-context.tsx`, replace the scheduled calculation inside `useAdherenceStats`:

```ts
const scheduled = supplements.flatMap((s) =>
  isSupplementScheduledOnDate(s, date) ? s.times.map((time) => ({ sid: s.id, time })) : [],
)
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test -- lib/supplement-schedule.test.ts
```

Expected: all schedule helper tests pass.

## Task 4: Update The Supplement Form For Dosage And Regimen Timeline

**Files:**
- Modify: `components/supplement-form.tsx`

- [ ] **Step 1: Extend the form schema**

Add timeline and dosage validation to the existing schema:

```ts
const schema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().optional(),
  potency: z.string().optional(),
  form: z.enum(["Capsule", "Tablet", "Liquid", "Powder"]),
  dosage: z.string().min(1, "Dosage is required"),
  notes: z.string().optional(),
  startedOn: z.string().min(1, "Start date is required"),
  durationMode: z.enum(["ongoing", "limited"]).default("ongoing"),
  durationDays: z.coerce.number().optional(),
  cycleEnabled: z.boolean().default(false),
  cycleActiveDays: z.coerce.number().optional(),
  cycleBreakDays: z.coerce.number().optional(),
  days: z.array(z.number()).min(1, "Select at least one day"),
  totalCount: z.coerce.number().min(0).default(60),
  currentCount: z.coerce.number().min(0).default(60),
  purchaseUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => {
      if (!value) return true
      try {
        const url = new URL(value)
        return url.protocol === "http:" || url.protocol === "https:"
      } catch {
        return false
      }
    }, "Enter a valid http or https URL"),
  restockReminder: z.boolean().default(true),
  restockThreshold: z.coerce.number().min(1).default(10),
})
```

Add refines:

```ts
.refine((v) => !isSolidForm(v.form) || SOLID_DOSAGE_OPTIONS.includes(v.dosage), {
  message: "Choose a dosage",
  path: ["dosage"],
})
.refine((v) => isSolidForm(v.form) || Number(v.dosage) > 0, {
  message: "Enter an amount greater than 0",
  path: ["dosage"],
})
.refine((v) => v.durationMode === "ongoing" || Number(v.durationDays) > 0, {
  message: "Enter how many days to take it",
  path: ["durationDays"],
})
.refine((v) => !v.cycleEnabled || Number(v.cycleActiveDays) > 0, {
  message: "Enter active days",
  path: ["cycleActiveDays"],
})
.refine((v) => !v.cycleEnabled || Number(v.cycleBreakDays) > 0, {
  message: "Enter break days",
  path: ["cycleBreakDays"],
})
```

- [ ] **Step 2: Add form defaults**

Set defaults for new supplements:

```ts
startedOn: todayString(),
durationMode: "ongoing",
durationDays: undefined,
cycleEnabled: false,
cycleActiveDays: undefined,
cycleBreakDays: undefined,
```

- [ ] **Step 3: Reset edit values safely**

When editing, populate:

```ts
dosage: parseDosageValueForForm(editing.form, editing.dosage),
startedOn: editing.startedOn,
durationMode: editing.durationDays ? "limited" : "ongoing",
durationDays: editing.durationDays,
cycleEnabled: Boolean(editing.cycleActiveDays && editing.cycleBreakDays),
cycleActiveDays: editing.cycleActiveDays,
cycleBreakDays: editing.cycleBreakDays,
```

- [ ] **Step 4: Render dosage as select or numeric input**

Watch `form` and render:

```tsx
const watchForm = form.watch("form")
```

For capsule/tablet:

```tsx
{isSolidForm(watchForm) ? (
  <Select onValueChange={field.onChange} value={field.value}>
    <FormControl>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose amount" />
      </SelectTrigger>
    </FormControl>
    <SelectContent>
      {SOLID_DOSAGE_OPTIONS.map((option) => (
        <SelectItem key={option} value={option}>
          {option}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
) : (
  <div className="flex items-center gap-2">
    <Input type="number" min="0" step="0.1" inputMode="decimal" {...field} />
    <span className="w-10 text-sm text-muted-foreground">
      {dosageUnitForForm(watchForm)}
    </span>
  </div>
)}
```

When `form` changes, reset `dosage` to `""` so a capsule amount is not accidentally saved as milliliters.

- [ ] **Step 5: Add timeline section**

Add a `SectionCard` after `Schedule` or inside it with:

```tsx
<FormField
  control={form.control}
  name="startedOn"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Started on</FormLabel>
      <FormControl>
        <Input type="date" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Add duration mode select:

```tsx
<FormField
  control={form.control}
  name="durationMode"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Course length</FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="ongoing">Ongoing</SelectItem>
          <SelectItem value="limited">For a set number of days</SelectItem>
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

Watch the conditional fields:

```tsx
const watchDurationMode = form.watch("durationMode")
const watchCycleEnabled = form.watch("cycleEnabled")
```

Render `durationDays` only for limited courses:

```tsx
{watchDurationMode === "limited" && (
  <FormField
    control={form.control}
    name="durationDays"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Take for</FormLabel>
        <FormControl>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} inputMode="numeric" {...field} />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
)}
```

Render the cycle toggle and active/break day inputs:

```tsx
<FormField
  control={form.control}
  name="cycleEnabled"
  render={({ field }) => (
    <FormItem>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/50 p-4">
        <div>
          <p className="text-sm font-medium">Take scheduled breaks</p>
          <p className="text-xs text-muted-foreground">Pause this supplement after active cycles.</p>
        </div>
        <FormControl>
          <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Take scheduled breaks" />
        </FormControl>
      </div>
    </FormItem>
  )}
/>
{watchCycleEnabled && (
  <div className="grid gap-4 sm:grid-cols-2">
    <FormField
      control={form.control}
      name="cycleActiveDays"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Take for</FormLabel>
          <FormControl>
            <Input type="number" min={1} inputMode="numeric" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    <FormField
      control={form.control}
      name="cycleBreakDays"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Break for</FormLabel>
          <FormControl>
            <Input type="number" min={1} inputMode="numeric" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </div>
)}
```

- [ ] **Step 6: Persist formatted dosage and timeline fields**

Before dispatching:

```ts
const dosage = formatDosage(values.form, values.dosage)
const durationDays = values.durationMode === "limited" ? values.durationDays : undefined
const cycleActiveDays = values.cycleEnabled ? values.cycleActiveDays : undefined
const cycleBreakDays = values.cycleEnabled ? values.cycleBreakDays : undefined
```

In both add and update payloads:

```ts
dosage,
startedOn: values.startedOn,
durationDays,
cycleActiveDays,
cycleBreakDays,
```

- [ ] **Step 7: Run lint**

Run:

```bash
pnpm lint
```

Expected: no TypeScript, hook dependency, or JSX lint errors from the form changes.

## Task 5: Make Native Notifications Respect Start, Duration, And Breaks

**Files:**
- Modify: `lib/reminder-schedule.ts`
- Modify: `lib/reminder-schedule.test.ts`
- Modify: `lib/reminders.test.ts`

- [ ] **Step 1: Update notification tests for dated reminders**

In `lib/reminder-schedule.test.ts`, add timeline fields to `baseSupplement`:

```ts
startedOn: "2026-05-01",
durationDays: undefined,
cycleActiveDays: undefined,
cycleBreakDays: undefined,
```

Update the build test to call:

```ts
const notifications = buildSupplementReminderNotifications([baseSupplement], "2026-05-04", 7)
```

Expect notifications only for active dates in the seven-day horizon and assert `schedule.at` exists:

```ts
expect(notifications[0]).toMatchObject({
  title: "Time for Magnesium Glycinate",
  body: "2 capsules · 120 mg",
  channelId: "supplement-reminders",
  schedule: {
    allowWhileIdle: true,
  },
  extra: {
    supplementId: "magnesium",
    time: "12:00 PM",
    date: "2026-05-04",
  },
})
expect(notifications[0].schedule?.at).toBeInstanceOf(Date)
```

- [ ] **Step 2: Generate rolling dated notifications**

Change the function signature:

```ts
const REMINDER_HORIZON_DAYS = 30

export function buildSupplementReminderNotifications(
  supplements: Supplement[],
  fromDate = todayString(),
  horizonDays = REMINDER_HORIZON_DAYS,
): LocalNotificationSchema[] {
  return supplements.flatMap((supplement) =>
    upcomingScheduledDates(supplement, fromDate, horizonDays).flatMap((date) =>
      supplement.times.map((time) => {
        const { hour, minute } = displayTimeToClock(time)
        const dose = [supplement.dosage, supplement.potency].filter(Boolean).join(" · ")

        return {
          id: notificationIdForReminder(supplement.id, date, time),
          title: `Time for ${supplement.name}`,
          body: dose || "Log this supplement.",
          channelId: REMINDER_CHANNEL_ID,
          schedule: {
            at: dateTimeFromLocalParts(date, hour, minute),
            allowWhileIdle: true,
          },
          extra: {
            kind: "supplement-reminder",
            supplementId: supplement.id,
            date,
            time,
          },
        } satisfies LocalNotificationSchema
      }),
    ),
  )
}
```

Update `notificationIdForReminder` to include `date`:

```ts
export function notificationIdForReminder(
  supplementId: string,
  date: string,
  time: string,
): number {
  const key = `${supplementId}|${date}|${time}`
  let hash = 0x811c9dc5

  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0) & 0x7fffffff || 1
}
```

Add:

```ts
function dateTimeFromLocalParts(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d, hour, minute, 0, 0)
}
```

- [ ] **Step 3: Add timeline fields to reminder test fixtures**

In `lib/reminders.test.ts`, add:

```ts
startedOn: "1970-01-01",
durationDays: undefined,
cycleActiveDays: undefined,
cycleBreakDays: undefined,
```

- [ ] **Step 4: Run reminder tests**

Run:

```bash
pnpm test -- lib/reminder-schedule.test.ts lib/reminders.test.ts
```

Expected: reminder builder and sync tests pass with dated notifications.

## Task 6: Fix Mobile Header Covering Tab Content

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add mobile header clearance CSS**

In `app/globals.css`, add utilities:

```css
@layer utilities {
  .scroll-pt-app-header {
    scroll-padding-top: calc(5rem + env(safe-area-inset-top));
  }
  .scroll-mt-app-header {
    scroll-margin-top: calc(5rem + env(safe-area-inset-top));
  }
}
```

If the existing `@layer utilities` block is already present, add only the two classes inside that block.

- [ ] **Step 2: Scroll tab content into view below the sticky header**

In `app/page.tsx`, import `useRef`:

```ts
import { useRef, useState } from "react"
```

Add:

```ts
const contentRef = useRef<HTMLDivElement | null>(null)
```

Replace the current tab-change scroll call:

```ts
window.scrollTo({ top: 0, behavior: "instant" })
```

with:

```ts
requestAnimationFrame(() => {
  contentRef.current?.scrollIntoView({ block: "start", behavior: "instant" })
})
```

Apply the utility to the content wrapper:

```tsx
<div ref={contentRef} className="scroll-mt-app-header flex-1">
```

- [ ] **Step 3: Keep first content visually below header on initial mobile load**

Add a small mobile-only top guard to content:

```tsx
<div ref={contentRef} className="scroll-mt-app-header flex-1 pt-1 sm:pt-0">
```

Do not add enough padding to create a large visual gap; the goal is for content to begin right under the header, not lower on the screen.

- [ ] **Step 4: Verify mobile views**

Run the app:

```bash
pnpm dev
```

Open `http://localhost:3000` at widths `390x844` and `430x932`. Switch through Today, Add, Stats, and Stock. Expected: the first visible content for each tab sits below the sticky header and is not obscured.

## Task 7: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm test -- lib/dosage.test.ts lib/storage-migration.test.ts lib/supplement-schedule.test.ts lib/reminder-schedule.test.ts lib/reminders.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: all Vitest tests pass.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: no lint errors.

- [ ] **Step 4: Run production build**

Run:

```bash
pnpm build
```

Expected: Next build completes successfully.

- [ ] **Step 5: Manual regression checks**

Verify these flows in the browser:

- Fresh app load shows no draft supplements.
- Existing localStorage supplement remains after reload and after code update.
- Add capsule supplement offers `1/4`, `1/3`, `1/2`, `1` through `30`.
- Add tablet supplement offers the same controlled options.
- Add liquid supplement accepts a typed ml amount and displays `N ml`.
- Add powder supplement accepts a typed gram amount and displays `N g`.
- Add a supplement with a future start date; it does not appear in Today and does not create native notifications before start.
- Add a supplement with a limited duration; it disappears after the duration.
- Add a supplement with `3` active days and `2` break days; Today and notifications skip break days.
- Mobile tabs no longer start under the header.
