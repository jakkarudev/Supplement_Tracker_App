import { readFileSync } from "node:fs"
import { describe, expect, expectTypeOf, it } from "vitest"
import type { AppState } from "./app-state"
import type { AppState as ProviderAppState } from "./app-context"
import type { DoseLog, Supplement, WellnessLog } from "./supplements-data"
import { migrateStoredAppState } from "./storage-migration"

describe("AppState", () => {
  it("describes the three persisted collections", () => {
    expectTypeOf<AppState>().toEqualTypeOf<{
      supplements: Supplement[]
      doseLogs: DoseLog[]
      wellnessLogs: WellnessLog[]
    }>()
  })

  it("is re-exported unchanged from the provider module", () => {
    expectTypeOf<ProviderAppState>().toEqualTypeOf<AppState>()
  })

  it("is the shape storage migration returns", () => {
    const result = migrateStoredAppState({
      schemaVersion: 1,
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return

    const state: AppState = result.state

    expect(state).toEqual({
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
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
