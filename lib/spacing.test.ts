import { describe, expect, it } from "vitest"
import type { DoseLog, SpacingRule, Supplement } from "./supplements-data"
import { buildSpacingPlan, spacingViolation } from "./spacing"

const DATE = "2026-05-04"

function makeSupplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: "copper",
    name: "Copper",
    brand: "Now Foods",
    potency: "2 mg",
    dosage: "1 capsule",
    form: "Capsule",
    startedOn: "2026-01-01",
    days: [0, 1, 2, 3, 4, 5, 6],
    times: ["08:00"],
    totalCount: 60,
    currentCount: 60,
    restockReminder: false,
    restockThreshold: 10,
    ...overrides,
  }
}

function copper(): Supplement {
  return makeSupplement({ id: "copper", name: "Copper", times: ["08:00"] })
}

function zinc(): Supplement {
  return makeSupplement({ id: "zinc", name: "Zinc", times: ["12:00"] })
}

const RULE: SpacingRule = {
  id: "rule-1",
  supplementAId: "copper",
  supplementBId: "zinc",
  minimumIntervalMinutes: 240,
}

function takenLog(
  supplementId: string,
  time: string,
  takenAt?: string,
  overrides: Partial<DoseLog> = {},
): DoseLog {
  const log: DoseLog = {
    id: `${supplementId}-${time}`,
    supplementId,
    date: DATE,
    time,
    status: "taken",
    ...overrides,
  }
  if (takenAt !== undefined) log.takenAt = takenAt
  return log
}

describe("buildSpacingPlan", () => {
  it("moves a pending partner dose to the earliest allowed time", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("copper", "08:00", "10:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["zinc|2026-05-04|12:00"]).toEqual({
      earliestTime: "14:00",
      adjustedTime: "14:00",
      conflict: null,
    })
  })

  it("keeps the taken dose in its own slot", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("copper", "08:00", "10:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["copper|2026-05-04|08:00"]).toEqual({
      earliestTime: null,
      adjustedTime: "08:00",
      conflict: null,
    })
  })

  it("moves the partner the same way when the other supplement is taken late", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [
          makeSupplement({ id: "copper", name: "Copper", times: ["12:00"] }),
          makeSupplement({ id: "zinc", name: "Zinc", times: ["08:00"] }),
        ],
        doseLogs: [takenLog("zinc", "08:00", "10:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["copper|2026-05-04|12:00"].adjustedTime).toBe("14:00")
  })

  it("leaves a pending dose alone when its scheduled time is already late enough", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [copper(), makeSupplement({ id: "zinc", times: ["18:00"] })],
        doseLogs: [takenLog("copper", "08:00", "10:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["zinc|2026-05-04|18:00"]).toEqual({
      earliestTime: "14:00",
      adjustedTime: "18:00",
      conflict: null,
    })
  })

  it("reports a conflict when the partner was already taken inside the forbidden window", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("copper", "08:00", "10:00"), takenLog("zinc", "12:00", "09:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    const copperEntry = plan["copper|2026-05-04|08:00"]
    const zincEntry = plan["zinc|2026-05-04|12:00"]

    expect(copperEntry.conflict).toMatchObject({
      kind: "gap-not-met",
      supplementId: "copper",
      partnerSupplementId: "zinc",
      minimumIntervalMinutes: 240,
      partnerTakenAt: "09:00",
      earliestTime: "13:00",
    })
    expect(zincEntry.conflict).toMatchObject({
      kind: "gap-not-met",
      supplementId: "zinc",
      partnerSupplementId: "copper",
      partnerTakenAt: "10:00",
      earliestTime: "14:00",
    })
  })

  it("never rewrites a taken dose's slot when it conflicts", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("copper", "08:00", "10:00"), takenLog("zinc", "12:00", "09:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["copper|2026-05-04|08:00"].adjustedTime).toBe("08:00")
    expect(plan["zinc|2026-05-04|12:00"].adjustedTime).toBe("12:00")
  })

  it("measures a cross-midnight pair on the same logical day", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [
          makeSupplement({ id: "copper", name: "Copper", times: ["23:30"] }),
          makeSupplement({ id: "zinc", name: "Zinc", times: ["03:00"] }),
        ],
        doseLogs: [takenLog("copper", "23:30", "23:30")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["zinc|2026-05-04|03:00"].adjustedTime).toBe("03:30")
  })

  it("conflicts when a cross-midnight pair leaves no time in the logical day", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [
          makeSupplement({ id: "copper", name: "Copper", times: ["23:30"] }),
          makeSupplement({ id: "zinc", name: "Zinc", times: ["03:00"] }),
        ],
        doseLogs: [takenLog("zinc", "03:00", "03:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["copper|2026-05-04|23:30"].conflict).toMatchObject({
      kind: "no-time-left-in-day",
      supplementId: "copper",
      partnerSupplementId: "zinc",
      partnerTakenAt: "03:00",
    })
  })

  it("does not measure a cross-midnight pair across two logical days", () => {
    const supplements = [
      makeSupplement({ id: "copper", name: "Copper", times: ["23:30"] }),
      makeSupplement({ id: "zinc", name: "Zinc", times: ["05:30"] }),
    ]

    const firstDay = buildSpacingPlan(
      {
        supplements,
        doseLogs: [takenLog("copper", "23:30", "23:30")],
        spacingRules: [RULE],
      },
      DATE,
    )
    const nextDay = buildSpacingPlan(
      {
        supplements,
        doseLogs: [takenLog("copper", "23:30", "23:30")],
        spacingRules: [RULE],
      },
      "2026-05-05",
    )

    expect(firstDay["copper|2026-05-04|23:30"].adjustedTime).toBe("23:30")
    expect(nextDay["zinc|2026-05-05|05:30"].adjustedTime).toBe("05:30")
    expect(nextDay["zinc|2026-05-05|05:30"].earliestTime).toBeNull()
  })

  it("constrains nothing when the taken dose has no recorded actual time", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("copper", "08:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["zinc|2026-05-04|12:00"]).toEqual({
      earliestTime: null,
      adjustedTime: "12:00",
      conflict: null,
    })
  })

  it("conflicts when the earliest allowed time falls after the logical day ends", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [
          makeSupplement({ id: "copper", name: "Copper", times: ["01:00"] }),
          makeSupplement({ id: "zinc", name: "Zinc", times: ["12:00"] }),
        ],
        doseLogs: [takenLog("copper", "01:00", "01:00")],
        spacingRules: [RULE],
      },
      DATE,
    )

    expect(plan["zinc|2026-05-04|12:00"]).toEqual({
      earliestTime: null,
      adjustedTime: "12:00",
      conflict: {
        kind: "no-time-left-in-day",
        supplementId: "zinc",
        partnerSupplementId: "copper",
        minimumIntervalMinutes: 240,
        earliestTime: null,
        partnerTakenAt: "01:00",
      },
    })
  })

  it("moves nothing when there is no rule", () => {
    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("copper", "08:00", "10:00")],
        spacingRules: [],
      },
      DATE,
    )

    expect(plan["zinc|2026-05-04|12:00"].adjustedTime).toBe("12:00")
  })

  it("does not carry a pending dose's adjusted time onto a third supplement", () => {
    const iron = makeSupplement({ id: "iron", name: "Iron", times: ["13:00"] })
    const chainRule: SpacingRule = {
      id: "rule-2",
      supplementAId: "zinc",
      supplementBId: "iron",
      minimumIntervalMinutes: 240,
    }

    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc(), iron],
        doseLogs: [takenLog("copper", "08:00", "10:00")],
        spacingRules: [RULE, chainRule],
      },
      DATE,
    )

    // Zinc is pending, so it constrains nothing: Iron keeps its own slot.
    expect(plan["zinc|2026-05-04|12:00"].adjustedTime).toBe("14:00")
    expect(plan["iron|2026-05-04|13:00"].adjustedTime).toBe("13:00")
    expect(plan["iron|2026-05-04|13:00"].earliestTime).toBeNull()
  })

  it("resolves a chain as the doses are actually taken", () => {
    const iron = makeSupplement({ id: "iron", name: "Iron", times: ["13:00"] })
    const chainRule: SpacingRule = {
      id: "rule-2",
      supplementAId: "zinc",
      supplementBId: "iron",
      minimumIntervalMinutes: 240,
    }

    const plan = buildSpacingPlan(
      {
        supplements: [copper(), zinc(), iron],
        doseLogs: [takenLog("zinc", "12:00", "14:00")],
        spacingRules: [RULE, chainRule],
      },
      DATE,
    )

    expect(plan["iron|2026-05-04|13:00"].adjustedTime).toBe("18:00")
  })
})

