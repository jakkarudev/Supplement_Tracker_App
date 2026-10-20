"use client"

import { useMemo, useState } from "react"
import { BedDouble, Moon, Pill, RotateCcw, Sunrise, Sun, Sunset } from "lucide-react"
import { WeekStrip } from "@/components/week-strip"
import { StatusBadge } from "@/components/status-badge"
import { SlideToConfirm } from "@/components/slide-to-confirm"
import { DoseTimeSheet } from "@/components/dose-time-sheet"
import { useAppState, useAppDispatch } from "@/lib/app-context"
import type { DoseStatus } from "@/lib/supplements-data"
import {
  dayRegimen,
  formatCalendarDate,
  formatTimeForDisplay,
  timeOfDayFrom,
  today,
  type CalendarDate,
  type Period,
  type ScheduledDose,
} from "@/lib/day-regimen"
import { cn } from "@/lib/utils"

type TimeSheetState = {
  dose: ScheduledDose
  mode: "log" | "correct"
  initialTime: string
}

const periodMeta: Record<Period, { Icon: typeof Sun; label: string }> = {
  Morning: { Icon: Sunrise, label: "Morning" },
  Afternoon: { Icon: Sun, label: "Afternoon" },
  Evening: { Icon: Sunset, label: "Evening" },
  Night: { Icon: BedDouble, label: "Night" },
}

type TodayRoutineProps = {
  date: CalendarDate
  onSelectDate: (date: CalendarDate) => void
}

