import { describe, expect, it } from "vitest"
import type { DoseLog, Supplement } from "./supplements-data"
import {
  addSupplement,
  deleteSupplement,
  logDose,
  updateSupplement,
  type RegimenState,
} from "./regimen-actions"

const DATE = "2026-05-04"
const TIME = "08:00"

function makeSupplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: "magnesium",
    name: "Magnesium Glycinate",
    brand: "Pure Encapsulations",
    potency: "120 mg",
    dosage: "2 capsules",
    form: "Capsule",
    startedOn: "2026-05-01",
    days: [0, 1, 2, 3, 4, 5, 6],
    times: [TIME],
    totalCount: 90,
    currentCount: 10,
    restockReminder: true,
    restockThreshold: 15,
    ...overrides,
  }
}

function makeState(overrides: Partial<RegimenState> = {}): RegimenState {
  return { supplements: [makeSupplement()], doseLogs: [], ...overrides }
}

function takenLog(overrides: Partial<DoseLog> = {}): DoseLog {
  return {
    id: "log-1",
    supplementId: "magnesium",
    date: DATE,
    time: TIME,
    status: "taken",
    ...overrides,
  }
}

function logInput(status: DoseLog["status"]) {
  return { supplementId: "magnesium", date: DATE, time: TIME, status }
}

describe("supplement writes", () => {
  it("appends a supplement without touching dose logs", () => {
    const existing = takenLog()
    const next = addSupplement(makeState({ doseLogs: [existing] }), makeSupplement({ id: "new" }))

    expect(next.supplements.map((s) => s.id)).toEqual(["magnesium", "new"])
    expect(next.doseLogs).toEqual([existing])
  })

  it("replaces a supplement and keeps its dose logs, including orphaned ones", () => {
    const orphan = takenLog({ id: "orphan", time: "09:00" })
    const next = updateSupplement(
      makeState({ doseLogs: [orphan] }),
      makeSupplement({ dosage: "1 capsule", times: ["21:00"] }),
    )

    expect(next.supplements[0]).toMatchObject({ dosage: "1 capsule", times: ["21:00"] })
    expect(next.doseLogs).toEqual([orphan])
  })

  it("removes a supplement with its dose history and nothing else", () => {
    const mine = takenLog()
    const other = takenLog({ id: "log-2", supplementId: "omega-3" })
    const next = deleteSupplement(
      makeState({
        supplements: [makeSupplement(), makeSupplement({ id: "omega-3" })],
        doseLogs: [mine, other],
      }),
      "magnesium",
    )

    expect(next.supplements.map((s) => s.id)).toEqual(["omega-3"])
    expect(next.doseLogs).toEqual([other])
  })
})

describe("logDose", () => {
  it("records a taken dose and consumes the dosage amount", () => {
    const next = logDose(makeState(), logInput("taken"))

    expect(next.supplements[0].currentCount).toBe(8)
    expect(next.doseLogs).toMatchObject([
      { supplementId: "magnesium", date: DATE, time: TIME, status: "taken", inventoryAmount: 2 },
    ])
  })

  it("does not consume inventory twice when taken repeats", () => {
    const once = logDose(makeState(), logInput("taken"))
    const twice = logDose(once, logInput("taken"))

    expect(twice.supplements[0].currentCount).toBe(8)
    expect(twice.doseLogs).toHaveLength(1)
    expect(twice.doseLogs[0].id).toBe(once.doseLogs[0].id)
  })

  it("restores inventory when a taken dose is snoozed", () => {
    const taken = logDose(makeState(), logInput("taken"))
    const snoozed = logDose(taken, logInput("snoozed"))

    expect(snoozed.supplements[0].currentCount).toBe(10)
    expect(snoozed.doseLogs).toHaveLength(1)
    expect(snoozed.doseLogs[0]).toMatchObject({ status: "snoozed" })
    expect(snoozed.doseLogs[0]).not.toHaveProperty("inventoryAmount")
  })

  it("restores inventory and removes the log when a taken dose is undone", () => {
    const taken = logDose(makeState(), logInput("taken"))
    const undone = logDose(taken, logInput("pending"))

    expect(undone.supplements[0].currentCount).toBe(10)
    expect(undone.doseLogs).toEqual([])
  })

  it("consumes inventory once when a snoozed dose is confirmed", () => {
    const snoozed = makeState({ doseLogs: [takenLog({ status: "snoozed" })] })

    const next = logDose(snoozed, logInput("taken"))

    expect(next.supplements[0].currentCount).toBe(8)
    expect(next.doseLogs).toHaveLength(1)
    expect(next.doseLogs[0]).toMatchObject({ id: "log-1", status: "taken", inventoryAmount: 2 })
  })

  it("keeps a single log when snoozed repeats", () => {
    const snoozed = makeState({ doseLogs: [takenLog({ status: "snoozed" })] })

    const next = logDose(snoozed, logInput("snoozed"))

    expect(next.supplements[0].currentCount).toBe(10)
    expect(next.doseLogs).toHaveLength(1)
  })

  it("does nothing when pending is set with no log to remove", () => {
    const state = makeState()
    const next = logDose(state, logInput("pending"))

    expect(next).toEqual(state)
  })

  it("consumes fractional dosage amounts", () => {
    const state = makeState({ supplements: [makeSupplement({ dosage: "1/2 capsule" })] })

    const next = logDose(state, logInput("taken"))

    expect(next.supplements[0].currentCount).toBe(9.5)
    expect(next.doseLogs[0].inventoryAmount).toBe(0.5)
  })

  it("restores the amount recorded when taken, not the current dosage", () => {
    const taken = logDose(makeState(), logInput("taken"))
    const edited = updateSupplement(taken, makeSupplement({ dosage: "1 capsule", currentCount: 8 }))

    const snoozed = logDose(edited, logInput("snoozed"))

    expect(snoozed.supplements[0].currentCount).toBe(10)

    const retaken = logDose(snoozed, logInput("taken"))

    expect(retaken.supplements[0].currentCount).toBe(9)
    expect(retaken.doseLogs[0].inventoryAmount).toBe(1)
  })

  it("falls back to the current dosage for legacy logs without a recorded amount", () => {
    const legacy = makeState({
      supplements: [makeSupplement({ currentCount: 8 })],
      doseLogs: [takenLog()],
    })

    const next = logDose(legacy, logInput("snoozed"))

    expect(next.supplements[0].currentCount).toBe(10)
  })

  it("lets inventory go negative instead of clamping", () => {
    const state = makeState({ supplements: [makeSupplement({ currentCount: 1 })] })

    const taken = logDose(state, logInput("taken"))
    expect(taken.supplements[0].currentCount).toBe(-1)

    const undone = logDose(taken, logInput("pending"))
    expect(undone.supplements[0].currentCount).toBe(1)
  })

  it("records a log for an unknown supplement without moving inventory", () => {
    const next = logDose(makeState({ supplements: [] }), logInput("taken"))

    expect(next.supplements).toEqual([])
    expect(next.doseLogs).toHaveLength(1)
    expect(next.doseLogs[0]).toMatchObject({ status: "taken" })
    expect(next.doseLogs[0]).not.toHaveProperty("inventoryAmount")
  })

  it("moves inventory for the logging supplement only", () => {
    const state = makeState({
      supplements: [makeSupplement(), makeSupplement({ id: "omega-3" })],
    })

    const next = logDose(state, logInput("taken"))

    expect(next.supplements.map((s) => s.currentCount)).toEqual([8, 10])
  })
})
