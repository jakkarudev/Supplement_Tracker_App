import { describe, expect, it } from "vitest"
import { migrateStoredAppState } from "./storage-migration"

const legacySupplement = {
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
}

const canonicalSupplement = {
  ...legacySupplement,
  times: ["20:00"],
  startedOn: "1970-01-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
  notes: undefined,
  purchaseUrl: undefined,
}

describe("migrateStoredAppState", () => {
  it("returns an empty user state for first install or corrupt storage", () => {
    expect(migrateStoredAppState(null)).toEqual({
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
    })
    expect(migrateStoredAppState({ supplements: "bad" })).toEqual({
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
    })
  })

  it("preserves legacy user supplements, normalizes times, and adds timeline defaults", () => {
    const state = migrateStoredAppState({
      supplements: [legacySupplement],
      intakeLogs: [],
      wellnessLogs: [],
    })

    expect(state.supplements).toHaveLength(1)
    expect(state.supplements[0]).toMatchObject({
      id: "custom-magnesium",
      name: "Magnesium",
      startedOn: "1970-01-01",
      times: ["20:00"],
    })
  })

  it("removes exact unmodified historical drafts only when no logs reference them", () => {
    const state = migrateStoredAppState({
      supplements: [
        {
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
        },
      ],
      intakeLogs: [],
      wellnessLogs: [],
    })

    expect(state.supplements).toEqual([])
  })

  it("keeps a historical draft that any legacy intake log references", () => {
    const state = migrateStoredAppState({
      supplements: [
        {
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
        },
      ],
      intakeLogs: [
        {
          id: "log-1",
          supplementId: "vit-d3",
          date: "2026-05-01",
          time: "08:00 AM",
          period: "Morning",
          status: "taken",
        },
      ],
      wellnessLogs: [],
    })

    expect(state.supplements).toHaveLength(1)
    expect(state.supplements[0].id).toBe("vit-d3")
    expect(state.doseLogs).toEqual([
      {
        id: "log-1",
        supplementId: "vit-d3",
        date: "2026-05-01",
        time: "08:00",
        status: "taken",
      },
    ])
  })

  it("deduplicates supplement times after normalization and drops invalid times", () => {
    const state = migrateStoredAppState({
      supplements: [
        {
          ...legacySupplement,
          times: ["08:00 AM", "8:00 AM", "08:00", "noon", "12:00 PM", "12:00", "24:00"],
        },
      ],
      doseLogs: [],
      wellnessLogs: [],
    })

    expect(state.supplements[0].times).toEqual(["08:00", "12:00"])
  })

  it("keeps a supplement whose stored times are all invalid but removes the times", () => {
    const state = migrateStoredAppState({
      supplements: [{ ...legacySupplement, times: ["noon", "24:00"] }],
      doseLogs: [],
      wellnessLogs: [],
    })

    expect(state.supplements).toHaveLength(1)
    expect(state.supplements[0].times).toEqual([])
  })

  it("migrates legacy intake logs to dose logs without the stored period", () => {
    const state = migrateStoredAppState({
      supplements: [legacySupplement],
      intakeLogs: [
        {
          id: "log-1",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "08:00 AM",
          period: "Morning",
          status: "taken",
        },
        {
          id: "log-2",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "08:00 PM",
          period: "Morning",
          status: "snoozed",
        },
      ],
      wellnessLogs: [],
    })

    expect(state.doseLogs).toEqual([
      {
        id: "log-1",
        supplementId: "custom-magnesium",
        date: "2026-05-01",
        time: "08:00",
        status: "taken",
      },
      {
        id: "log-2",
        supplementId: "custom-magnesium",
        date: "2026-05-01",
        time: "20:00",
        status: "snoozed",
      },
    ])
    expect(state.doseLogs[0]).not.toHaveProperty("period")
    expect(state.doseLogs[1]).not.toHaveProperty("period")
  })

  it("prefers doseLogs when both the current and legacy keys are present", () => {
    const state = migrateStoredAppState({
      supplements: [legacySupplement],
      doseLogs: [
        {
          id: "current",
          supplementId: "custom-magnesium",
          date: "2026-05-02",
          time: "20:00",
          status: "taken",
        },
      ],
      intakeLogs: [
        {
          id: "legacy",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "08:00 AM",
          period: "Morning",
          status: "taken",
        },
      ],
      wellnessLogs: [],
    })

    expect(state.doseLogs.map((log) => log.id)).toEqual(["current"])
  })

  it("drops invalid dose logs", () => {
    const state = migrateStoredAppState({
      supplements: [legacySupplement],
      doseLogs: [
        {
          id: "valid",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "20:00",
          status: "taken",
        },
        {
          id: "bad-time",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "25:00",
          status: "taken",
        },
        {
          id: "bad-date",
          supplementId: "custom-magnesium",
          date: "2026-02-30",
          time: "20:00",
          status: "taken",
        },
        {
          id: "missing-supplement",
          date: "2026-05-01",
          time: "20:00",
          status: "taken",
        },
        {
          id: "bad-status",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "20:00",
          status: "forgotten",
        },
      ],
      wellnessLogs: [],
    })

    expect(state.doseLogs.map((log) => log.id)).toEqual(["valid"])
  })

  it("is idempotent for already-canonical state", () => {
    const canonicalState = {
      supplements: [canonicalSupplement],
      doseLogs: [
        {
          id: "log-1",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "20:00",
          status: "taken",
        },
      ],
      wellnessLogs: [{ date: "2026-05-01", energy: 7, focus: 8 }],
    }

    const once = migrateStoredAppState(canonicalState)
    expect(once).toEqual(canonicalState)
    expect(migrateStoredAppState(once)).toEqual(once)
  })
})
