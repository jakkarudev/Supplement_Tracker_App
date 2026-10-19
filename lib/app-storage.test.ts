import { describe, expect, expectTypeOf, it } from "vitest"
import type { AppState } from "./app-state"
import {
  BACKUP_KEY_PREFIX,
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
  stored: (key?: string) => string | null
  store: (value: string | null, key?: string) => void
  keys: () => string[]
  setAttempts: string[]
  removeAttempts: string[]
}

function createMemoryAdapter(
  options: {
    initial?: string
    getError?: unknown
    setError?: unknown
    removeError?: unknown
  } = {},
): MemoryAdapter {
  const values = new Map<string, string>()
  if (options.initial !== undefined) values.set(STORAGE_KEY, options.initial)
  const setAttempts: string[] = []
  const removeAttempts: string[] = []

  return {
    getItem(key) {
      if (options.getError !== undefined) throw options.getError
      return values.get(key) ?? null
    },
    setItem(key, value) {
      setAttempts.push(key)
      if (options.setError !== undefined) throw options.setError
      values.set(key, value)
    },
    removeItem(key) {
      removeAttempts.push(key)
      if (options.removeError !== undefined) throw options.removeError
      values.delete(key)
    },
    keys: () => [...values.keys()],
    stored: (key = STORAGE_KEY) => values.get(key) ?? null,
    store: (value, key = STORAGE_KEY) => {
      if (value === null) values.delete(key)
      else values.set(key, value)
    },
    setAttempts,
    removeAttempts,
  }
}

const EMPTY_STATE: AppState = {
  supplements: [],
  doseLogs: [],
  wellnessLogs: [],
}

const NO_DROPS = { supplements: 0, doseLogs: 0, wellnessLogs: 0 }

const BACKUP_KEY_PATTERN = /^regimen-v1\.corrupt\.\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

function expectOk(result: LoadStateResult) {
  expect(result.status).toBe("ok")
  if (result.status !== "ok") throw new Error("expected an ok load result")
  return result
}

