"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Boxes, Clock, Link, NotebookPen, Pill, Plus, Save, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useAppState, useAppDispatch, nanoid } from "@/lib/app-context"
import { requestReminderPermission } from "@/lib/reminders"
import { today } from "@/lib/day-regimen"
import {
  SOLID_DOSAGE_OPTIONS,
  dosageUnitForForm,
  formatDosage,
  inventoryUnitPlural,
  isSolidForm,
  parseDosageValueForForm,
} from "@/lib/dosage"
import { SUPPLEMENT_FORMS } from "@/lib/supplements-data"

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
  brand: z.string().optional(),
  potency: z.string().optional(),
  form: z.enum(SUPPLEMENT_FORMS),
  dosage: z.string().min(1, "Dosage is required"),
  notes: z.string().optional(),
  startedOn: z.string().min(1, "Start date is required"),
  durationMode: z.enum(["ongoing", "limited"]).default("ongoing"),
  durationDays: z.coerce.number().optional(),
  cycleEnabled: z.boolean().default(false),
  cycleActiveDays: z.coerce.number().optional(),
  cycleBreakDays: z.coerce.number().optional(),
  days: z.array(z.number()).min(1, "Select at least one day"),
  totalCount: z.coerce.number().min(0).default(60),
  currentCount: z.coerce.number().min(0).default(60),
  purchaseUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => {
      if (!value) return true
      try {
        const url = new URL(value)
        return url.protocol === "http:" || url.protocol === "https:"
      } catch {
        return false
      }
    }, "Enter a valid http or https URL"),
  restockReminder: z.boolean().default(true),
  restockThreshold: z.coerce.number().min(1).default(10),
}).refine((v) => v.currentCount <= v.totalCount, {
  message: "Current amount cannot exceed the full amount",
  path: ["currentCount"],
}).refine((v) => !v.restockReminder || v.restockThreshold <= v.totalCount, {
  message: "Threshold cannot exceed the full amount",
  path: ["restockThreshold"],
}).refine((v) => !isSolidForm(v.form) || SOLID_DOSAGE_OPTIONS.includes(v.dosage), {
  message: "Choose a dosage",
  path: ["dosage"],
}).refine((v) => isSolidForm(v.form) || Number(v.dosage) > 0, {
  message: "Enter an amount greater than 0",
  path: ["dosage"],
}).refine((v) => v.durationMode === "ongoing" || Number(v.durationDays) > 0, {
  message: "Enter how many days to take it",
  path: ["durationDays"],
}).refine((v) => !v.cycleEnabled || Number(v.cycleActiveDays) > 0, {
  message: "Enter active days",
  path: ["cycleActiveDays"],
}).refine((v) => !v.cycleEnabled || Number(v.cycleBreakDays) > 0, {
  message: "Enter break days",
  path: ["cycleBreakDays"],
})

type FormValues = z.infer<typeof schema>

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
    <section className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-6">
      <div className="mb-4 flex items-start gap-3 sm:mb-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          <p className="mt-0.5 hidden text-sm text-muted-foreground min-[390px]:block">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

type Props = {
  editingId?: string | null
  onDone?: () => void
}

