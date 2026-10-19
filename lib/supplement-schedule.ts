import type { Supplement } from "./supplements-data"

export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d).getDay()
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const next = new Date(y, m - 1, d)
  next.setDate(next.getDate() + days)
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-")
}

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number)
  const [ey, em, ed] = end.split("-").map(Number)
  const a = Date.UTC(sy, sm - 1, sd)
  const b = Date.UTC(ey, em - 1, ed)
  return Math.floor((b - a) / 86_400_000)
}

export function isSupplementActiveOnDate(supplement: Supplement, date: string): boolean {
  const elapsed = daysBetween(supplement.startedOn, date)
  if (elapsed < 0) return false
  if (supplement.durationDays && elapsed >= supplement.durationDays) return false

  const activeDays = supplement.cycleActiveDays
  const breakDays = supplement.cycleBreakDays
  if (activeDays && breakDays) {
    const cycleLength = activeDays + breakDays
    return elapsed % cycleLength < activeDays
  }

  return true
}

export function isSupplementScheduledOnDate(supplement: Supplement, date: string): boolean {
  return isSupplementActiveOnDate(supplement, date) && supplement.days.includes(dayOfWeek(date))
}

export function upcomingScheduledDates(
  supplement: Supplement,
  startDate: string,
  horizonDays: number,
): string[] {
  return Array.from({ length: horizonDays }, (_, index) => addDays(startDate, index)).filter((date) =>
    isSupplementScheduledOnDate(supplement, date),
  )
}

