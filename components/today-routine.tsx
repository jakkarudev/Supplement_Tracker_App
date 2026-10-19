"use client"

import { useMemo } from "react"
import { BedDouble, Moon, Pill, Sunrise, Sun, Sunset } from "lucide-react"
import { WeekStrip } from "@/components/week-strip"
import { StatusBadge } from "@/components/status-badge"
import { SlideToConfirm } from "@/components/slide-to-confirm"
import { useAppState, useAppDispatch, todayString, nanoid } from "@/lib/app-context"
import type { IntakeLog } from "@/lib/supplements-data"
import { cn } from "@/lib/utils"
import { isSupplementScheduledOnDate } from "@/lib/supplement-schedule"

type Period = "Morning" | "Afternoon" | "Evening" | "Night"

const periodMeta: Record<Period, { Icon: typeof Sun; label: string }> = {
  Morning: { Icon: Sunrise, label: "Morning" },
  Afternoon: { Icon: Sun, label: "Afternoon" },
  Evening: { Icon: Sunset, label: "Evening" },
  Night: { Icon: BedDouble, label: "Night" },
}

function getPeriod(time: string): Period {
  const [rawTime, meridiem] = time.split(" ")
  const [hourStr] = rawTime.split(":")
  let hour = parseInt(hourStr, 10)
  if (meridiem === "PM" && hour !== 12) hour += 12
  if (meridiem === "AM" && hour === 12) hour = 0
  if (hour < 12) return "Morning"
  if (hour < 17) return "Afternoon"
  if (hour < 21) return "Evening"
  return "Night"
}

function timeTo24h(time: string): number {
  const [rawTime, meridiem] = time.split(" ")
  const [hourStr, minStr] = rawTime.split(":")
  let hour = parseInt(hourStr, 10)
  const min = parseInt(minStr, 10)
  if (meridiem === "PM" && hour !== 12) hour += 12
  if (meridiem === "AM" && hour === 12) hour = 0
  return hour * 60 + min
}

type ScheduledIntake = {
  key: string
  supplementId: string
  time: string
  period: Period
  log: IntakeLog | null
}

export function TodayRoutine() {
  const { supplements, intakeLogs } = useAppState()
  const dispatch = useAppDispatch()
  const today = todayString()

  const intakes = useMemo<ScheduledIntake[]>(() => {
    const result: ScheduledIntake[] = []
    for (const s of supplements) {
      if (!isSupplementScheduledOnDate(s, today)) continue
      for (const time of s.times) {
        const existing =
          intakeLogs.find(
            (l) => l.supplementId === s.id && l.date === today && l.time === time,
          ) ?? null
        result.push({
          key: `${s.id}-${today}-${time}`,
          supplementId: s.id,
          time,
          period: getPeriod(time),
          log: existing,
        })
      }
    }
    return result
  }, [supplements, intakeLogs, today])

  const grouped = useMemo(() => {
    const groups = new Map<string, ScheduledIntake[]>()
    for (const item of intakes) {
      const key = `${item.period}|${item.time}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return [...groups.entries()].sort(
      ([, a], [, b]) => timeTo24h(a[0].time) - timeTo24h(b[0].time),
    )
  }, [intakes])

  const takenCount = intakes.filter((i) => i.log?.status === "taken").length
  const pct = intakes.length === 0 ? 0 : Math.round((takenCount / intakes.length) * 100)

  function logIntake(item: ScheduledIntake, status: IntakeLog["status"]) {
    dispatch({
      type: "LOG_INTAKE",
      payload: {
        id: item.log?.id ?? nanoid(),
        supplementId: item.supplementId,
        date: today,
        time: item.time,
        period: item.period,
        status,
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <div className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Today&apos;s progress</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              {takenCount}
              <span className="text-muted-foreground">/{intakes.length}</span>
              <span className="ml-2 text-base font-medium text-muted-foreground">logged</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </p>
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
      <WeekStrip />

      {intakes.length === 0 ? (
        <div className="glass rounded-[1.25rem] p-6 text-center text-muted-foreground sm:rounded-3xl sm:p-8">
          <Pill className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm">No supplements scheduled for today.</p>
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
                    <p className="text-xs text-muted-foreground tabular-nums">{items[0].time}</p>
                  </div>
                </div>
                <div className="ml-3 space-y-3 border-l border-dashed border-border pl-4 sm:ml-[1.1rem] sm:pl-6">
                  {items.map((item) => {
                    const supp = supplements.find((s) => s.id === item.supplementId)
                    if (!supp) return null
                    const status = item.log?.status ?? "pending"
                    return (
                      <IntakeCard
                        key={item.key}
                        name={supp.name}
                        brand={supp.brand}
                        potency={supp.potency}
                        dosage={supp.dosage}
                        status={status}
                        onConfirm={() => logIntake(item, "taken")}
                        onSnooze={() => logIntake(item, "snoozed")}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

type IntakeCardProps = {
  name: string
  brand: string
  potency: string
  dosage: string
  status: IntakeLog["status"]
  onConfirm: () => void
  onSnooze: () => void
}

function IntakeCard({ name, brand, potency, dosage, status, onConfirm, onSnooze }: IntakeCardProps) {
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

      {status !== "taken" && (
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1">
            <SlideToConfirm onConfirm={onConfirm} />
          </div>
          <button
            type="button"
            onClick={onSnooze}
            aria-label="Snooze intake"
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
