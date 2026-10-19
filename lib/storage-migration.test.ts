import { describe, expect, it } from "vitest"
import {
  detectSchemaVersion,
  hasDroppedRecords,
  hasRepairedRecords,
  migrateStoredAppState,
  totalDroppedRecords,
  totalRepairedRecords,
} from "./storage-migration"

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
  notes: undefined,
  purchaseUrl: undefined,
  startedOn: "1970-01-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
}

const legacyIntakeLog = {
  id: "log-1",
  supplementId: "custom-magnesium",
  date: "2026-05-01",
  time: "08:00 AM",
  period: "Morning",
  status: "taken",
}

const canonicalDoseLog = {
  id: "log-1",
  supplementId: "custom-magnesium",
  date: "2026-05-01",
  time: "08:00",
  status: "taken",
}

const NO_DROPS = { supplements: 0, doseLogs: 0, wellnessLogs: 0 }
const NO_REPAIRS = { supplements: 0, doseLogs: 0, wellnessLogs: 0 }

const historicalSample = {
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
}

const canonicalHistoricalSample = {
  ...historicalSample,
  times: ["08:00"],
  startedOn: "1970-01-01",
  durationDays: undefined,
  cycleActiveDays: undefined,
  cycleBreakDays: undefined,
}

function expectOk(result: ReturnType<typeof migrateStoredAppState>) {
  expect(result.status).toBe("ok")
  if (result.status !== "ok") throw new Error("expected an ok migration result")
  return result
}

