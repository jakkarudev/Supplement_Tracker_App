import type { SupplementForm } from "./supplements-data"

export const SOLID_DOSAGE_OPTIONS = [
  "1/4",
  "1/3",
  "1/2",
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
]

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

/**
 * Whether a stored or typed dosage is a positive number, whole, decimal, or
 * fractional ("1/2"). Zero, negatives, and unreadable values are not amounts.
 */
export function isValidDosageAmount(value: string): boolean {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/)
  if (!match) return false
  const numerator = Number(match[1])
  const denominator = match[2] === undefined ? 1 : Number(match[2])
  return numerator > 0 && denominator > 0
}

export function parseDosageValueForForm(form: SupplementForm, dosage: string): string {
  const value = dosage.trim().split(/\s+/)[0] ?? ""
  if (isSolidForm(form)) {
    // A stored dosage outside the fixed options (e.g. "1.5 capsules" from an
    // older build) stays selected so the record can be saved unchanged.
    return isValidDosageAmount(value) ? value : ""
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