export function SupplementForm({ editingId, onDone }: Props) {
  const { supplements } = useAppState()
  const dispatch = useAppDispatch()
  const editing = supplements.find((s) => s.id === editingId) ?? null

  const defaultValues: FormValues = {
    name: "",
    brand: "",
    potency: "",
    form: "Capsule",
    dosage: "",
    notes: "",
    startedOn: today(),
    durationMode: "ongoing",
    durationDays: undefined,
    cycleEnabled: false,
    cycleActiveDays: undefined,
    cycleBreakDays: undefined,
    days: [1, 2, 3, 4, 5],
    totalCount: 60,
    currentCount: 60,
    purchaseUrl: "",
    restockReminder: true,
    restockThreshold: 10,
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const [timeInputs, setTimeInputs] = useState<string[]>(["08:00"])

  // Reset form when editingId changes
  useEffect(() => {
    if (editing) {
      form.reset({
        name: editing.name,
        brand: editing.brand ?? "",
        potency: editing.potency ?? "",
        form: editing.form,
        dosage: parseDosageValueForForm(editing.form, editing.dosage ?? ""),
        notes: editing.notes ?? "",
        startedOn: editing.startedOn,
        durationMode: editing.durationDays ? "limited" : "ongoing",
        durationDays: editing.durationDays,
        cycleEnabled: Boolean(editing.cycleActiveDays && editing.cycleBreakDays),
        cycleActiveDays: editing.cycleActiveDays,
        cycleBreakDays: editing.cycleBreakDays,
        days: editing.days,
        totalCount: editing.totalCount,
        currentCount: editing.currentCount,
        purchaseUrl: editing.purchaseUrl ?? "",
        restockReminder: editing.restockReminder,
        restockThreshold: editing.restockThreshold,
      })
      setTimeInputs(editing.times)
    } else {
      form.reset(defaultValues)
      setTimeInputs(["08:00"])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  const watchDays = form.watch("days")
  const watchRestock = form.watch("restockReminder")
  const watchForm = form.watch("form")
  const watchDurationMode = form.watch("durationMode")
  const watchCycleEnabled = form.watch("cycleEnabled")
  const previousFormRef = useRef<FormValues["form"] | null>(null)

  const dosagePlaceholder = useMemo(() => {
    if (watchForm === "Liquid") return "e.g. 10"
    if (watchForm === "Powder") return "e.g. 5"
    return "Choose amount"
  }, [watchForm])

  useEffect(() => {
    if (previousFormRef.current && previousFormRef.current !== watchForm) {
      form.setValue("dosage", "", { shouldValidate: true })
    }
    previousFormRef.current = watchForm
  }, [watchForm, form])

  function toggleDay(value: number) {
    const current = form.getValues("days")
    const next = current.includes(value) ? current.filter((d) => d !== value) : [...current, value]
    form.setValue("days", next, { shouldValidate: true })
  }

  function addTime() {
    setTimeInputs((prev) => [...prev, "08:00"])
  }

  function removeTime(idx: number) {
    setTimeInputs((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateTime(idx: number, value: string) {
    setTimeInputs((prev) => prev.map((t, i) => (i === idx ? value : t)))
  }

  async function onSubmit(values: FormValues) {
    // The supplement can disappear while this form is open: deleted in
    // another tab, or an adoption replaced the store. Saving the old record
    // would resurrect an intentional deletion, so report it instead.
    if (editingId && !editing) {
      toast.error("This supplement no longer exists", {
        description: "Your changes were not saved.",
      })
      onDone?.()
      return
    }

    // Deduplicate canonical times before saving
    const times = [...new Set(timeInputs.filter(Boolean))]
    const purchaseUrl = values.purchaseUrl?.trim() || undefined
    const dosage = formatDosage(values.form, values.dosage)
    const durationDays = values.durationMode === "limited" ? values.durationDays : undefined
    const cycleActiveDays = values.cycleEnabled ? values.cycleActiveDays : undefined
    const cycleBreakDays = values.cycleEnabled ? values.cycleBreakDays : undefined

    // Ask from the save gesture, while the decision is still pending. The
    // dispatch below then triggers a sync that sees the final permission.
    // A failed request must not block the save.
    await requestReminderPermission()

    if (editing) {
      dispatch({
        type: "UPDATE_SUPPLEMENT",
        payload: {
          ...editing,
          name: values.name,
          brand: values.brand ?? "",
          potency: values.potency ?? "",
          form: values.form,
          dosage,
          notes: values.notes ?? "",
          startedOn: values.startedOn,
          durationDays,
          cycleActiveDays,
          cycleBreakDays,
          days: values.days,
          times,
          totalCount: values.totalCount,
          currentCount: values.currentCount,
          purchaseUrl,
          restockReminder: values.restockReminder,
          restockThreshold: values.restockThreshold,
        },
      })
      toast.success("Supplement updated")
    } else {
      dispatch({
        type: "ADD_SUPPLEMENT",
        payload: {
          id: nanoid(),
          name: values.name,
          brand: values.brand ?? "",
          potency: values.potency ?? "",
          form: values.form,
          dosage,
          notes: values.notes ?? "",
          startedOn: values.startedOn,
          durationDays,
          cycleActiveDays,
          cycleBreakDays,
          days: values.days,
          times,
          totalCount: values.totalCount,
          currentCount: values.currentCount,
          purchaseUrl,
          restockReminder: values.restockReminder,
          restockThreshold: values.restockThreshold,
        },
      })
      toast.success("Supplement added")
    }
    onDone?.()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <SectionCard
          icon={Pill}
          title="Supplement details"
          description="Identify what you're tracking and how much you take."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vitamin D3 + K2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Thorne" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="potency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Potency</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 500mg" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="form"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Form</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select form" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Capsule">Capsule</SelectItem>
                      <SelectItem value="Tablet">Tablet</SelectItem>
                      <SelectItem value="Liquid">Liquid</SelectItem>
                      <SelectItem value="Powder">Powder</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dosage"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Dosage</FormLabel>
                  <FormControl>
                    {isSolidForm(watchForm) ? (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={dosagePlaceholder} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SOLID_DOSAGE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          placeholder={dosagePlaceholder}
                          {...field}
                        />
                        <span className="w-10 text-sm text-muted-foreground">
                          {dosageUnitForForm(watchForm)}
                        </span>
                      </div>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SectionCard>

        <SectionCard
          icon={NotebookPen}
          title="Notes"
          description="Any reminders about how to take this supplement."
        >
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="e.g. Take with a fat-containing meal for better absorption."
                    rows={3}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </SectionCard>

        <SectionCard
          icon={Clock}
          title="Schedule"
          description="Choose the days and times you take this supplement."
        >
          <div className="space-y-5">
            <FormField
              control={form.control}
              name="days"
              render={() => (
                <FormItem>
                  <FormLabel>Days of the week</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {WEEK.map((d) => {
                      const active = watchDays.includes(d.value)
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleDay(d.value)}
                          className={cn(
                            "min-h-11 w-11 rounded-xl border text-sm font-medium transition-all active:scale-95",
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label>Times</Label>
              <div className="space-y-2">
                {timeInputs.map((t, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_44px] items-center gap-2 sm:flex">
                    <Input
                      type="time"
                      value={t}
                      onChange={(e) => updateTime(idx, e.target.value)}
                      className="w-full sm:w-36"
                    />
                    {timeInputs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTime(idx)}
                        aria-label="Remove time"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-secondary hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTime}
                  className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add another time
                </button>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={Clock}
          title="Regimen timeline"
          description="Control when this supplement starts, runs, and pauses."
        >
          <div className="space-y-5">
            <FormField
              control={form.control}
              name="startedOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Started on</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="durationMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course length</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="limited">For a set number of days</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchDurationMode === "limited" && (
              <FormField
                control={form.control}
                name="durationDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Take for</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} inputMode="numeric" {...field} />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="cycleEnabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/50 p-4">
                    <div>
                      <p className="text-sm font-medium">Take scheduled breaks</p>
                      <p className="text-xs text-muted-foreground">
                        Pause this supplement after active cycles.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label="Take scheduled breaks"
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            {watchCycleEnabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="cycleActiveDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Take for</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cycleBreakDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Break for</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          icon={Boxes}
          title="Smart inventory"
          description="Track what you have on hand and get low-stock warnings."
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="totalCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full amount ({inventoryUnitPlural(watchForm)})</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currentCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current amount ({inventoryUnitPlural(watchForm)})</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="purchaseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase link</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="url"
                        inputMode="url"
                        placeholder="https://..."
                        className="pl-9"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="restockReminder"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/50 p-4">
                    <div>
                      <p className="text-sm font-medium">Restock alert</p>
                      <p className="text-xs text-muted-foreground">Show a warning when this supplement is low stock.</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label="Restock alert"
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="restockThreshold"
              render={({ field }) => (
                <FormItem
                  className={cn(
                    "flex flex-wrap items-center gap-2 transition-opacity",
                    watchRestock ? "opacity-100" : "pointer-events-none opacity-40",
                  )}
                >
                  <FormLabel className="text-sm text-muted-foreground">
                    Remind me when I have
                  </FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} className="h-9 w-20 text-center" />
                  </FormControl>
                  <span className="text-sm text-muted-foreground">{inventoryUnitPlural(watchForm)} left</span>
                </FormItem>
              )}
            />
          </div>
        </SectionCard>

        <div className="glass-strong sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-20 -mx-3 grid gap-2 rounded-2xl p-3 backdrop-blur-sm sm:static sm:mx-0 sm:flex sm:justify-end sm:bg-transparent sm:p-0 sm:shadow-none">
          <Button type="submit" size="lg" className="w-full rounded-xl sm:w-auto">
            <Save className="h-4 w-4" />
            {editing ? "Update supplement" : "Save supplement"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full rounded-xl bg-transparent sm:w-auto"
            onClick={onDone}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
