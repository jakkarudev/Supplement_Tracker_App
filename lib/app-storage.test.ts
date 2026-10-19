import { describe, expect, it } from "vitest"
import type { AppState } from "./app-state"
import {
  STORAGE_KEY,
  createAppStorage,
  type LoadStateResult,
  type StorageAdapter,
} from "./app-storage"

const canonicalState: AppState = {
  supplements: [
    {
      id: "custom-magnesium",
      name: "Magnesium",
      brand: "My brand",
      potency: "120 mg",
      dosage: "2 capsules",
      form: "Capsule",
      startedOn: "2026-05-01",
      days: [1, 2, 3],
      times: ["20:00"],
      totalCount: 90,
      currentCount: 44,
      restockReminder: true,
      restockThreshold: 15,
    },
  ],
  doseLogs: [
    {
      id: "log-1",
      supplementId: "custom-magnesium",
      date: "2026-05-01",
      time: "08:00",
      status: "taken",
    },
  ],
  wellnessLogs: [{ date: "2026-05-01", energy: 7, focus: 8 }],
}

type MemoryAdapter = StorageAdapter & {
  stored: () => string | null
  store: (value: string | null) => void
}

function createMemoryAdapter(
  options: { initial?: string; getError?: unknown; setError?: unknown } = {},
): MemoryAdapter {
  let stored = options.initial ?? null

  return {
    getItem(key) {
      if (options.getError !== undefined) throw options.getError
      return key === STORAGE_KEY ? stored : null
    },
    setItem(key, value) {
      if (options.setError !== undefined) throw options.setError
      if (key === STORAGE_KEY) stored = value
    },
    stored: () => stored,
    store: (value) => {
      stored = value
    },
  }
}

function expectOk(result: LoadStateResult) {
  expect(result.status).toBe("ok")
  if (result.status !== "ok") throw new Error("expected an ok load result")
  return result
}

describe("createAppStorage", () => {
  describe("loadState", () => {
    it("returns empty without writing when nothing is stored", () => {
      const adapter = createMemoryAdapter()
      const storage = createAppStorage(adapter)

      expect(storage.loadState()).toEqual({ status: "empty" })
      expect(adapter.stored()).toBeNull()
    })

    it("loads canonical data as ok without reporting a migration", () => {
      const raw = JSON.stringify({ schemaVersion: 1, ...canonicalState })
      const adapter = createMemoryAdapter({ initial: raw })
      const storage = createAppStorage(adapter)

      expect(storage.loadState()).toEqual({
        status: "ok",
        state: canonicalState,
        migratedFrom: null,
      })
      expect(adapter.stored()).toBe(raw)
    })

    it("migrates a legacy payload and reports the version it came from", () => {
      const adapter = createMemoryAdapter({
        initial: JSON.stringify({
          supplements: [
            {
              ...canonicalState.supplements[0],
              startedOn: undefined,
              times: ["08:00 PM"],
            },
          ],
          intakeLogs: [
            {
              id: "log-1",
              supplementId: "custom-magnesium",
              date: "2026-05-01",
              time: "08:00 AM",
              period: "Morning",
              status: "taken",
            },
          ],
          wellnessLogs: canonicalState.wellnessLogs,
        }),
      })
      const storage = createAppStorage(adapter)

      expect(storage.loadState()).toEqual({
        status: "ok",
        state: {
          supplements: [
            {
              ...canonicalState.supplements[0],
              startedOn: "1970-01-01",
              times: ["20:00"],
            },
          ],
          doseLogs: canonicalState.doseLogs,
          wellnessLogs: canonicalState.wellnessLogs,
        },
        migratedFrom: 0,
      })
    })

    it("migrates a payload stripped of its version idempotently", () => {
      const adapter = createMemoryAdapter()
      const storage = createAppStorage(adapter)

      expect(storage.saveState(canonicalState)).toEqual({ status: "saved" })
      const stripped = JSON.parse(adapter.stored() ?? "")
      delete stripped.schemaVersion
      adapter.store(JSON.stringify(stripped))

      const first = expectOk(storage.loadState())
      expect(first.migratedFrom).toBe(0)
      expect(first.state).toEqual(canonicalState)

      expect(storage.saveState(first.state)).toEqual({ status: "saved" })
      const second = expectOk(storage.loadState())
      expect(second.migratedFrom).toBeNull()
      expect(second.state).toEqual(canonicalState)
    })
  })

  describe("failed loads", () => {
    it("fails an unparseable payload and never writes over it", () => {
      const raw = "{ not json"
      const adapter = createMemoryAdapter({ initial: raw })
      const storage = createAppStorage(adapter)

      const load = storage.loadState()
      expect(load.status).toBe("failed")
      if (load.status !== "failed") throw new Error("expected a failed load")
      expect(load.error).toBeInstanceOf(SyntaxError)
      expect(adapter.stored()).toBe(raw)

      expect(storage.saveState(canonicalState).status).toBe("failed")
      expect(adapter.stored()).toBe(raw)
    })

    it("fails a payload whose top-level shape is invalid and never writes over it", () => {
      for (const raw of ["42", '"state"', "[]", "null"]) {
        const adapter = createMemoryAdapter({ initial: raw })
        const storage = createAppStorage(adapter)

        expect(storage.loadState().status).toBe("failed")
        expect(adapter.stored()).toBe(raw)

        expect(storage.saveState(canonicalState).status).toBe("failed")
        expect(adapter.stored()).toBe(raw)
      }
    })

    it("returns incompatible with the stored version and never writes over it", () => {
      for (const version of [2, 99]) {
        const raw = JSON.stringify({ schemaVersion: version, ...canonicalState })
        const adapter = createMemoryAdapter({ initial: raw })
        const storage = createAppStorage(adapter)

        expect(storage.loadState()).toEqual({ status: "incompatible", version })
        expect(adapter.stored()).toBe(raw)

        expect(storage.saveState(canonicalState).status).toBe("failed")
        expect(adapter.stored()).toBe(raw)
      }
    })

    it("reports a failed load instead of throwing when the adapter cannot read", () => {
      const error = new Error("storage is not available")
      const adapter = createMemoryAdapter({ getError: error })
      const storage = createAppStorage(adapter)

      expect(storage.loadState()).toEqual({ status: "failed", error })
    })
  })

  describe("saveState", () => {
    it("writes the flat payload with the current schema version", () => {
      const adapter = createMemoryAdapter()
      const storage = createAppStorage(adapter)

      expect(storage.saveState(canonicalState)).toEqual({ status: "saved" })

      const payload = JSON.parse(adapter.stored() ?? "")
      expect(Object.keys(payload)).toEqual([
        "schemaVersion",
        "supplements",
        "doseLogs",
        "wellnessLogs",
      ])
      expect(payload).toEqual({ schemaVersion: 1, ...canonicalState })
    })

    it("classifies save failures by reason and carries the error", () => {
      const cases: Array<[unknown, "quota" | "unavailable" | "unknown"]> = [
        [
          new DOMException("The quota has been exceeded.", "QuotaExceededError"),
          "quota",
        ],
        [new DOMException("Storage is blocked.", "SecurityError"), "unavailable"],
        [new Error("boom"), "unknown"],
      ]

      for (const [error, reason] of cases) {
        const adapter = createMemoryAdapter({ setError: error })
        const storage = createAppStorage(adapter)

        expect(storage.saveState(canonicalState)).toEqual({
          status: "failed",
          reason,
          error,
        })
      }
    })
  })
})