export function TodayRoutine({ date: selectedDate, onSelectDate }: TodayRoutineProps) {
  const { supplements, doseLogs } = useAppState()
  const dispatch = useAppDispatch()
  const todayDate = today()
  const isToday = selectedDate === todayDate
  const [timeSheet, setTimeSheet] = useState<TimeSheetState | null>(null)

  // A cancelled sheet must not leave SlideToConfirm showing its sticky
  // "Logged" state, so each cancel remounts the slider for that dose.
  const [sliderResets, setSliderResets] = useState<Record<string, number>>({})

  const regimen = useMemo(
    () => dayRegimen({ supplements, doseLogs }, selectedDate),
    [supplements, doseLogs, selectedDate],
  )
  const doses = regimen.doses

  const grouped = useMemo(() => {
    const groups = new Map<string, ScheduledDose[]>()
    for (const item of doses) {
      const key = `${item.period}|${item.time}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    // Doses arrive ordered from 05:00, so first-seen order is logical-day order.
    return [...groups.entries()]
  }, [doses])

  const takenCount = regimen.summary.taken
  const totalCount = regimen.summary.total
  const pct = totalCount === 0 ? 0 : Math.round((takenCount / totalCount) * 100)

  function logDose(item: ScheduledDose, status: DoseStatus) {
    // Browsing past or future days is read-only; only today can be logged.
    if (!isToday) return

    dispatch({
      type: "LOG_DOSE",
      payload: {
        supplementId: item.supplement.id,
        date: item.date,
        time: item.time,
        status,
      },
    })
  }

  function openTimeSheet(item: ScheduledDose, mode: TimeSheetState["mode"]) {
    if (!isToday) return

    const initialTime =
      mode === "correct" && item.log?.takenAt
        ? item.log.takenAt
        : timeOfDayFrom(new Date())
    setTimeSheet({ dose: item, mode, initialTime })
  }

  function closeTimeSheet() {
    if (timeSheet) {
      const key = timeSheet.dose.key
      setSliderResets((current) => ({
        ...current,
        [key]: (current[key] ?? 0) + 1,
      }))
    }
    setTimeSheet(null)
  }

  function saveTimeSheet(takenAt: string) {
    if (!timeSheet || !isToday) return

    const { dose } = timeSheet
    dispatch({
      type: "LOG_DOSE",
      payload: {
        supplementId: dose.supplement.id,
        date: dose.date,
        time: dose.time,
        status: "taken",
        takenAt,
      },
    })
    setTimeSheet(null)
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header summary */}
        <div className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {isToday ? "Today's progress" : formatCalendarDate(selectedDate)}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {takenCount}
                <span className="text-muted-foreground">/{totalCount}</span>
                <span className="ml-2 text-base font-medium text-muted-foreground">logged</span>
              </p>
            </div>
            <div className="text-right">
              {isToday ? (
                <p className="text-sm font-medium text-muted-foreground">
                  {formatCalendarDate(selectedDate)}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectDate(todayDate)}
                  aria-label="Back to today"
                  className="inline-flex items-center gap-1 rounded-full text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Back to today
                </button>
              )}
              <p className="text-sm font-semibold text-primary">{pct}% complete</p>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Week calendar strip */}
        <WeekStrip selectedDate={selectedDate} onSelectDate={onSelectDate} />

        {doses.length === 0 ? (
          <div className="glass rounded-[1.25rem] p-6 text-center text-muted-foreground sm:rounded-3xl sm:p-8">
            <Pill className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">
              {isToday
                ? "No supplements scheduled for today."
                : "No supplements scheduled for this day."}
            </p>
            <p className="mt-1 text-xs">Add one using the + tab.</p>
          </div>
        ) : (
          <div className="space-y-7">
            {grouped.map(([groupKey, items]) => {
              const [period] = groupKey.split("|") as [Period]
              const { Icon } = periodMeta[period] ?? periodMeta.Morning
              return (
                <section key={groupKey} className="relative">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold leading-tight">{period}</h3>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatTimeForDisplay(items[0].time)}
                      </p>
                    </div>
                  </div>
                  <div className="ml-3 space-y-3 border-l border-dashed border-border pl-4 sm:ml-[1.1rem] sm:pl-6">
                    {items.map((item) => (
                      <DoseCard
                        key={item.key}
                        name={item.supplement.name}
                        brand={item.supplement.brand}
                        potency={item.supplement.potency}
                        dosage={item.supplement.dosage}
                        status={item.status}
                        takenAt={item.log?.takenAt}
                        readOnly={!isToday}
                        sliderResetKey={sliderResets[item.key] ?? 0}
                        onConfirm={() => openTimeSheet(item, "log")}
                        onSnooze={() => logDose(item, "snoozed")}
                        onCorrectTime={() => openTimeSheet(item, "correct")}
                        onUndo={() => logDose(item, "pending")}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {timeSheet && (
        <DoseTimeSheet
          key={`${timeSheet.dose.key}|${timeSheet.mode}`}
          open
          mode={timeSheet.mode}
          logicalDate={timeSheet.dose.date}
          scheduledTime={timeSheet.dose.time}
          initialTime={timeSheet.initialTime}
          onOpenChange={(open) => {
            if (!open) closeTimeSheet()
          }}
          onSave={saveTimeSheet}
        />
      )}
    </>
  )
}

type DoseCardProps = {
  name: string
  brand: string
  potency: string
  dosage: string
  status: DoseStatus
  takenAt?: string
  readOnly: boolean
  sliderResetKey: number
  onConfirm: () => void
  onSnooze: () => void
  onCorrectTime: () => void
  onUndo: () => void
}

function DoseCard({
  name,
  brand,
  potency,
  dosage,
  status,
  takenAt,
  readOnly,
  sliderResetKey,
  onConfirm,
  onSnooze,
  onCorrectTime,
  onUndo,
}: DoseCardProps) {
  return (
    <div
      className={cn(
        "glass relative rounded-[1.25rem] p-4 transition-all sm:rounded-2xl",
        status === "taken" && "opacity-70",
      )}
    >
      {/* timeline node */}
      <span className="absolute -left-[1.2rem] top-6 h-3 w-3 rounded-full border-2 border-background bg-primary sm:-left-[1.95rem]" />

      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <Pill className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="truncate text-[0.95rem] font-semibold leading-tight">{name}</h4>
            <StatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {brand} · {potency}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground">{dosage}</p>
        </div>
      </div>

      {status === "taken" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {takenAt ? (
            readOnly ? (
              <span className="text-xs font-medium text-muted-foreground">
                Taken at {formatTimeForDisplay(takenAt)}
              </span>
            ) : (
              <button
                type="button"
                onClick={onCorrectTime}
                aria-label={`Taken at ${formatTimeForDisplay(takenAt)}`}
                className="rounded-full text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                Taken at {formatTimeForDisplay(takenAt)}
              </button>
            )
          ) : (
            <span className="text-xs font-medium text-muted-foreground">
              Taken
            </span>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={onUndo}
              aria-label="Undo taken dose"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
        </div>
      )}

      {!readOnly && status !== "taken" && (
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1">
            <SlideToConfirm key={sliderResetKey} onConfirm={onConfirm} />
          </div>
          <button
            type="button"
            onClick={onSnooze}
            aria-label="Snooze dose"
            title="Snooze"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card transition-all hover:bg-secondary active:scale-95",
              status === "snoozed" && "border-amber-400/40 bg-amber-500/10 text-amber-500",
            )}
          >
            <Moon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
