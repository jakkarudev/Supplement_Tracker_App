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

export function parseDosageValueForForm(form: SupplementForm, dosage: string): string {
  const value = dosage.trim().split(/\s+/)[0] ?? ""
  if (isSolidForm(form)) {
    return SOLID_DOSAGE_OPTIONS.includes(value) ? value : ""
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

