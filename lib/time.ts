export type Period = "Morning" | "Afternoon" | "Evening" | "Night"

const CANONICAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const LEGACY_TIME = /^(\d{1,2}):([0-5]\d)\s*([AaPp][Mm])$/

/** Returns the hour and minute parts of a canonical "HH:mm" time. */
export function clockFromTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number)
  return { hour, minute }
}

/**
 * Returns the canonical 24-hour "HH:mm" form of a stored time, or null when
 * the value is not a clock time. Legacy 12-hour display times are accepted so
 * persisted state can migrate in place.
 */
export function normalizeTimeOfDay(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  const canonical = CANONICAL_TIME.exec(trimmed)
  if (canonical) return trimmed

  const legacy = LEGACY_TIME.exec(trimmed)
  if (!legacy) return null

  const hour12 = Number(legacy[1])
  if (hour12 < 1 || hour12 > 12) return null

  const minute = legacy[2]
  const meridiem = legacy[3].toUpperCase()
  const hour = (hour12 % 12) + (meridiem === "PM" ? 12 : 0)
  return `${String(hour).padStart(2, "0")}:${minute}`
}

/** Formats a canonical "HH:mm" time as a zero-padded 12-hour display time. */
export function formatTimeForDisplay(time: string): string {
  const match = CANONICAL_TIME.exec(time)
  if (!match) return time

  const hour = Number(match[1])
  const minute = match[2]
  const meridiem = hour < 12 ? "AM" : "PM"
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${String(displayHour).padStart(2, "0")}:${minute} ${meridiem}`
}

/** Derives the named part of the day from a canonical "HH:mm" time. */
export function periodFromTime(time: string): Period {
  const { hour } = clockFromTime(time)
  if (hour < 12) return "Morning"
  if (hour < 17) return "Afternoon"
  if (hour < 21) return "Evening"
  return "Night"
}