function expectRecovered(result: LoadStateResult) {
  expect(result.status).toBe("recovered")
  if (result.status !== "recovered") {
    throw new Error("expected a recovered load result")
  }
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

    it("treats an empty string as empty without a backup", () => {
      const adapter = createMemoryAdapter({ initial: "" })
      const storage = createAppStorage(adapter)

      expect(storage.loadState()).toEqual({ status: "empty" })
      expect(adapter.setAttempts).toEqual([])
      expect(adapter.stored()).toBe("")
    })

    it("treats whitespace-only content as non-empty and recovers it with a backup", () => {
      const raw = "   "
      const adapter = createMemoryAdapter({ initial: raw })
      const storage = createAppStorage(adapter)

      const load = expectRecovered(storage.loadState())
      expect(load.state).toEqual(EMPTY_STATE)
      expect(load.dropped).toEqual(NO_DROPS)
      expect(adapter.stored(load.backupKey)).toBe(raw)
      expect(adapter.stored()).toBe(raw)
      expect(adapter.setAttempts).toEqual([load.backupKey])
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

  describe("recovery", () => {
    it("recovers an unparseable payload with a verbatim backup and salvaged empty state", () => {
      const raw = "{ not json"
      const adapter = createMemoryAdapter({ initial: raw })
      const storage = createAppStorage(adapter)

      const load = expectRecovered(storage.loadState())
      expect(load.state).toEqual(EMPTY_STATE)
      expect(load.dropped).toEqual(NO_DROPS)
      expect(load.backupKey).toMatch(BACKUP_KEY_PATTERN)
      expect(adapter.stored(load.backupKey)).toBe(raw)
      expect(adapter.stored()).toBe(raw)
      expect(adapter.setAttempts).toEqual([load.backupKey])
    })

    it("recovers dropped records with per-collection counts and a backup", () => {
      const raw = JSON.stringify({
        schemaVersion: 1,
        supplements: [
          canonicalState.supplements[0],
          { name: "missing id and form" },
          "not a supplement",
        ],
        doseLogs: [
          canonicalState.doseLogs[0],
          { id: "bad-date", supplementId: "custom-magnesium", date: "nope" },
        ],
        wellnessLogs: [
          canonicalState.wellnessLogs[0],
          { date: "2026-02-30", energy: 7, focus: 8 },
          { date: "2026-05-02", energy: 0, focus: 8 },
        ],
      })
      const adapter = createMemoryAdapter({ initial: raw })
      const storage = createAppStorage(adapter)

      const load = expectRecovered(storage.loadState())
      expect(load.state).toEqual(canonicalState)
      expect(load.dropped).toEqual({
        supplements: 2,
        doseLogs: 1,
        wellnessLogs: 2,
      })
      expect(adapter.stored(load.backupKey)).toBe(raw)
      expect(adapter.setAttempts).toEqual([load.backupKey])

      expect(storage.saveState(load.state)).toEqual({ status: "saved" })
      expect(JSON.parse(adapter.stored() ?? "")).toEqual({
        schemaVersion: 1,
        ...canonicalState,
      })
    })

    it("prunes recovery backups to the three newest", () => {
      const adapter = createMemoryAdapter({ initial: "{ not json" })
      const oldBackups = [
        "regimen-v1.corrupt.2000-01-01T00:00:00.000Z",
        "regimen-v1.corrupt.2001-01-01T00:00:00.000Z",
        "regimen-v1.corrupt.2002-01-01T00:00:00.000Z",
        "regimen-v1.corrupt.2003-01-01T00:00:00.000Z",
      ]
      for (const key of oldBackups) adapter.store("old payload", key)

      const load = expectRecovered(createAppStorage(adapter).loadState())

      expect(
        adapter.keys().filter((key) => key.startsWith("regimen-v1.corrupt.")).sort(),
      ).toEqual([
        "regimen-v1.corrupt.2002-01-01T00:00:00.000Z",
        "regimen-v1.corrupt.2003-01-01T00:00:00.000Z",
        load.backupKey,
      ])
      expect(adapter.removeAttempts).toEqual([
        "regimen-v1.corrupt.2000-01-01T00:00:00.000Z",
        "regimen-v1.corrupt.2001-01-01T00:00:00.000Z",
      ])
    })

    it("reports unavailable and never writes when the backup cannot be written", () => {
      const backupError = new Error("backup write failed")
      const payloads = [
        "{ not json",
        JSON.stringify({
          schemaVersion: 1,
          supplements: [canonicalState.supplements[0], "not a supplement"],
          doseLogs: [],
          wellnessLogs: [],
        }),
      ]

      for (const raw of payloads) {
        const adapter = createMemoryAdapter({ initial: raw, setError: backupError })
        const storage = createAppStorage(adapter)

        const load = storage.loadState()
        expect(load).toEqual({ status: "unavailable", error: backupError })
        expect(adapter.stored()).toBe(raw)
        expect(adapter.setAttempts).toEqual([
          expect.stringMatching(BACKUP_KEY_PATTERN),
        ])

        // A failed backup disables writes: the load must not be followed by one.
        expect(storage.saveState(canonicalState).status).toBe("failed")
        expect(adapter.setAttempts).toHaveLength(1)
        expect(adapter.stored()).toBe(raw)
      }
    })

    it("writes salvaged state back in the current format after recovery", () => {
      const raw = "{ not json"
      const adapter = createMemoryAdapter({ initial: raw })
      const storage = createAppStorage(adapter)

      const load = expectRecovered(storage.loadState())
      expect(storage.saveState(load.state)).toEqual({ status: "saved" })

      expect(JSON.parse(adapter.stored() ?? "")).toEqual({
        schemaVersion: 1,
        ...EMPTY_STATE,
      })
    })

    it("recovers a payload whose top-level shape is invalid with a backup", () => {
      for (const raw of ["42", '"state"', "[]", "null"]) {
        const adapter = createMemoryAdapter({ initial: raw })
        const storage = createAppStorage(adapter)

        const load = expectRecovered(storage.loadState())
        expect(load.state).toEqual(EMPTY_STATE)
        expect(load.dropped).toEqual(NO_DROPS)
        expect(adapter.stored(load.backupKey)).toBe(raw)
        expect(adapter.stored()).toBe(raw)
        expect(adapter.setAttempts).toEqual([load.backupKey])
      }
    })

    it("recovers a payload whose collection is present but not an array", () => {
      const cases: Array<{ raw: string; state: AppState }> = [
        {
          raw: JSON.stringify({ schemaVersion: 1, supplements: "x" }),
          state: EMPTY_STATE,
        },
        {
          raw: JSON.stringify({
            doseLogs: null,
            wellnessLogs: canonicalState.wellnessLogs,
          }),
          state: { ...EMPTY_STATE, wellnessLogs: canonicalState.wellnessLogs },
        },
        {
          raw: JSON.stringify({
            schemaVersion: 1,
            supplements: "not an array",
            doseLogs: canonicalState.doseLogs,
            wellnessLogs: canonicalState.wellnessLogs,
          }),
          state: {
            supplements: [],
            doseLogs: canonicalState.doseLogs,
            wellnessLogs: canonicalState.wellnessLogs,
          },
        },
      ]

      for (const { raw, state } of cases) {
        const adapter = createMemoryAdapter({ initial: raw })
        const storage = createAppStorage(adapter)

        const load = expectRecovered(storage.loadState())
        expect(load.state).toEqual(state)
        expect(load.dropped).toEqual(NO_DROPS)
        expect(adapter.stored(load.backupKey)).toBe(raw)
        expect(adapter.stored()).toBe(raw)
        expect(adapter.setAttempts).toEqual([load.backupKey])
      }
    })
  })

  describe("guarded loads", () => {
    it("returns incompatible with a newer stored version, takes no backup, and never writes", () => {
      for (const version of [2, 99, 2.5]) {
        const raw = JSON.stringify({ schemaVersion: version, ...canonicalState })
        const adapter = createMemoryAdapter({ initial: raw })
        const storage = createAppStorage(adapter)

        expect(storage.loadState()).toEqual({ status: "incompatible", version })
        expect(adapter.stored()).toBe(raw)
        expect(adapter.setAttempts).toEqual([])
        expect(
          adapter.keys().filter((key) => key.startsWith(BACKUP_KEY_PREFIX)),
        ).toEqual([])

        expect(storage.saveState(canonicalState).status).toBe("failed")
        expect(adapter.stored()).toBe(raw)
      }
    })

    it("reports unavailable with the error when the adapter cannot read, and never writes", () => {
      const error = new DOMException("Storage is blocked.", "SecurityError")
      const adapter = createMemoryAdapter({ getError: error })
      const storage = createAppStorage(adapter)

      expect(storage.loadState()).toEqual({ status: "unavailable", error })
      expect(adapter.stored()).toBeNull()

      const save = storage.saveState(canonicalState)
      expect(save.status).toBe("failed")
      if (save.status !== "failed") throw new Error("expected a failed save")
      expect(save.reason).toBe("unavailable")
      expect(adapter.stored()).toBeNull()
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

describe("LoadStateResult", () => {
  it("has exactly the documented variants", () => {
    expectTypeOf<LoadStateResult["status"]>().toEqualTypeOf<
      "ok" | "empty" | "recovered" | "incompatible" | "unavailable"
    >()
  })
})
