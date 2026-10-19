"use client"

import { useEffect, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  dayOfWeek,
  formatCalendarDate,
  today,
  weekDates,
  type CalendarDate,
} from "@/lib/day-regimen"

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"]

type WeekStripProps = {
  selectedDate: CalendarDate
  onSelectDate: (date: CalendarDate) => void
}

export function WeekStrip({ selectedDate, onSelectDate }: WeekStripProps) {
  const week = useMemo(() => weekDates(selectedDate), [selectedDate])
  const todayDate = today()
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Center the selected day in the scrollable strip
  useEffect(() => {
    const idx = week.indexOf(selectedDate)
    if (idx !== -1) {
      buttonRefs.current[idx]?.scrollIntoView({
        inline: "center",
        behavior: "smooth",
        block: "nearest",
      })
    }
  }, [week, selectedDate])

  return (
    <div className="-mx-3 flex items-stretch gap-1.5 overflow-x-auto px-3 scrollbar-hide snap-x snap-mandatory sm:mx-0 sm:gap-2 sm:px-0">
      {week.map((date, i) => {
        const isToday = date === todayDate
        const isSelected = date === selectedDate
        return (
          <button
            key={date}
            ref={(el) => { buttonRefs.current[i] = el }}
            type="button"
            onClick={() => onSelectDate(date)}
            aria-label={formatCalendarDate(date, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            aria-pressed={isSelected}
            className={cn(
              "flex min-h-14 w-11 shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2.5 transition-all sm:min-w-0 sm:flex-1",
              isSelected
                ? "border-primary/30 bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "border-border bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            <span className="text-[0.7rem] font-medium uppercase tracking-wide">
              {DAY_LETTERS[dayOfWeek(date)]}
            </span>
            <span className="text-base font-semibold tabular-nums">
              {formatCalendarDate(date, { day: "numeric" })}
            </span>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                isToday ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
