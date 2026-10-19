# Supplement Tracker — Full Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Make the glassmorphic Next.js prototype fully functional with localStorage persistence, real CRUD, intake tracking, snooze, edit/delete, and a live wellness dashboard.

**Architecture:** React Context + useReducer for global state; `useEffect` auto-serializes to `localStorage` on every change; hydrates from localStorage on mount with sample seed data as fallback. No backend, no new runtime dependencies.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · TailwindCSS v4 · react-hook-form · zod · recharts · shadcn/ui · sonner

---

## Task 1: AppContext Data Layer

**Files:**
- Create: `lib/app-context.tsx`
- Modify: `lib/supplements-data.ts` (keep types + seed data, remove todayIntakes mock)
- Modify: `app/layout.tsx` (wrap in AppProvider)
- Modify: `app/page.tsx` (pass setTab down; thread edit state)

### Step 1: Add new types to `lib/supplements-data.ts`

Add these types BELOW the existing types (keep all existing exports intact — seed data still needed as fallback):

```typescript
export type IntakeLog = {
  id: string
  supplementId: string
  date: string        // "YYYY-MM-DD"
  time: string        // "08:00 AM"
  period: "Morning" | "Afternoon" | "Evening" | "Night"
  status: IntakeStatus
}

export type WellnessLog = {
  date: string   // "YYYY-MM-DD"
  energy: number // 1–10
  focus: number  // 1–10
}
```

### Step 2: Create `lib/app-context.tsx`

Full file content:

```tsx
"use client"

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
} from "react"
import {
  type Supplement,
  type IntakeLog,
  type WellnessLog,
  supplements as SEED_SUPPLEMENTS,
} from "./supplements-data"

// ─── State ────────────────────────────────────────────────────────────────────

export type AppState = {
  supplements: Supplement[]
  intakeLogs: IntakeLog[]
  wellnessLogs: WellnessLog[]
}

const INITIAL_STATE: AppState = {
  supplements: SEED_SUPPLEMENTS,
  intakeLogs: [],
  wellnessLogs: [],
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "ADD_SUPPLEMENT"; payload: Supplement }
  | { type: "UPDATE_SUPPLEMENT"; payload: Supplement }
  | { type: "DELETE_SUPPLEMENT"; payload: { id: string } }
  | { type: "LOG_INTAKE"; payload: IntakeLog }
  | { type: "LOG_WELLNESS"; payload: WellnessLog }
  | { type: "HYDRATE"; payload: AppState }

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return action.payload

    case "ADD_SUPPLEMENT":
      return { ...state, supplements: [...state.supplements, action.payload] }

    case "UPDATE_SUPPLEMENT":
      return {
        ...state,
        supplements: state.supplements.map((s) =>
          s.id === action.payload.id ? action.payload : s,
        ),
      }

    case "DELETE_SUPPLEMENT":
      return {
        ...state,
        supplements: state.supplements.filter((s) => s.id !== action.payload.id),
        intakeLogs: state.intakeLogs.filter(
          (l) => l.supplementId !== action.payload.id,
        ),
      }

    case "LOG_INTAKE": {
      const log = action.payload
      const existing = state.intakeLogs.findIndex(
        (l) =>
          l.supplementId === log.supplementId &&
          l.date === log.date &&
          l.time === log.time,
      )
      const updatedLogs =
        existing >= 0
          ? state.intakeLogs.map((l, i) => (i === existing ? log : l))
          : [...state.intakeLogs, log]

      // Decrement currentCount when taken
      const updatedSupplements =
        log.status === "taken"
          ? state.supplements.map((s) => {
              if (s.id !== log.supplementId) return s
              // find dosage quantity (parse number from dosage string, fallback 1)
              const qty = parseInt(s.dosage, 10) || 1
              return {
                ...s,
                currentCount: Math.max(0, s.currentCount - qty),
              }
            })
          : state.supplements

      return { ...state, intakeLogs: updatedLogs, supplements: updatedSupplements }
    }

    case "LOG_WELLNESS": {
      const existing = state.wellnessLogs.findIndex(
        (w) => w.date === action.payload.date,
      )
      const updated =
        existing >= 0
          ? state.wellnessLogs.map((w, i) =>
              i === existing ? action.payload : w,
            )
          : [...state.wellnessLogs, action.payload]
      return { ...state, wellnessLogs: updated }
    }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

type AppContextValue = {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const AppContext = createContext<AppContextValue | null>(null)

const STORAGE_KEY = "regimen-state-v1"

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [hydrated, setHydrated] = React.useState(false)

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as AppState
        // Validate minimal shape
        if (parsed.supplements && parsed.intakeLogs && parsed.wellnessLogs) {
          dispatch({ type: "HYDRATE", payload: parsed })
        }
      }
    } catch {
      // ignore corrupt data — fall back to seed
    }
    setHydrated(true)
  }, [])

  // Persist on every state change (after initial hydration)
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // quota exceeded or private mode — silently ignore
    }
  }, [state, hydrated])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppState must be used inside AppProvider")
  return ctx.state
}

export function useAppDispatch() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppDispatch must be used inside AppProvider")
  return ctx.dispatch
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function todayString(): string {
  return new Date().toISOString().split("T")[0]
}

/** Returns all IntakeLogs for a specific date */
export function useLogsForDate(date: string) {
  const { intakeLogs } = useAppState()
  return intakeLogs.filter((l) => l.date === date)
}

/**
 * Returns adherence % (0–100) for the last 7 days.
 * A "day" is 100% if every scheduled supplement was taken.
 */
export function useAdherenceStats(supplements: Supplement[], intakeLogs: IntakeLog[]) {
  return React.useMemo(() => {
    const days: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split("T")[0]
      const dow = d.getDay()

      const scheduled = supplements.filter((s) => s.days.includes(dow))
      if (scheduled.length === 0) { days.push(100); continue }

      const taken = intakeLogs.filter(
        (l) => l.date === dateStr && l.status === "taken",
      )
      // Count unique supplement taken (any time counts)
      const takenIds = new Set(taken.map((l) => l.supplementId))
      const pct = Math.round((takenIds.size / scheduled.length) * 100)
      days.push(Math.min(pct, 100))
    }

    const avg = Math.round(days.reduce((a, b) => a + b, 0) / days.length)

    // Streak: consecutive days from today going back where pct === 100
    let streak = 0
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i] === 100) streak++
      else break
    }

    return { adherenceRate: avg, streak, days }
  }, [supplements, intakeLogs])
}
```