describe("migrateStoredAppState", () => {
  it("migrates an unversioned payload from version 0 and reports no drops", () => {
    const result = migrateStoredAppState({
      supplements: [legacySupplement],
      intakeLogs: [legacyIntakeLog],
      wellnessLogs: [],
    })

    expect(result).toEqual({
      status: "ok",
      migratedFrom: 0,
      dropped: NO_DROPS,
      repaired: NO_REPAIRS,
      state: {
        supplements: [canonicalSupplement],
        doseLogs: [canonicalDoseLog],
        wellnessLogs: [],
      },
    })
  })

  it("does not report a migration for canonical version 1 data", () => {
    const result = migrateStoredAppState({
      schemaVersion: 1,
      supplements: [canonicalSupplement],
      doseLogs: [canonicalDoseLog],
      wellnessLogs: [],
    })

    expect(result).toEqual({
      status: "ok",
      migratedFrom: null,
      dropped: NO_DROPS,
      repaired: NO_REPAIRS,
      state: {
        supplements: [canonicalSupplement],
        doseLogs: [canonicalDoseLog],
        wellnessLogs: [],
      },
    })
  })

  it("reports a structurally invalid payload as corrupt", () => {
    for (const raw of [null, undefined, [], "state", 42]) {
      expect(migrateStoredAppState(raw)).toEqual({ status: "corrupt" })
    }
  })

  it("prefers doseLogs when both the current and legacy keys are present", () => {
    const result = expectOk(
      migrateStoredAppState({
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
        intakeLogs: [legacyIntakeLog],
        wellnessLogs: [],
      }),
    )

    expect(result.migratedFrom).toBe(0)
    expect(result.state.doseLogs).toEqual([
      {
        id: "current",
        supplementId: "custom-magnesium",
        date: "2026-05-02",
        time: "20:00",
        status: "taken",
      },
    ])
  })

  it("treats a non-numeric schemaVersion as version 0 and migrates it", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: "1",
        supplements: [legacySupplement],
        intakeLogs: [legacyIntakeLog],
        wellnessLogs: [],
      }),
    )

    expect(result.migratedFrom).toBe(0)
    expect(result.state.supplements[0].times).toEqual(["20:00"])
    expect(result.state.doseLogs).toEqual([canonicalDoseLog])
    expect(result.state.doseLogs[0]).not.toHaveProperty("period")
  })

  it("normalizes and deduplicates supplement times, dropping invalid ones", () => {
    const result = expectOk(
      migrateStoredAppState({
        supplements: [
          {
            ...legacySupplement,
            times: ["08:00 AM", "8:00 AM", "08:00", "noon", "12:00 PM", "12:00", "24:00"],
          },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    // The version 0 → 1 step already rewrote the 12-hour times, so the
    // always-on normalizer sees canonical values and counts no repairs.
    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements[0].times).toEqual(["08:00", "12:00"])
  })

  it("keeps a supplement whose stored times are all invalid but removes the times", () => {
    const result = expectOk(
      migrateStoredAppState({
        supplements: [{ ...legacySupplement, times: ["noon", "24:00"] }],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements).toHaveLength(1)
    expect(result.state.supplements[0].times).toEqual([])
  })

  it("counts filtered, duplicated, and 12-hour stored times as one repair", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          { ...canonicalSupplement, times: ["noon", "08:00 PM", "20:00", "20:00"] },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired.supplements).toBe(1)
    expect(result.state.supplements[0].times).toEqual(["20:00"])
  })

  it("counts dropped records per collection", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          canonicalSupplement,
          { name: "missing id and form" },
          "not a supplement",
        ],
        doseLogs: [
          canonicalDoseLog,
          {
            id: "bad-date",
            supplementId: "custom-magnesium",
            date: "2026-02-30",
            time: "20:00",
            status: "taken",
          },
        ],
        wellnessLogs: [
          { date: "2026-05-01", energy: 7, focus: 8 },
          { date: "2026-02-30", energy: 7, focus: 8 },
          { date: "2026-05-02", energy: 0, focus: 8 },
          { date: "2026-05-03", energy: 7, focus: 11 },
          { date: "2026-05-04", energy: "7", focus: 8 },
          { date: "2026-05-05", energy: Number.POSITIVE_INFINITY, focus: 8 },
        ],
      }),
    )

    expect(result.dropped).toEqual({
      supplements: 2,
      doseLogs: 1,
      wellnessLogs: 5,
    })
    expect(result.state.supplements).toEqual([canonicalSupplement])
    expect(result.state.doseLogs).toEqual([canonicalDoseLog])
    expect(result.state.wellnessLogs).toEqual([
      { date: "2026-05-01", energy: 7, focus: 8 },
    ])
  })

  it("drops supplements whose id or name is not a non-empty string", () => {
    const invalidSupplements = [
      { ...canonicalSupplement, id: "" },
      { ...canonicalSupplement, id: 42 },
      { ...canonicalSupplement, id: undefined },
      { ...canonicalSupplement, name: "" },
      { ...canonicalSupplement, name: null },
      { ...canonicalSupplement, name: ["Magnesium"] },
    ]

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [canonicalSupplement, ...invalidSupplements],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped.supplements).toBe(invalidSupplements.length)
    expect(result.state.supplements).toEqual([canonicalSupplement])
  })

  it("drops supplements whose form is not one of the four known forms", () => {
    const invalidSupplements = ["Gummy", "capsule", "", 42, null, undefined].map(
      (form) => ({ ...canonicalSupplement, id: `bad-form-${String(form)}`, form }),
    )

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [canonicalSupplement, ...invalidSupplements],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped.supplements).toBe(invalidSupplements.length)
    expect(result.state.supplements).toEqual([canonicalSupplement])
  })

  it("drops supplements whose startedOn is not a real calendar date", () => {
    const invalidSupplements = [
      undefined,
      null,
      "",
      "banana",
      "2026-02-30",
      "2026-5-1",
      20260501,
    ].map((startedOn) => ({
      ...canonicalSupplement,
      id: `bad-start-${String(startedOn)}`,
      startedOn,
    }))

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [canonicalSupplement, ...invalidSupplements],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped.supplements).toBe(invalidSupplements.length)
    expect(result.state.supplements).toEqual([canonicalSupplement])
  })

  it("defaults a missing startedOn only while migrating version 0", () => {
    const legacy = expectOk(
      migrateStoredAppState({
        supplements: [legacySupplement],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )
    expect(legacy.dropped.supplements).toBe(0)
    expect(legacy.state.supplements[0].startedOn).toBe("1970-01-01")

    const canonical = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [{ ...canonicalSupplement, startedOn: undefined }],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )
    expect(canonical.dropped.supplements).toBe(1)
    expect(canonical.state.supplements).toEqual([])
  })

  it("drops supplements whose days or times are missing or not an array", () => {
    const invalidSupplements = [
      { ...canonicalSupplement, days: undefined },
      { ...canonicalSupplement, days: "1,2,3" },
      { ...canonicalSupplement, days: null },
      { ...canonicalSupplement, days: 3 },
      { ...canonicalSupplement, times: undefined },
      { ...canonicalSupplement, times: "20:00" },
      { ...canonicalSupplement, times: null },
      { ...canonicalSupplement, times: {} },
    ]

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [canonicalSupplement, ...invalidSupplements],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped.supplements).toBe(invalidSupplements.length)
    expect(result.state.supplements).toEqual([canonicalSupplement])
  })

  it("keeps explicit empty days and times and stays idempotent", () => {
    const schedulelessSupplement = { ...canonicalSupplement, days: [], times: [] }

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [schedulelessSupplement],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped).toEqual(NO_DROPS)
    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements).toEqual([schedulelessSupplement])

    const again = expectOk(
      migrateStoredAppState({ schemaVersion: 1, ...result.state }),
    )
    expect(again.dropped).toEqual(NO_DROPS)
    expect(again.repaired).toEqual(NO_REPAIRS)
    expect(again.state).toEqual(result.state)
  })

  it("filters stored days to integers 0–6 and dedupes them", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          { ...canonicalSupplement, days: [1, 7, 7, 2.5, "3", null, -1, 0, 6] },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired).toEqual({
      supplements: 1,
      doseLogs: 0,
      wellnessLogs: 0,
    })
    expect(result.state.supplements[0].days).toEqual([1, 0, 6])
  })

  it("dedupes stored days without reordering them", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [{ ...canonicalSupplement, days: [3, 1, 3] }],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired.supplements).toBe(1)
    expect(result.state.supplements[0].days).toEqual([3, 1])
  })

  it("replaces non-string text fields with their defaults", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          {
            ...canonicalSupplement,
            brand: 5,
            potency: null,
            dosage: ["2 capsules"],
            notes: 42,
            purchaseUrl: false,
          },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired.supplements).toBe(1)
    expect(result.state.supplements[0]).toEqual({
      ...canonicalSupplement,
      brand: "",
      potency: "",
      dosage: "",
      notes: undefined,
      purchaseUrl: undefined,
    })
  })

  it("replaces a non-boolean restock reminder with true", () => {
    for (const restockReminder of [null, 0, "yes", {}, []]) {
      const result = expectOk(
        migrateStoredAppState({
          schemaVersion: 1,
          supplements: [{ ...canonicalSupplement, restockReminder }],
          doseLogs: [],
          wellnessLogs: [],
        }),
      )

      expect(result.repaired.supplements).toBe(1)
      expect(result.state.supplements[0].restockReminder).toBe(true)
    }
  })

  it("keeps a stored false restock reminder as-is", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [{ ...canonicalSupplement, restockReminder: false }],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements[0].restockReminder).toBe(false)
  })

  it("coerces numeric-string counts and thresholds", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          { ...canonicalSupplement, totalCount: "60", currentCount: "44", restockThreshold: "15" },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired.supplements).toBe(1)
    expect(result.state.supplements[0]).toMatchObject({
      totalCount: 60,
      currentCount: 44,
      restockThreshold: 15,
    })
  })

  it("coerces numeric-string durations and cycle fields, counting the rewrite", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          {
            ...canonicalSupplement,
            durationDays: "14",
            cycleActiveDays: "21",
            cycleBreakDays: "7",
          },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired.supplements).toBe(1)
    expect(result.state.supplements[0]).toMatchObject({
      durationDays: 14,
      cycleActiveDays: 21,
      cycleBreakDays: 7,
    })
  })

  it("removes and counts non-positive, null, and non-numeric durations and cycle fields", () => {
    for (const stored of [0, -5, null, "banana"]) {
      const result = expectOk(
        migrateStoredAppState({
          schemaVersion: 1,
          supplements: [
            {
              ...canonicalSupplement,
              durationDays: stored,
              cycleActiveDays: stored,
              cycleBreakDays: stored,
            },
          ],
          doseLogs: [],
          wellnessLogs: [],
        }),
      )

      expect(result.repaired.supplements).toBe(1)
      expect(result.state.supplements[0].durationDays).toBeUndefined()
      expect(result.state.supplements[0].cycleActiveDays).toBeUndefined()
      expect(result.state.supplements[0].cycleBreakDays).toBeUndefined()
    }
  })

  it("keeps valid numeric durations and cycle fields without counting a repair", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          {
            ...canonicalSupplement,
            durationDays: 30,
            cycleActiveDays: 21,
            cycleBreakDays: 7,
          },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements[0]).toMatchObject({
      durationDays: 30,
      cycleActiveDays: 21,
      cycleBreakDays: 7,
    })
  })

  it("fills absent durations and cycle fields silently", () => {
    const minimalSupplement = {
      id: "minimal",
      name: "Minimal",
      form: "Tablet",
      startedOn: "2026-05-01",
      days: [],
      times: [],
    }

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [minimalSupplement],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped).toEqual(NO_DROPS)
    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements[0]).toMatchObject({
      durationDays: undefined,
      cycleActiveDays: undefined,
      cycleBreakDays: undefined,
    })
  })

  it("falls back to today's defaults for non-numeric counts and thresholds", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          {
            ...canonicalSupplement,
            totalCount: "many",
            currentCount: null,
            restockThreshold: Number.NaN,
          },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired.supplements).toBe(1)
    expect(result.state.supplements[0]).toMatchObject({
      totalCount: 0,
      currentCount: 0,
      restockThreshold: 10,
    })
  })

  it("falls back to defaults for non-finite count values", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          {
            ...canonicalSupplement,
            totalCount: Number.NaN,
            currentCount: Number.POSITIVE_INFINITY,
            restockThreshold: Number.NEGATIVE_INFINITY,
          },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired.supplements).toBe(1)
    expect(result.state.supplements[0]).toMatchObject({
      totalCount: 0,
      currentCount: 0,
      restockThreshold: 10,
    })
  })

  it("preserves finite negative counts and thresholds, counting no repair", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [
          { ...canonicalSupplement, totalCount: -5, currentCount: -3, restockThreshold: -1 },
        ],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements[0]).toMatchObject({
      totalCount: -5,
      currentCount: -3,
      restockThreshold: -1,
    })
  })

  it("fills absent text, count, and reminder values without counting repairs", () => {
    const minimalSupplement = {
      id: "minimal",
      name: "Minimal",
      form: "Tablet",
      startedOn: "2026-05-01",
      days: [],
      times: [],
    }

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [minimalSupplement],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped).toEqual(NO_DROPS)
    expect(result.repaired).toEqual(NO_REPAIRS)
    expect(result.state.supplements[0]).toEqual({
      id: "minimal",
      name: "Minimal",
      brand: "",
      potency: "",
      dosage: "",
      notes: undefined,
      purchaseUrl: undefined,
      form: "Tablet",
      startedOn: "2026-05-01",
      durationDays: undefined,
      cycleActiveDays: undefined,
      cycleBreakDays: undefined,
      days: [],
      times: [],
      totalCount: 0,
      currentCount: 0,
      restockReminder: true,
      restockThreshold: 10,
    })
  })

  it("counts one repair per record however many fields it repaired", () => {
    const messySupplement = {
      ...canonicalSupplement,
      id: "messy",
      days: [1, 7, 7],
      times: ["08:00 PM", "08:00 PM"],
      brand: 5,
      totalCount: "60",
      restockReminder: null,
    }

    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [canonicalSupplement, messySupplement],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired).toEqual({
      supplements: 1,
      doseLogs: 0,
      wellnessLogs: 0,
    })
    expect(result.state.supplements).toHaveLength(2)
    expect(result.state.supplements[1]).toMatchObject({
      id: "messy",
      days: [1],
      times: ["20:00"],
      brand: "",
      totalCount: 60,
      restockReminder: true,
    })
  })

  it("leaves nothing to repair after a repaired load is normalized again", () => {
    const raw = {
      schemaVersion: 1,
      supplements: [
        { ...canonicalSupplement, days: [1, 7, 7], brand: 5, totalCount: "60" },
      ],
      doseLogs: [{ ...canonicalDoseLog, time: "08:00 PM" }],
      wellnessLogs: [],
    }

    const first = expectOk(migrateStoredAppState(raw))
    expect(first.repaired).toEqual({
      supplements: 1,
      doseLogs: 1,
      wellnessLogs: 0,
    })

    const second = expectOk(migrateStoredAppState({ schemaVersion: 1, ...first.state }))
    expect(second.repaired).toEqual(NO_REPAIRS)
    expect(second.state).toEqual(first.state)
  })

  it("keeps the last valid wellness entry per date without counting superseded duplicates as drops", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [],
        doseLogs: [],
        wellnessLogs: [
          { date: "2026-05-01", energy: 5, focus: 5 },
          { date: "2026-05-02", energy: 6, focus: 6 },
          { date: "2026-05-01", energy: 8, focus: 9 },
        ],
      }),
    )

    expect(result.dropped.wellnessLogs).toBe(0)
    expect(result.repaired.wellnessLogs).toBe(1)
    expect(result.state.wellnessLogs).toEqual([
      { date: "2026-05-01", energy: 8, focus: 9 },
      { date: "2026-05-02", energy: 6, focus: 6 },
    ])
  })

  it("preserves recorded inventory amounts on taken logs only", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [canonicalSupplement],
        doseLogs: [
          {
            id: "with-amount",
            supplementId: "custom-magnesium",
            date: "2026-05-01",
            time: "20:00",
            status: "taken",
            inventoryAmount: 2,
          },
          {
            id: "bad-amount",
            supplementId: "custom-magnesium",
            date: "2026-05-02",
            time: "20:00",
            status: "taken",
            inventoryAmount: "two",
          },
          {
            id: "snoozed-with-amount",
            supplementId: "custom-magnesium",
            date: "2026-05-03",
            time: "20:00",
            status: "snoozed",
            inventoryAmount: 2,
          },
        ],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped.doseLogs).toBe(0)
    expect(result.repaired.doseLogs).toBe(2)
    expect(result.state.doseLogs[0].inventoryAmount).toBe(2)
    expect(result.state.doseLogs[1]).not.toHaveProperty("inventoryAmount")
    expect(result.state.doseLogs[2]).not.toHaveProperty("inventoryAmount")
  })

  it("counts a 12-hour dose-log time rewrite as a repair", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [],
        doseLogs: [{ ...canonicalDoseLog, time: "08:00 PM" }],
        wellnessLogs: [],
      }),
    )

    expect(result.repaired).toEqual({
      supplements: 0,
      doseLogs: 1,
      wellnessLogs: 0,
    })
    expect(result.state.doseLogs[0].time).toBe("20:00")
  })

  it("counts an inventory amount stripped from a log that may not carry one as a repair", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [],
        doseLogs: [
          { ...canonicalDoseLog, id: "kept", status: "taken", inventoryAmount: 2 },
          { ...canonicalDoseLog, id: "snoozed", status: "snoozed", inventoryAmount: 2 },
          { ...canonicalDoseLog, id: "string-amount", status: "taken", inventoryAmount: "2" },
          { ...canonicalDoseLog, id: "zero-amount", status: "taken", inventoryAmount: 0 },
        ],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped.doseLogs).toBe(0)
    expect(result.repaired.doseLogs).toBe(3)
    expect(result.state.doseLogs[0].inventoryAmount).toBe(2)
    for (const log of result.state.doseLogs.slice(1)) {
      expect(log).not.toHaveProperty("inventoryAmount")
    }
  })

  it("counts each wellness entry that supersedes a stored date as a repair", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [],
        doseLogs: [],
        wellnessLogs: [
          { date: "2026-05-01", energy: 5, focus: 5 },
          { date: "2026-05-01", energy: 6, focus: 6 },
          { date: "2026-05-01", energy: 8, focus: 9 },
        ],
      }),
    )

    expect(result.dropped.wellnessLogs).toBe(0)
    expect(result.repaired.wellnessLogs).toBe(2)
    expect(result.state.wellnessLogs).toEqual([
      { date: "2026-05-01", energy: 8, focus: 9 },
    ])
  })

  it("preserves an annotated historical sample supplement", () => {
    const result = expectOk(
      migrateStoredAppState({
        supplements: [historicalSample],
        intakeLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.dropped.supplements).toBe(0)
    expect(result.state.supplements).toEqual([canonicalHistoricalSample])
  })

  it("preserves an annotated historical sample stored under the current version", () => {
    const result = expectOk(
      migrateStoredAppState({
        schemaVersion: 1,
        supplements: [{ ...historicalSample, startedOn: "1970-01-01" }],
        doseLogs: [],
        wellnessLogs: [],
      }),
    )

    expect(result.migratedFrom).toBeNull()
    expect(result.dropped.supplements).toBe(0)
    expect(result.state.supplements).toEqual([canonicalHistoricalSample])
  })

  it("is idempotent for already-canonical state", () => {
    const canonicalState = {
      schemaVersion: 1,
      supplements: [canonicalSupplement],
      doseLogs: [
        {
          id: "log-1",
          supplementId: "custom-magnesium",
          date: "2026-05-01",
          time: "20:00",
          status: "taken",
          inventoryAmount: 2,
        },
      ],
      wellnessLogs: [{ date: "2026-05-01", energy: 7, focus: 8 }],
    }

    const once = expectOk(migrateStoredAppState(canonicalState))
    expect(once.migratedFrom).toBeNull()
    expect(once.dropped).toEqual(NO_DROPS)
    expect(once.repaired).toEqual(NO_REPAIRS)
    expect(once.state).toEqual({
      supplements: [canonicalSupplement],
      doseLogs: canonicalState.doseLogs,
      wellnessLogs: canonicalState.wellnessLogs,
    })

    const twice = expectOk(migrateStoredAppState(once.state))
    expect(twice.repaired).toEqual(NO_REPAIRS)
    expect(twice.state).toEqual(once.state)
  })

  it("migrates canonical data stripped of its version without changing it", () => {
    const canonicalState = {
      supplements: [canonicalSupplement],
      doseLogs: [canonicalDoseLog],
      wellnessLogs: [{ date: "2026-05-01", energy: 7, focus: 8 }],
    }

    const first = expectOk(migrateStoredAppState(canonicalState))
    expect(first.migratedFrom).toBe(0)
    expect(first.dropped).toEqual(NO_DROPS)
    expect(first.state).toEqual(canonicalState)

    const second = expectOk(migrateStoredAppState({ schemaVersion: 1, ...first.state }))
    expect(second.migratedFrom).toBeNull()
    expect(second.state).toEqual(first.state)
  })
})

