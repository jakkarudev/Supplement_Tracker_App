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
      supplements: [
        {
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
        },
      ],
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
})