### Step 3: Wrap app in `AppProvider` — modify `app/layout.tsx`

Add `import { AppProvider } from "@/lib/app-context"` and wrap children:

```tsx
<ThemeProvider ...>
  <AppProvider>
    {children}
  </AppProvider>
</ThemeProvider>
```

### Step 4: Add `editingSupplementId` state to `app/page.tsx`

Add state:
```tsx
const [editingSupplementId, setEditingSupplementId] = useState<string | null>(null)
```

Pass `onEdit` callback to InventoryHub and pass `editingId` + `onEditDone` to SupplementForm so it can enter edit mode:

```tsx
{tab === "add" && (
  <SupplementForm
    editingId={editingSupplementId}
    onDone={() => { setEditingSupplementId(null); setTab("inventory") }}
  />
)}
{tab === "inventory" && (
  <InventoryHub
    onEdit={(id) => { setEditingSupplementId(id); setTab("add") }}
  />
)}
```

### Step 5: Build and lint

```bash
cd /Users/jakkaru/Documents/CodingProjects/Supplement_Tracker_App
pnpm build 2>&1 | tail -30
```

Expected: build succeeds (TypeScript errors ignored per next.config.mjs).

---

## Task 2: TodayRoutine — Real Data + Snooze

**Files:**
- Modify: `components/today-routine.tsx`

### Step 1: Rewrite `TodayRoutine` to use context

