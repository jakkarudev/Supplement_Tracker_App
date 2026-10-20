import type { DoseLog, DoseStatus, Supplement } from "./supplements-data"

export type CalendarDate = string

export type Period = "Morning" | "Afternoon" | "Evening" | "Night"

export type ScheduledDose = {
  key: string
  supplement: Supplement
  date: CalendarDate
  time: string
  period: Period
  log: DoseLog | null
  status: DoseStatus
}

export type DayRegimen = {
  date: CalendarDate
  doses: ScheduledDose[]
  summary: {
    total: number
    taken: number
  }
}

/** Where a supplement sits relative to its course window on a date. */
export type CourseState = "upcoming" | "current" | "finished"

const CANONICAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const LEGACY_TIME = /^(\d{1,2}):([0-5]\d)\s*([AaPp][Mm])$/
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const MILLISECONDS_PER_DAY = 86_400_000

/** The local hour at which one Logical Day becomes the next. */
const LOGICAL_DAY_START_HOUR = 5
const LOGICAL_DAY_START_MINUTES = LOGICAL_DAY_START_HOUR * 60
const MINUTES_PER_DAY = 24 * 60

/** Whether a local clock time falls before the logical day's 05:00 start. */
function isBeforeLogicalDayStart(hour: number, minute: number): boolean {
  return hour * 60 + minute < LOGICAL_DAY_START_MINUTES
}

/** Builds the stable identity key for one supplement's dose on a date and time. */
export function doseKey(supplementId: string, date: CalendarDate, time: string): string {
  return `${supplementId}|${date}|${time}`
}

function daysBetween(start: CalendarDate, end: CalendarDate): number {
  const [startYear, startMonth, startDay] = start.split("-").map(Number)
  const [endYear, endMonth, endDay] = end.split("-").map(Number)
  const a = Date.UTC(startYear, startMonth - 1, startDay)
  const b = Date.UTC(endYear, endMonth - 1, endDay)
  return Math.floor((b - a) / MILLISECONDS_PER_DAY)
}

/** Returns whether a supplement's course window is upcoming, current, or finished on a date. */
export function courseStateOn(
  supplement: Supplement,
  date: CalendarDate,
): CourseState {
  const elapsed = daysBetween(supplement.startedOn, date)
  if (elapsed < 0) return "upcoming"
  if (supplement.durationDays !== undefined && elapsed >= supplement.durationDays) {
    return "finished"
  }
  return "current"
}

function isSupplementActiveOnDate(supplement: Supplement, date: CalendarDate): boolean {
  if (courseStateOn(supplement, date) !== "current") return false

  const elapsed = daysBetween(supplement.startedOn, date)
  const activeDays = supplement.cycleActiveDays
  const breakDays = supplement.cycleBreakDays
  if (activeDays && breakDays) {
    return elapsed % (activeDays + breakDays) < activeDays
  }

  return true
}

function isSupplementScheduledOnDate(supplement: Supplement, date: CalendarDate): boolean {
  return isSupplementActiveOnDate(supplement, date) && supplement.days.includes(dayOfWeek(date))
}

function localDateFromCalendarDate(date: CalendarDate): Date {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/** Formats a local Date as a Calendar Date. */
export function calendarDateFrom(date: Date): CalendarDate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Returns whether the value is a real local calendar date in "YYYY-MM-DD" form. */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== "string") return false
  const match = CALENDAR_DATE.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

/** Formats a local Date as the Calendar Date of its Logical Day. */
export function logicalDateFrom(at: Date): CalendarDate {
  const calendar = calendarDateFrom(at)
  return isBeforeLogicalDayStart(at.getHours(), at.getMinutes())
    ? addDays(calendar, -1)
    : calendar
}

/** Returns the current Logical Day as a Calendar Date. */
export function today(): CalendarDate {
  return logicalDateFrom(new Date())
}

/** Adds calendar days to a date, keeping local-date behavior. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const next = localDateFromCalendarDate(date)
  next.setDate(next.getDate() + days)
  return calendarDateFrom(next)
}

/** Returns the physical Calendar Date on which a logical day's time occurs. */
export function physicalDateForTime(
  logicalDate: CalendarDate,
  time: string,
): CalendarDate {
  const { hour, minute } = clockFromTime(time)
  return isBeforeLogicalDayStart(hour, minute)
    ? addDays(logicalDate, 1)
    : logicalDate
}

