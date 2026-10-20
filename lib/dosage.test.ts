import { describe, expect, it } from "vitest"
import {
  SOLID_DOSAGE_OPTIONS,
  dosageInventoryAmount,
  formatDosage,
  inventoryUnitLabel,
  inventoryUnitPlural,
  isValidDosageAmount,
  parseDosageValueForForm,
} from "./dosage"

describe("SOLID_DOSAGE_OPTIONS", () => {
  it("contains fractions then whole doses through 30", () => {
    expect(SOLID_DOSAGE_OPTIONS.slice(0, 5)).toEqual(["1/4", "1/3", "1/2", "1", "2"])
    expect(SOLID_DOSAGE_OPTIONS.at(-1)).toBe("30")
    expect(SOLID_DOSAGE_OPTIONS).toHaveLength(33)
  })
})

describe("formatDosage", () => {
  it("formats controlled solid dosages with the selected form", () => {
    expect(formatDosage("Capsule", "1/2")).toBe("1/2 capsules")
    expect(formatDosage("Tablet", "2")).toBe("2 tablets")
  })

  it("formats liquid and powder typed values with units", () => {
    expect(formatDosage("Liquid", "15")).toBe("15 ml")
    expect(formatDosage("Powder", "3.5")).toBe("3.5 g")
  })
})

describe("parseDosageValueForForm", () => {
  it("extracts existing saved values for edit mode", () => {
    expect(parseDosageValueForForm("Capsule", "2 capsules")).toBe("2")
    expect(parseDosageValueForForm("Tablet", "1/4 tablet")).toBe("1/4")
    expect(parseDosageValueForForm("Liquid", "10 ml")).toBe("10")
    expect(parseDosageValueForForm("Powder", "5 g")).toBe("5")
  })

  it("keeps a stored solid dosage outside the fixed options", () => {
    expect(parseDosageValueForForm("Capsule", "1.5 capsules")).toBe("1.5")
    expect(parseDosageValueForForm("Tablet", "7/8 tablets")).toBe("7/8")
  })

  it("does not turn an unreadable stored dosage into an amount", () => {
    expect(parseDosageValueForForm("Capsule", "some capsules")).toBe("")
  })
})

describe("isValidDosageAmount", () => {
  it("accepts positive whole, fractional, and decimal amounts", () => {
    expect(isValidDosageAmount("1")).toBe(true)
    expect(isValidDosageAmount("1/2")).toBe(true)
    expect(isValidDosageAmount("1.5")).toBe(true)
    expect(isValidDosageAmount("10.25")).toBe(true)
  })

  it("rejects blank, zero, negative, and malformed amounts", () => {
    expect(isValidDosageAmount("")).toBe(false)
    expect(isValidDosageAmount("0")).toBe(false)
    expect(isValidDosageAmount("0/2")).toBe(false)
    expect(isValidDosageAmount("1/0")).toBe(false)
    expect(isValidDosageAmount("-1")).toBe(false)
    expect(isValidDosageAmount("1/2/3")).toBe(false)
    expect(isValidDosageAmount("some")).toBe(false)
  })
})

describe("dosageInventoryAmount", () => {
  it("returns fractional or decimal amount for inventory decrement", () => {
    expect(dosageInventoryAmount("1/2 capsule")).toBe(0.5)
    expect(dosageInventoryAmount("1/3 tablet")).toBeCloseTo(1 / 3)
    expect(dosageInventoryAmount("2 capsules")).toBe(2)
  })
})


describe("inventory units", () => {
  it("pluralizes solid units and leaves liquid and powder units invariant", () => {
    expect(inventoryUnitPlural("Capsule")).toBe("capsules")
    expect(inventoryUnitPlural("Tablet")).toBe("tablets")
    expect(inventoryUnitPlural("Liquid")).toBe("ml")
    expect(inventoryUnitPlural("Powder")).toBe("g")
  })

  it("uses the singular unit only for a count of one", () => {
    expect(inventoryUnitLabel("Capsule", 1)).toBe("capsule")
    expect(inventoryUnitLabel("Capsule", 2)).toBe("capsules")
    expect(inventoryUnitLabel("Liquid", 1)).toBe("ml")
    expect(inventoryUnitLabel("Powder", 0)).toBe("g")
  })
})
