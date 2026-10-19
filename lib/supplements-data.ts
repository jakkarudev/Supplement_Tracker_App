export type DoseStatus = "taken" | "pending" | "snoozed"

export type SupplementForm = "Capsule" | "Tablet" | "Liquid" | "Powder"

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
  time: string   // "HH:mm", 24-hour
  status: DoseStatus
}

export type WellnessLog = {
  date: string   // "YYYY-MM-DD"
  energy: number // 1–10
  focus: number  // 1–10
}

export const supplements: Supplement[] = []

export function getSupplement(id: string) {
  return supplements.find((s) => s.id === id)
}

// 7-day adherence vs self-reported energy/focus (1-10 scale)
export const wellnessData = [
  { day: "Mon", adherence: 100, energy: 7.2, focus: 6.8 },
  { day: "Tue", adherence: 80, energy: 6.5, focus: 6.2 },
  { day: "Wed", adherence: 100, energy: 7.8, focus: 7.5 },
  { day: "Thu", adherence: 100, energy: 8.1, focus: 8.0 },
  { day: "Fri", adherence: 75, energy: 6.9, focus: 6.4 },
  { day: "Sat", adherence: 100, energy: 8.4, focus: 8.3 },
  { day: "Sun", adherence: 100, energy: 8.6, focus: 8.5 },
]

export const adherenceRate = 94
export const consistencyStreak = 12