/** Parses a calendar date to local day-of-week (0=Sun … 6=Sat). */
export function dayOfWeek(date: CalendarDate): number {
  return localDateFromCalendarDate(date).getDay()
}

/** Returns the Sunday-start week containing the given calendar date. */
export function weekDates(date: CalendarDate): CalendarDate[] {
  const sunday = localDateFromCalendarDate(date)
  sunday.setDate(sunday.getDate() - sunday.getDay())
  return Array.from({ length: 7 }, (_, index) => addDays(calendarDateFrom(sunday), index))
}

/** Formats a calendar date as a local UI label. */
export function formatCalendarDate(
  date: CalendarDate,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
): string {
  return localDateFromCalendarDate(date).toLocaleDateString("en-US", options)
}

/** Returns the supplement's scheduled doses for one logical day, ordered from 05:00. */
export function scheduledDoses(
  supplements: Supplement[],
  date: CalendarDate,
): ScheduledDose[] {
  const ordered: { dose: ScheduledDose; order: number }[] = []
  let order = 0

  for (const supplement of supplements) {
    if (!isSupplementScheduledOnDate(supplement, date)) continue

    for (const time of normalizeTimeList(supplement.times)) {
      ordered.push({
        dose: {
          key: doseKey(supplement.id, date, time),
          supplement,
          date,
          time,
          period: periodFromTime(time),
          log: null,
          status: "pending",
        },
        order: order++,
      })
    }
  }

  return ordered
    .sort(
      (a, b) =>
        minutesIntoLogicalDay(a.dose.time) - minutesIntoLogicalDay(b.dose.time) ||
        a.order - b.order,
    )
    .map(({ dose }) => dose)
}

/** Returns one logical day's scheduled doses joined with their dose logs. */
export function dayRegimen(
  { supplements, doseLogs }: { supplements: Supplement[]; doseLogs: DoseLog[] },
  date: CalendarDate,
): DayRegimen {
  const doses = scheduledDoses(supplements, date).map((dose) => {
    const log =
      doseLogs.find(
        (candidate) => doseKey(candidate.supplementId, candidate.date, candidate.time) === dose.key,
      ) ?? null

    return { ...dose, log, status: log?.status ?? "pending" }
  })
  const taken = doses.filter((dose) => dose.status === "taken").length

  return { date, doses, summary: { total: doses.length, taken } }
}

/** Returns schedule-only doses over a logical-date-major horizon starting at `fromDate`. */
export function upcomingScheduledDoses(
  supplements: Supplement[],
  fromDate: CalendarDate,
  horizonDays: number,
): ScheduledDose[] {
  const doses: ScheduledDose[] = []

  for (let index = 0; index < horizonDays; index++) {
    doses.push(...scheduledDoses(supplements, addDays(fromDate, index)))
  }

  return doses
}

/** Returns the hour and minute parts of a canonical "HH:mm" time. */
export function clockFromTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number)
  return { hour, minute }
}

/** Minutes elapsed since the logical day's 05:00 start, in [0, 1440). */
export function minutesIntoLogicalDay(time: string): number {
  const { hour, minute } = clockFromTime(time)
  return (
    ((hour * 60 + minute - LOGICAL_DAY_START_MINUTES) % MINUTES_PER_DAY +
      MINUTES_PER_DAY) %
    MINUTES_PER_DAY
  )
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

/** Normalizes a stored list of times to canonical "HH:mm", dropping invalid entries and duplicates. */
export function normalizeTimeList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const times = value
    .map(normalizeTimeOfDay)
    .filter((time): time is string => time !== null)
  return [...new Set(times)]
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

/** Derives the named part of the logical day from a canonical "HH:mm" time. */
export function periodFromTime(time: string): Period {
  const { hour, minute } = clockFromTime(time)
  if (isBeforeLogicalDayStart(hour, minute)) return "Night"
  if (hour < 12) return "Morning"
  if (hour < 17) return "Afternoon"
  if (hour < 21) return "Evening"
  return "Night"
}
