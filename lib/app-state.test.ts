import { readdirSync, readFileSync } from "node:fs"
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
    const state: AppState = migrateStoredAppState(null)

    expect(state).toEqual({
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
    })
  })
})

describe("storage modules", () => {
  it("do not import the app provider", () => {
    const storageFiles = readdirSync(new URL(".", import.meta.url)).filter(
      (name) => /^storage-.*\.ts$/.test(name) && !name.endsWith(".test.ts"),
    )

    expect(storageFiles.length).toBeGreaterThan(0)

    const providerImport =
      /from\s+["'][^"']*app-context["']|import\(\s*["'][^"']*app-context["']\s*\)/

    for (const name of storageFiles) {
      const source = readFileSync(new URL(name, import.meta.url), "utf8")
      expect(source, `${name} must not import the app provider`).not.toMatch(
        providerImport,
      )
    }
  })
})
