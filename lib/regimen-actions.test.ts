import { describe, expect, it } from "vitest"
import type { DoseLog, SpacingRule, Supplement } from "./supplements-data"
import {
  addSpacingRule,
  addSupplement,
  deleteSpacingRule,
  deleteSupplement,
  logDose,
  updateSpacingRule,
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
  return { supplements: [makeSupplement()], doseLogs: [], spacingRules: [], ...overrides }
}

const RULE: SpacingRule = {
  id: "rule-1",
  supplementAId: "magnesium",
  supplementBId: "omega-3",
  minimumIntervalMinutes: 240,
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

function logInput(status: DoseLog["status"], takenAt?: string) {
  return { supplementId: "magnesium", date: DATE, time: TIME, status, takenAt }
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

describe("spacing rule writes", () => {
  it("appends a spacing rule without touching anything else", () => {
    const state = makeState({
      supplements: [makeSupplement(), makeSupplement({ id: "omega-3" })],
      doseLogs: [takenLog()],
    })

    const next = addSpacingRule(state, RULE)

    expect(next.spacingRules).toEqual([RULE])
    expect(next.supplements).toEqual(state.supplements)
    expect(next.doseLogs).toEqual(state.doseLogs)
  })

  it("replaces a spacing rule by id", () => {
    const state = makeState({ spacingRules: [RULE] })

    const next = updateSpacingRule(state, { ...RULE, minimumIntervalMinutes: 360 })

    expect(next.spacingRules).toEqual([{ ...RULE, minimumIntervalMinutes: 360 }])
  })

  it("leaves the other rules alone when one is replaced", () => {
    const other: SpacingRule = {
      id: "rule-2",
      supplementAId: "magnesium",
      supplementBId: "zinc",
      minimumIntervalMinutes: 120,
    }
    const state = makeState({ spacingRules: [RULE, other] })

    const next = updateSpacingRule(state, { ...RULE, minimumIntervalMinutes: 360 })

    expect(next.spacingRules).toEqual([{ ...RULE, minimumIntervalMinutes: 360 }, other])
  })

  it("removes a spacing rule by id", () => {
    const other: SpacingRule = {
      id: "rule-2",
      supplementAId: "magnesium",
      supplementBId: "zinc",
      minimumIntervalMinutes: 120,
    }
    const state = makeState({ spacingRules: [RULE, other] })

    const next = deleteSpacingRule(state, "rule-1")

    expect(next.spacingRules).toEqual([other])
  })

  it("removes the rules that involve a deleted supplement", () => {
    const other: SpacingRule = {
      id: "rule-2",
      supplementAId: "omega-3",
      supplementBId: "zinc",
      minimumIntervalMinutes: 120,
    }
    const state = makeState({
      supplements: [makeSupplement(), makeSupplement({ id: "omega-3" })],
      spacingRules: [RULE, other],
    })

    const next = deleteSupplement(state, "magnesium")

    expect(next.spacingRules).toEqual([other])
  })
})

describe("logDose", () => {
  it("owns only the supplements and the dose logs", () => {
    const next = logDose(makeState({ spacingRules: [RULE] }), logInput("taken"))

    expect(Object.keys(next).sort()).toEqual(["doseLogs", "supplements"])
  })

  it("records a taken dose and consumes the dosage amount", () => {
    const next = logDose(makeState(), logInput("taken"))

    expect(next.supplements[0].currentCount).toBe(8)
    expect(next.doseLogs).toMatchObject([
      { supplementId: "magnesium", date: DATE, time: TIME, status: "taken", inventoryAmount: 2 },
    ])
  })

  it("records the actual intake time when a dose is taken", () => {
    const next = logDose(makeState(), logInput("taken", "10:12"))

    expect(next.doseLogs[0]).toMatchObject({ status: "taken", takenAt: "10:12" })
  })

  it("stores the actual intake time in canonical 24-hour form", () => {
    const next = logDose(makeState(), logInput("taken", "10:12 AM"))

    expect(next.doseLogs[0].takenAt).toBe("10:12")
  })

  it("does not consume inventory twice when taken repeats", () => {
    const once = logDose(makeState(), logInput("taken", "10:12"))
    const twice = logDose(once, logInput("taken"))

    expect(twice.supplements[0].currentCount).toBe(8)
    expect(twice.doseLogs).toHaveLength(1)
    expect(twice.doseLogs[0].id).toBe(once.doseLogs[0].id)
  })

  it("preserves the actual time when a taken dose is re-logged without one", () => {
    const once = logDose(makeState(), logInput("taken", "10:12"))
    const twice = logDose(once, logInput("taken"))

    expect(twice.doseLogs[0].takenAt).toBe("10:12")
  })

  it("corrects the actual time without moving inventory", () => {
    const once = logDose(makeState(), logInput("taken", "10:12"))
    const corrected = logDose(once, logInput("taken", "10:20"))

    expect(corrected.supplements[0].currentCount).toBe(8)
    expect(corrected.doseLogs[0]).toMatchObject({
      id: once.doseLogs[0].id,
      takenAt: "10:20",
      inventoryAmount: 2,
    })
  })

  it("restores inventory when a taken dose is snoozed", () => {
    const taken = logDose(makeState(), logInput("taken", "10:12"))
    const snoozed = logDose(taken, logInput("snoozed"))

    expect(snoozed.supplements[0].currentCount).toBe(10)
    expect(snoozed.doseLogs).toHaveLength(1)
    expect(snoozed.doseLogs[0]).toMatchObject({ status: "snoozed" })
    expect(snoozed.doseLogs[0]).not.toHaveProperty("inventoryAmount")
    expect(snoozed.doseLogs[0]).not.toHaveProperty("takenAt")
  })

  it("restores inventory and removes the log when a taken dose is undone", () => {
    const taken = logDose(makeState(), logInput("taken", "10:12"))
    const undone = logDose(taken, logInput("pending"))

    expect(undone.supplements[0].currentCount).toBe(10)
    expect(undone.doseLogs).toEqual([])
  })

  it("keeps a taken log without an actual time when none is recorded", () => {
    const legacy = makeState({
      supplements: [makeSupplement({ currentCount: 8 })],
      doseLogs: [takenLog()],
    })

    const next = logDose(legacy, logInput("taken"))

    expect(next.doseLogs[0]).not.toHaveProperty("takenAt")
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

    expect(next).toEqual({
      supplements: state.supplements,
      doseLogs: state.doseLogs,
    })
  })

  it("consumes fractional dosage amounts", () => {
    const state = makeState({ supplements: [makeSupplement({ dosage: "1/2 capsule" })] })

    const next = logDose(state, logInput("taken"))

    expect(next.supplements[0].currentCount).toBe(9.5)
    expect(next.doseLogs[0].inventoryAmount).toBe(0.5)
  })

  it("restores the amount recorded when taken, not the current dosage", () => {
    // The dose log write model owns the supplements and the dose logs, so the
    // state is spread the way the reducer spreads it.
    const state = makeState()
    const taken = { ...state, ...logDose(state, logInput("taken")) }
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
