import type { SupplementForm } from "./supplements-data"

export const SOLID_DOSAGE_OPTIONS = [
  "1/4",
  "1/3",
  "1/2",
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
]

/** The fixed solid dosage options plus a stored dosage outside them. */
export function solidDosageOptionsFor(dosage: string): string[] {
  const value = dosage.trim()
  if (!value || SOLID_DOSAGE_OPTIONS.includes(value)) return SOLID_DOSAGE_OPTIONS
  return [...SOLID_DOSAGE_OPTIONS, value]
}

export function isSolidForm(form: SupplementForm): boolean {
  return form === "Capsule" || form === "Tablet"
}

export function dosageUnitForForm(form: SupplementForm): string {
  if (form === "Liquid") return "ml"
  if (form === "Powder") return "g"
  return form.toLowerCase()
}

/** The plural inventory unit for a form, used in labels ("capsules", "ml", "g"). */
export function inventoryUnitPlural(form: SupplementForm): string {
  return isSolidForm(form) ? `${dosageUnitForForm(form)}s` : dosageUnitForForm(form)
}

/** The inventory unit for a form, singular only when the count is one. */
export function inventoryUnitLabel(form: SupplementForm, count: number): string {
  return count === 1 ? dosageUnitForForm(form) : inventoryUnitPlural(form)
}

export function formatDosage(form: SupplementForm, value: string): string {
  const clean = value.trim()
  if (!clean) return ""
  const unit = dosageUnitForForm(form)
  if (isSolidForm(form)) {
    const plural = clean === "1" ? unit : `${unit}s`
    return `${clean} ${plural}`
  }
  return `${clean} ${unit}`
}

type DosageParts = {
  /** The amount token at the start of a dosage, e.g. "1/2" in "1/2 tablets". */
  value: string
  /** The parsed amount, or null when the token is not a number or fraction. */
  amount: { numerator: number; denominator: number } | null
}

/** Splits a stored dosage into its amount token and parsed amount. */
function parseDosage(dosage: string): DosageParts {
  const value = dosage.trim().split(/\s+/)[0] ?? ""
  const match = value.match(/^(\d*\.?\d+)(?:\/(\d*\.?\d+))?$/)
  if (!match) return { value, amount: null }
  return {
    value,
    amount: {
      numerator: Number(match[1]),
      denominator: match[2] === undefined ? 1 : Number(match[2]),
    },
  }
}

function isPositiveAmount(amount: DosageParts["amount"]): boolean {
  return amount !== null && amount.numerator > 0 && amount.denominator > 0
}

/**
 * Whether a stored or typed dosage is a positive number, whole, decimal, or
 * fractional ("1/2"). Zero, negatives, and unreadable values are not amounts.
 */
export function isValidDosageAmount(value: string): boolean {
  return isPositiveAmount(parseDosage(value).amount)
}

export function parseDosageValueForForm(form: SupplementForm, dosage: string): string {
  const { value, amount } = parseDosage(dosage)
  if (isSolidForm(form)) {
    // A stored dosage outside the fixed options (e.g. "1.5 capsules" from an
    // older build) stays selected so the record can be saved unchanged.
    return isPositiveAmount(amount) ? value : ""
  }
  return value
}

export function dosageInventoryAmount(dosage: string): number {
  const value = dosage.trim().split(/\s+/)[0] ?? ""
  if (value.includes("/")) {
    const [n, d] = value.split("/").map(Number)
    if (Number.isFinite(n) && Number.isFinite(d) && d > 0) return n / d
    return 1
  }
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 1
}