```tsx
"use client"

import { useMemo } from "react"
import { Sunrise, Sun, Sunset, Moon, Pill } from "lucide-react"
import { WeekStrip } from "@/components/week-strip"
import { StatusBadge } from "@/components/status-badge"
import { SlideToConfirm } from "@/components/slide-to-confirm"
import {
  useAppState,
  useAppDispatch,
  todayString,
  type IntakeLog,
} from "@/lib/app-context"
import { cn } from "@/lib/utils"
import { nanoid } from "@/lib/nanoid"

const periodMeta: Record<string, { Icon: typeof Sun; label: string }> = {
  Morning:   { Icon: Sunrise, label: "Morning" },
  Afternoon: { Icon: Sun,     label: "Afternoon" },
  Evening:   { Icon: Sunset,  label: "Evening" },
  Night:     { Icon: Moon,    label: "Night" },
}

function getPeriod(time: string): IntakeLog["period"] {
  const [hStr] = time.split(":")
  const h = parseInt(hStr, 10)
  if (h < 12)  return "Morning"
  if (h < 17)  return "Afternoon"
  if (h < 21)  return "Evening"
  return "Night"
}

export function TodayRoutine() {
  const { supplements, intakeLogs } = useAppState()
  const dispatch = useAppDispatch()
  const today = todayString()
  const todayDow = new Date().getDay()

  // Generate today's scheduled intakes merged with any existing logs
  const intakes: IntakeLog[] = useMemo(() => {
    const scheduled: IntakeLog[] = []
    for (const s of supplements) {
      if (!s.days.includes(todayDow)) continue
      for (const time of s.times) {
        const existingLog = intakeLogs.find(
          (l) => l.supplementId === s.id && l.date === today && l.time === time,
        )
        if (existingLog) {
          scheduled.push(existingLog)
        } else {
          scheduled.push({
            id: `${s.id}-${today}-${time}`,
            supplementId: s.id,
            date: today,
            time,
            period: getPeriod(time),
            status: "pending",
          })
        }
      }
    }
    return scheduled
  }, [supplements, intakeLogs, today, todayDow])

  const grouped = useMemo(() => {
    const groups: Record<string, IntakeLog[]> = {}
    for (const intake of intakes) {
      const key = `${intake.period}|${intake.time}`
      groups[key] = groups[key] ? [...groups[key], intake] : [intake]
    }
    return Object.entries(groups).sort((a, b) => {
      const timeA = a[0].split("|")[1]
      const timeB = b[0].split("|")[1]
      return timeA.localeCompare(timeB)
    })
  }, [intakes])

  const logIntake = (log: IntakeLog, status: IntakeLog["status"]) => {
    dispatch({ type: "LOG_INTAKE", payload: { ...log, status } })
  }

  const takenCount = intakes.filter((i) => i.status === "taken").length
  const pct = intakes.length > 0 ? Math.round((takenCount / intakes.length) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <div className="glass rounded-3xl p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4">
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

      <WeekStrip />

      {intakes.length === 0 && (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm text-muted-foreground">No supplements scheduled for today.</p>
          <p className="mt-1 text-xs text-muted-foreground">Add supplements and set a schedule to see them here.</p>
        </div>
      )}

      <div className="space-y-7">
        {grouped.map(([key, items]) => {
          const [period, time] = key.split("|")
          const { Icon } = periodMeta[period] ?? periodMeta.Morning
          return (
            <section key={key} className="relative">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold leading-tight">{period}</h3>
                  <p className="text-xs text-muted-foreground tabular-nums">{time}</p>
                </div>
              </div>
              <div className="ml-[1.1rem] space-y-3 border-l border-dashed border-border pl-6">
                {items.map((intake) => (
                  <IntakeCard
                    key={intake.id}
                    intake={intake}
                    onConfirm={() => logIntake(intake, "taken")}
                    onSnooze={() => logIntake(intake, "snoozed")}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function IntakeCard({
  intake,
  onConfirm,
  onSnooze,
}: {
  intake: IntakeLog
  onConfirm: () => void
  onSnooze: () => void
}) {
  const { supplements } = useAppState()
  const supp = supplements.find((s) => s.id === intake.supplementId)
  if (!supp) return null

  return (
    <div
      className={cn(
        "glass relative rounded-2xl p-4 transition-all",
        intake.status === "taken" && "opacity-75",
      )}
    >
      <span className="absolute -left-[1.95rem] top-6 h-3 w-3 rounded-full border-2 border-background bg-primary" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Pill className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h4 className="truncate text-[0.95rem] font-semibold leading-tight">{supp.name}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{supp.brand} · {supp.potency}</p>
            <p className="mt-1 text-xs font-medium text-foreground">{supp.dosage}</p>
            {supp.notes && (
              <p className="mt-1 text-xs text-muted-foreground italic">{supp.notes}</p>
            )}
          </div>
        </div>
        <StatusBadge status={intake.status} />
      </div>

      {intake.status === "pending" && (
        <div className="mt-4 flex flex-col gap-2">
          <SlideToConfirm onConfirm={onConfirm} />
          <button
            type="button"
            onClick={onSnooze}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card/50 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Moon className="h-3.5 w-3.5" />
            Snooze
          </button>
        </div>
      )}
    </div>
  )
}
```

