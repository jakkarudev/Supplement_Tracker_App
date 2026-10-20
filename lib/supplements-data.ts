export type DoseStatus = "taken" | "pending" | "snoozed"

export const SUPPLEMENT_FORMS = ["Capsule", "Tablet", "Liquid", "Powder"] as const

export type SupplementForm = (typeof SUPPLEMENT_FORMS)[number]

export type Supplement = {
  id: string
  name: string
  brand: string
  potency: string
  dosage: string
  form: SupplementForm
  notes?: string
  purchaseUrl?: string
  startedOn: string
  durationDays?: number
  cycleActiveDays?: number
  cycleBreakDays?: number
  days: number[] // 0 = Sun ... 6 = Sat
  times: string[] // "HH:mm", 24-hour
  totalCount: number
  currentCount: number
  restockReminder: boolean
  restockThreshold: number
}

export type DoseLog = {
  id: string
  supplementId: string
  date: string   // "YYYY-MM-DD"
  time: string   // "HH:mm", 24-hour; the scheduled slot
  status: DoseStatus
  takenAt?: string // "HH:mm", 24-hour; actual intake time, only when taken
  inventoryAmount?: number // consumed when taken; recorded for exact reversal
}

/**
 * A standing minimum interval between two Supplements. The rule is symmetric:
 * it applies to both sides, and it always links two different Supplements.
 */
export type SpacingRule = {
  id: string
  supplementAId: string
  supplementBId: string
  minimumIntervalMinutes: number
}

export type WellnessLog = {
  date: string   // "YYYY-MM-DD"
  energy: number // 1–10
  focus: number  // 1–10
}
