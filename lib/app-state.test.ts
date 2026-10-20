import { readFileSync } from "node:fs"
import { describe, expect, expectTypeOf, it } from "vitest"
import type { AppState, Settings } from "./app-state"
import type { AppState as ProviderAppState } from "./app-context"
import type { TimeFormat } from "./day-regimen"
import type { DoseLog, SpacingRule, Supplement, WellnessLog } from "./supplements-data"
import { migrateStoredAppState } from "./storage-migration"

describe("AppState", () => {
  it("describes the persisted collections and the display settings", () => {
    expectTypeOf<AppState>().toEqualTypeOf<{
      supplements: Supplement[]
      doseLogs: DoseLog[]
      wellnessLogs: WellnessLog[]
      spacingRules: SpacingRule[]
      settings: Settings
    }>()
  })

  it("describes the settings as a time format", () => {
    expectTypeOf<Settings>().toEqualTypeOf<{
      timeFormat: TimeFormat
    }>()
  })

  it("is re-exported unchanged from the provider module", () => {
    expectTypeOf<ProviderAppState>().toEqualTypeOf<AppState>()
  })

  it("is the shape storage migration returns", () => {
    const result = migrateStoredAppState({
      schemaVersion: 4,
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
      spacingRules: [],
      settings: { timeFormat: "12h" },
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return

    const state: AppState = result.state

    expect(state).toEqual({
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
      spacingRules: [],
      settings: { timeFormat: "12h" },
    })
  })
})

describe("storage modules", () => {
  it("do not import the app provider", () => {
    // Every module of the persistence seam: the state shape and the two
    // storage modules. Listed explicitly so a module that is not covered by
    // the naming pattern cannot slip past this guard.
    const storageModules = [
      "app-state.ts",
      "app-storage.ts",
      "storage-migration.ts",
    ]

    const providerImport =
      /from\s+["'][^"']*app-context["']|import\(\s*["'][^"']*app-context["']\s*\)/

    for (const name of storageModules) {
      const source = readFileSync(new URL(name, import.meta.url), "utf8")
      expect(source, `${name} must not import the app provider`).not.toMatch(
        providerImport,
      )
    }
  })
})