**Note:** The `nanoid` helper is a tiny inline function — create `lib/nanoid.ts`:

```typescript
export function nanoid(): string {
  return Math.random().toString(36).slice(2, 11)
}
```

### Step 2: Verify in browser
- Navigate to Today tab
- Supplements scheduled for today appear as pending cards
- SlideToConfirm works and marks intake as taken
- Snooze button marks intake as snoozed
- Progress bar updates in real time

---

## Task 3: SupplementForm — Real CRUD (Add + Edit)

**Files:**
- Modify: `components/supplement-form.tsx`

### Step 1: Rewrite SupplementForm with react-hook-form + zod

```tsx
"use client"

import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Boxes, Clock, NotebookPen, Pill, Save, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useAppState, useAppDispatch } from "@/lib/app-context"
import { nanoid } from "@/lib/nanoid"

const WEEK = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
]

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().optional().default(""),
  potency: z.string().optional().default(""),
  form: z.enum(["Capsule", "Tablet", "Liquid", "Powder"]),
  dosage: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  days: z.array(z.number()).min(1, "Select at least one day"),
  time: z.string().min(1, "Time is required"),
  totalCount: z.coerce.number().min(0),
  currentCount: z.coerce.number().min(0),
  restockReminder: z.boolean(),
  restockThreshold: z.coerce.number().min(1),
})

type FormValues = z.infer<typeof schema>

// Converts "08:00" (input[type=time]) ↔ "08:00 AM" (stored)
function toDisplayTime(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const period = h < 12 ? "AM" : "PM"
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`
}
function toInputTime(t: string): string {
  const [time, period] = t.split(" ")
  const [h, m] = time.split(":").map(Number)
  let h24 = h
  if (period === "AM" && h === 12) h24 = 0
  if (period === "PM" && h !== 12) h24 = h + 12
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

type Props = {
  editingId?: string | null
  onDone?: () => void
}

export function SupplementForm({ editingId, onDone }: Props) {
  const { supplements } = useAppState()
  const dispatch = useAppDispatch()
  const editing = editingId ? supplements.find((s) => s.id === editingId) ?? null : null

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      brand: "",
      potency: "",
      form: "Capsule",
      dosage: "",
      notes: "",
      days: [1, 2, 3, 4, 5],
      time: "08:00",
      totalCount: 60,
      currentCount: 60,
      restockReminder: true,
      restockThreshold: 10,
    },
  })

  // Populate form when editing
  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        brand: editing.brand,
        potency: editing.potency,
        form: editing.form,
        dosage: editing.dosage,
        notes: editing.notes ?? "",
        days: editing.days,
        time: editing.times[0] ? toInputTime(editing.times[0]) : "08:00",
        totalCount: editing.totalCount,
        currentCount: editing.currentCount,
        restockReminder: editing.restockReminder,
        restockThreshold: editing.restockThreshold,
      })
    }
  }, [editing, reset])

  const restockEnabled = watch("restockReminder")
  const selectedDays = watch("days")

  const toggleDay = (value: number, current: number[], onChange: (v: number[]) => void) => {
    onChange(current.includes(value) ? current.filter((d) => d !== value) : [...current, value])
  }

  const onSubmit = (values: FormValues) => {
    const supplement = {
      id: editing?.id ?? nanoid(),
      name: values.name,
      brand: values.brand ?? "",
      potency: values.potency ?? "",
      form: values.form,
      dosage: values.dosage ?? "",
      notes: values.notes || undefined,
      days: values.days,
      times: [toDisplayTime(values.time)],
      totalCount: values.totalCount,
      currentCount: values.currentCount,
      restockReminder: values.restockReminder,
      restockThreshold: values.restockThreshold,
    }

    if (editing) {
      dispatch({ type: "UPDATE_SUPPLEMENT", payload: supplement })
      toast.success("Supplement updated", { description: `${supplement.name} has been saved.` })
    } else {
      dispatch({ type: "ADD_SUPPLEMENT", payload: supplement })
      toast.success("Supplement added", { description: `${supplement.name} added to your regimen.` })
      reset()
    }

    onDone?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <SectionCard icon={Pill} title="Supplement details" description="Identify what you're tracking and how much you take.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" placeholder="e.g. Vitamin D3 + K2" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" placeholder="e.g. Thorne" {...register("brand")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="potency">Potency</Label>
            <Input id="potency" placeholder="e.g. 500mg" {...register("potency")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="form">Form</Label>
            <Controller
              name="form"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="form" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Capsule">Capsule</SelectItem>
                    <SelectItem value="Tablet">Tablet</SelectItem>
                    <SelectItem value="Liquid">Liquid</SelectItem>
                    <SelectItem value="Powder">Powder</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dosage">Dosage</Label>
            <Input id="dosage" placeholder="e.g. 1 capsule" {...register("dosage")} />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={NotebookPen} title="Notes" description="Any reminders about how to take this supplement.">
        <Textarea placeholder="e.g. Take with a fat-containing meal for better absorption." rows={3} {...register("notes")} />
      </SectionCard>

      <SectionCard icon={Clock} title="Schedule" description="Choose the days and time you take this supplement.">
        <div className="space-y-5">
          <div className="space-y-2.5">
            <Label>Days of the week *</Label>
            <Controller
              name="days"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {WEEK.map((d) => {
                    const active = field.value.includes(d.value)
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value, field.value, field.onChange)}
                        className={cn(
                          "h-10 w-12 rounded-xl border text-sm font-medium transition-all",
                          active
                            ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                        )}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              )}
            />
            {errors.days && <p className="text-xs text-destructive">{errors.days.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input id="time" type="time" {...register("time")} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Boxes} title="Smart inventory" description="Track your bottle and get restock reminders.">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="totalCount">Total capsules in bottle</Label>
              <Input id="totalCount" type="number" min={0} {...register("totalCount")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentCount">Current count</Label>
              <Input id="currentCount" type="number" min={0} {...register("currentCount")} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/50 p-4">
            <div>
              <p className="text-sm font-medium">Remind me to restock</p>
              <p className="text-xs text-muted-foreground">Get an alert before you run out.</p>
            </div>
            <Controller
              name="restockReminder"
              control={control}
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Restock reminder" />
              )}
            />
          </div>
          <div className={cn("flex items-center gap-3 transition-opacity", restockEnabled ? "opacity-100" : "pointer-events-none opacity-40")}>
            <Label htmlFor="restockThreshold" className="text-sm text-muted-foreground">Remind me when I have</Label>
            <Input id="restockThreshold" type="number" min={1} className="h-9 w-20 text-center" {...register("restockThreshold")} />
            <span className="text-sm text-muted-foreground">capsules left</span>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        {onDone && (
          <Button type="button" variant="outline" size="lg" className="rounded-xl bg-transparent" onClick={onDone}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" className="rounded-xl">
          <Save className="h-4 w-4" />
          {editing ? "Update supplement" : "Save supplement"}
        </Button>
      </div>
    </form>
  )
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Pill
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
```

### Step 2: Build and verify
```bash
pnpm build 2>&1 | tail -20
```

---

## Task 4: InventoryHub — Edit + Delete

**Files:**
- Modify: `components/inventory-hub.tsx`

### Step 1: Add `onEdit` prop and delete action

```tsx
"use client"

import { useState } from "react"
import { ExternalLink, Pencil, Pill, ShoppingCart, Trash2 } from "lucide-react"
import { useAppState, useAppDispatch } from "@/lib/app-context"
import type { Supplement } from "@/lib/supplements-data"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type Props = {
  onEdit?: (id: string) => void
}

export function InventoryHub({ onEdit }: Props) {
  const { supplements } = useAppState()
  const sorted = [...supplements].sort(
    (a, b) => a.currentCount / a.totalCount - b.currentCount / b.totalCount,
  )
  const lowStockCount = supplements.filter((s) => s.currentCount <= s.restockThreshold).length

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {supplements.length} active bottles · {lowStockCount} need restocking
          </p>
        </div>
      </div>
      {supplements.length === 0 && (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm text-muted-foreground">No supplements yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first supplement using the + tab.</p>
        </div>
      )}
      <div className="space-y-3">
        {sorted.map((supp) => (
          <InventoryRow key={supp.id} supplement={supp} onEdit={onEdit} />
        ))}
      </div>
    </div>
  )
}

function InventoryRow({ supplement, onEdit }: { supplement: Supplement; onEdit?: (id: string) => void }) {
  const dispatch = useAppDispatch()
  const pct = Math.round((supplement.currentCount / supplement.totalCount) * 100)
  const isLow = supplement.currentCount <= supplement.restockThreshold

  const handleDelete = () => {
    dispatch({ type: "DELETE_SUPPLEMENT", payload: { id: supplement.id } })
    toast.success("Supplement removed", { description: `${supplement.name} deleted from your regimen.` })
  }

  return (
    <div className={cn("glass rounded-3xl p-5 transition-all", isLow && "ring-1 ring-destructive/30")}>
      <div className="flex items-start gap-4">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", isLow ? "bg-destructive/12 text-destructive" : "bg-secondary text-foreground")}>
          <Pill className="h-5.5 w-5.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[0.95rem] font-semibold leading-tight">{supplement.name}</h3>
            {isLow && (
              <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-destructive">
                Low stock
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{supplement.brand} · {supplement.potency}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full transition-all duration-500", isLow ? "bg-destructive" : pct < 50 ? "bg-accent" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {supplement.currentCount} / {supplement.totalCount}
            </span>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit?.(supplement.id)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={`Edit ${supplement.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive"
                aria-label={`Delete ${supplement.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {supplement.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove {supplement.name} and all its intake history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isLow && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <RestockButton vendor="Amazon" name={supplement.name} primary />
          <RestockButton vendor="iHerb" name={supplement.name} />
        </div>
      )}
    </div>
  )
}

function RestockButton({ vendor, name, primary }: { vendor: string; name: string; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => toast.success(`Opening ${vendor}`, { description: `Restocking ${name} via affiliate link.` })}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98]",
        primary
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
          : "border border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      <ShoppingCart className="h-4 w-4" />
      Quick Restock via {vendor}
      <ExternalLink className="h-3.5 w-3.5 opacity-70" />
    </button>
  )
}
```

---

## Task 5: BiomarkerDashboard — Real Data + Wellness Check-In

**Files:**
- Modify: `components/biomarker-dashboard.tsx`
- Create: `components/wellness-checkin.tsx`

### Step 1: Create `components/wellness-checkin.tsx`

```tsx
"use client"

import { useState } from "react"
import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Slider } from "@/components/ui/slider"
import { useAppDispatch, todayString } from "@/lib/app-context"
import { toast } from "sonner"

export function WellnessCheckin({ todayLog }: { todayLog?: { energy: number; focus: number } }) {
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(false)
  const [energy, setEnergy] = useState(todayLog?.energy ?? 7)
  const [focus, setFocus] = useState(todayLog?.focus ?? 7)

  const handleSave = () => {
    dispatch({
      type: "LOG_WELLNESS",
      payload: { date: todayString(), energy, focus },
    })
    setOpen(false)
    toast.success("Wellness logged", {
      description: `Energy: ${energy}/10 · Focus: ${focus}/10`,
    })
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl gap-2">
          <Heart className="h-4 w-4 text-primary" />
          {todayLog ? "Update today's wellness" : "Log today's wellness"}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="px-4 pb-8">
        <DrawerHeader className="text-center">
          <DrawerTitle>How are you feeling today?</DrawerTitle>
        </DrawerHeader>
        <div className="mx-auto w-full max-w-sm space-y-8 pt-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Energy level</p>
              <span className="text-2xl font-semibold tabular-nums text-primary">{energy}<span className="text-sm text-muted-foreground">/10</span></span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[energy]}
              onValueChange={([v]) => setEnergy(v)}
              className="py-1"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Exhausted</span>
              <span>Energised</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Focus &amp; clarity</p>
              <span className="text-2xl font-semibold tabular-nums text-primary">{focus}<span className="text-sm text-muted-foreground">/10</span></span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[focus]}
              onValueChange={([v]) => setFocus(v)}
              className="py-1"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Brain fog</span>
              <span>Laser focused</span>
            </div>
          </div>
          <Button onClick={handleSave} size="lg" className="w-full rounded-xl">
            Save check-in
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
```

### Step 2: Rewrite `components/biomarker-dashboard.tsx`

Replace to use real data:

```tsx
"use client"

import { useMemo } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { Flame, TrendingUp, AlertTriangle, ArrowUpRight } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { useAppState, useAdherenceStats, todayString } from "@/lib/app-context"
import { WellnessCheckin } from "@/components/wellness-checkin"
import { cn } from "@/lib/utils"

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub: string; icon: typeof Flame;
  accent: "primary" | "amber" | "destructive"
}) {
  const accentMap = {
    primary: "bg-primary/12 text-primary",
    amber: "bg-accent/15 text-accent-foreground dark:text-accent",
    destructive: "bg-destructive/12 text-destructive",
  }
  return (
    <div className="glass rounded-3xl p-5">
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

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function BiomarkerDashboard() {
  const { supplements, intakeLogs, wellnessLogs } = useAppState()
  const { adherenceRate, streak, days: adherenceDays } = useAdherenceStats(supplements, intakeLogs)
  const today = todayString()
  const todayWellness = wellnessLogs.find((w) => w.date === today)

  const lowStock = supplements.filter((s) => s.currentCount <= s.restockThreshold)

  const chartData = useMemo(() => {
    return adherenceDays.map((pct, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const dateStr = d.toISOString().split("T")[0]
      const wellness = wellnessLogs.find((w) => w.date === dateStr)
      return {
        day: DAY_LABELS[d.getDay()],
        adherence: pct,
        energy: wellness?.energy ?? null,
        focus: wellness?.focus ?? null,
      }
    })
  }, [adherenceDays, wellnessLogs])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Adherence &amp; Wellness Margin</h2>
          <p className="mt-1 text-sm text-muted-foreground">The return on investment of your daily routine.</p>
        </div>
        <WellnessCheckin todayLog={todayWellness} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="7-Day Adherence" value={`${adherenceRate}%`} sub="Based on your real intake logs" icon={TrendingUp} accent="primary" />
        <StatCard label="Consistency Streak" value={`${streak} days`} sub="Days with 100% adherence" icon={Flame} accent="amber" />
        <StatCard
          label="Low Stock Warning"
          value={`${lowStock.length} bottles`}
          sub={lowStock.length ? lowStock.map((s) => s.name.split(" ")[0]).join(", ") : "All stocked"}
          icon={AlertTriangle}
          accent="destructive"
        />
      </div>

      <div className="glass rounded-3xl p-5 sm:p-6">
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Adherence vs. Energy &amp; Focus</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Higher adherence tracks with better self-reported wellness.</p>
          </div>
          {adherenceRate >= 80 && (
            <span className="hidden items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex">
              <ArrowUpRight className="h-3 w-3" />
              Positive ROI
            </span>
          )}
        </div>

        <ChartContainer config={chartConfig} className="mt-4 h-[300px] w-full">
          <ComposedChart data={chartData} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis yAxisId="left" domain={[0, 100]} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 10]} hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar yAxisId="left" dataKey="adherence" fill="var(--color-adherence)" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Line yAxisId="right" type="monotone" dataKey="energy" stroke="var(--color-energy)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--color-energy)" }} activeDot={{ r: 5 }} connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="focus" stroke="var(--color-focus)" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 3, fill: "var(--color-focus)" }} activeDot={{ r: 5 }} connectNulls />
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
```

### Step 3: Final build + lint check

```bash
cd /Users/jakkaru/Documents/CodingProjects/Supplement_Tracker_App
pnpm build 2>&1 | tail -30
pnpm lint 2>&1 | tail -20
```

Expected: Build succeeds, lint passes.

---

## Verification Checklist

After all 5 tasks are complete:

- [ ] Add a new supplement via the form → appears in Inventory + Today tabs
- [ ] Slide to confirm intake → status changes to "taken", inventory count decrements
- [ ] Snooze an intake → status changes to "snoozed" with moon icon
- [ ] Edit a supplement → changes reflected everywhere
- [ ] Delete a supplement → removed from all views with confirm dialog
- [ ] Log wellness check-in → chart updates with real energy/focus dots
- [ ] Reload the page → all data persists from localStorage
- [ ] Dark mode toggle works throughout
- [ ] Empty state messages show when no supplements added