describe("dropped-record helpers", () => {
  it("totals drops across every collection", () => {
    expect(totalDroppedRecords(NO_DROPS)).toBe(0)
    expect(
      totalDroppedRecords({ supplements: 1, doseLogs: 2, wellnessLogs: 3 }),
    ).toBe(6)
  })

  it("detects whether any collection dropped a record", () => {
    expect(hasDroppedRecords(NO_DROPS)).toBe(false)
    expect(
      hasDroppedRecords({ supplements: 0, doseLogs: 1, wellnessLogs: 0 }),
    ).toBe(true)
  })
})

describe("repaired-record helpers", () => {
  it("totals repairs across every collection", () => {
    expect(totalRepairedRecords(NO_REPAIRS)).toBe(0)
    expect(
      totalRepairedRecords({ supplements: 1, doseLogs: 2, wellnessLogs: 3 }),
    ).toBe(6)
  })

  it("detects whether any collection repaired a record", () => {
    expect(hasRepairedRecords(NO_REPAIRS)).toBe(false)
    expect(
      hasRepairedRecords({ supplements: 0, doseLogs: 1, wellnessLogs: 0 }),
    ).toBe(true)
  })
})

describe("detectSchemaVersion", () => {
  it("treats a missing version as version 0", () => {
    expect(detectSchemaVersion({ supplements: [] })).toEqual({
      status: "ok",
      version: 0,
    })
  })

  it("returns any finite numeric stored version as-is", () => {
    for (const version of [0, 1, 42, 2.5, -1]) {
      expect(detectSchemaVersion({ schemaVersion: version })).toEqual({
        status: "ok",
        version,
      })
    }
  })

  it("treats a non-numeric or non-finite version as version 0", () => {
    for (const schemaVersion of [
      "1",
      null,
      undefined,
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(detectSchemaVersion({ schemaVersion })).toEqual({
        status: "ok",
        version: 0,
      })
    }
  })

  it("reports a structurally invalid payload as corrupt", () => {
    for (const raw of [null, undefined, [], "state", 42]) {
      expect(detectSchemaVersion(raw)).toEqual({ status: "corrupt" })
    }
  })
})
