"use client"

import { Clock } from "lucide-react"
import { useAppDispatch, useTimeFormat } from "@/lib/app-context"

/**
 * The header control that switches the whole app between 12-hour and 24-hour
 * time. It shows the format in use and names the action it takes, so the
 * button says what it will do rather than only what it currently is.
 */
export function TimeFormatToggle() {
  const { timeFormat } = useTimeFormat()
  const dispatch = useAppDispatch()

  const nextFormat = timeFormat === "12h" ? "24h" : "12h"
  const label =
    nextFormat === "24h" ? "Switch to 24-hour time" : "Switch to 12-hour time"

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => dispatch({ type: "SET_TIME_FORMAT", payload: nextFormat })}
      className="glass flex h-11 items-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      <Clock className="h-4 w-4" />
      {timeFormat}
    </button>
  )
}
