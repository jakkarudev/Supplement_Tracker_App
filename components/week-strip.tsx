"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const DAYS = ["S", "M", "T", "W", "T", "F", "S"]

function getWeek() {
  const today = new Date()
  const day = today.getDay()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - day)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })
}

export function WeekStrip() {
  const week = getWeek()
  const todayDate = new Date().getDate()
  const [selected, setSelected] = useState(todayDate)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Center the selected day in the scrollable strip
  useEffect(() => {
    const idx = week.findIndex((d) => d.getDate() === selected)
    if (idx !== -1) {
      buttonRefs.current[idx]?.scrollIntoView({
        inline: "center",
        behavior: "smooth",
        block: "nearest",
      })
    }
  }, [selected])

  return (
    <div
      ref={containerRef}
      className="-mx-3 flex items-stretch gap-1.5 overflow-x-auto px-3 scrollbar-hide snap-x snap-mandatory sm:mx-0 sm:gap-2 sm:px-0"
    >
      {week.map((d, i) => {
        const date = d.getDate()
        const isToday = date === todayDate
        const isSelected = date === selected
        return (
          <button
            key={i}
            ref={(el) => { buttonRefs.current[i] = el }}
            type="button"
            onClick={() => setSelected(date)}
            aria-label={d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            aria-pressed={isSelected}
            className={cn(
              "flex min-h-14 w-11 shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2.5 transition-all sm:min-w-0 sm:flex-1",
              isSelected
                ? "border-primary/30 bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "border-border bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            <span className="text-[0.7rem] font-medium uppercase tracking-wide">{DAYS[i]}</span>
            <span className="text-base font-semibold tabular-nums">{date}</span>
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