describe("spacingViolation", () => {
  it("refuses a time that breaks the gap and names the earliest safe time", () => {
    const violation = spacingViolation(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("zinc", "12:00", "09:00")],
        spacingRules: [RULE],
      },
      { supplementId: "copper", logicalDate: DATE, takenAt: "10:00" },
    )

    expect(violation).toEqual({
      kind: "gap-not-met",
      supplementId: "copper",
      partnerSupplementId: "zinc",
      minimumIntervalMinutes: 240,
      earliestTime: "13:00",
      partnerTakenAt: "09:00",
    })
  })

  it("allows a time that keeps the gap", () => {
    const violation = spacingViolation(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("zinc", "12:00", "09:00")],
        spacingRules: [RULE],
      },
      { supplementId: "copper", logicalDate: DATE, takenAt: "05:00" },
    )

    expect(violation).toBeNull()
  })

  it("allows a time when the partner was taken without a recorded actual time", () => {
    const violation = spacingViolation(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("zinc", "12:00")],
        spacingRules: [RULE],
      },
      { supplementId: "copper", logicalDate: DATE, takenAt: "10:00" },
    )

    expect(violation).toBeNull()
  })

  it("does not measure across two logical days", () => {
    const violation = spacingViolation(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("zinc", "12:00", "09:00")],
        spacingRules: [RULE],
      },
      { supplementId: "copper", logicalDate: "2026-05-05", takenAt: "10:00" },
    )

    expect(violation).toBeNull()
  })

  it("ignores rules that do not involve the candidate supplement", () => {
    const violation = spacingViolation(
      {
        supplements: [copper(), zinc()],
        doseLogs: [takenLog("zinc", "12:00", "09:00")],
        spacingRules: [RULE],
      },
      { supplementId: "magnesium", logicalDate: DATE, takenAt: "10:00" },
    )

    expect(violation).toBeNull()
  })
})
