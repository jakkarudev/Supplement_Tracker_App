"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"
import { Flame, TrendingUp, AlertTriangle, ArrowUpRight } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { useAdherenceStats, useInventory } from "@/lib/app-context"
import { WellnessCheckin } from "@/components/wellness-checkin"
import { cn } from "@/lib/utils"

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  sub: string
  icon: typeof Flame
  accent: "primary" | "amber" | "destructive"
}) {
  const accentMap = {
    primary: "bg-primary/12 text-primary",
    amber: "bg-accent/15 text-accent-foreground dark:text-accent",
    destructive: "bg-destructive/12 text-destructive",
  }
  return (
    <div className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", accentMap[accent])}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

const chartConfig = {
  adherence: { label: "Adherence %", color: "var(--chart-1)" },
  energy: { label: "Energy", color: "var(--chart-2)" },
  focus: { label: "Focus", color: "var(--chart-3)" },
}

export function BiomarkerDashboard() {
  const { adherenceRate, streak, chartData } = useAdherenceStats()
  const { rows, summary } = useInventory()
  const lowStockNames = rows
    .filter((row) => row.lowStock)
    .map((row) => row.supplement.name.split(" ")[0])
    .join(", ")

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Adherence &amp; Wellness Margin</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The return on investment of your daily routine.
          </p>
        </div>
        <WellnessCheckin />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="7-Day Adherence"
          value={`${adherenceRate}%`}
          sub="Completed days; today counts when complete."
          icon={TrendingUp}
          accent="primary"
        />
        <StatCard
          label="Consistency Streak"
          value={`${streak} day${streak !== 1 ? "s" : ""}`}
          sub="Days with full adherence"
          icon={Flame}
          accent="amber"
        />
        <div className="col-span-2 sm:col-span-1">
          <StatCard
            label="Low Stock Warning"
            value={`${summary.lowStock} supplement${summary.lowStock !== 1 ? "s" : ""}`}
            sub={summary.lowStock ? lowStockNames : "All stocked"}
            icon={AlertTriangle}
            accent="destructive"
          />
        </div>
      </div>

      {/* Correlation chart */}
      <div className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-6">
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Adherence vs. Energy &amp; Focus</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Higher adherence tracks with better self-reported wellness.
            </p>
          </div>
          <span className="hidden items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex">
            <ArrowUpRight className="h-3 w-3" />
            7-Day View
          </span>
        </div>

        <ChartContainer config={chartConfig} className="mt-4 h-[240px] w-full sm:h-[300px]">
          <ComposedChart data={chartData} margin={{ left: -8, right: 4, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                yAxisId="left"
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 10]}
                fontSize={11}
                hide
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                yAxisId="left"
                dataKey="adherence"
                fill="var(--color-adherence)"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="energy"
                stroke="var(--color-energy)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--color-energy)" }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="focus"
                stroke="var(--color-focus)"
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: "var(--color-focus)" }}
                activeDot={{ r: 5 }}
                connectNulls
              />
          </ComposedChart>
        </ChartContainer>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <LegendDot className="bg-chart-1" label="Adherence %" />
          <LegendDot className="bg-chart-2" label="Energy level" />
          <LegendDot className="bg-chart-3" label="Focus level" />
        </div>
      </div>
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  )
}
