"use client"

import { useState } from "react"
import { Activity, Target, Zap } from "lucide-react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useAppState, useAppDispatch } from "@/lib/app-context"
import { today } from "@/lib/day-regimen"

export function WellnessCheckin() {
  const dispatch = useAppDispatch()
  const { wellnessLogs } = useAppState()
  const [open, setOpen] = useState(false)

  const todayLog = wellnessLogs.find((w) => w.date === today())
  const [energy, setEnergy] = useState(todayLog?.energy ?? 7)
  const [focus, setFocus] = useState(todayLog?.focus ?? 7)

  function handleOpenChange(next: boolean) {
    if (next) {
      // Re-seed sliders from today's log whenever the drawer opens
      const log = wellnessLogs.find((w) => w.date === today())
      setEnergy(log?.energy ?? 7)
      setFocus(log?.focus ?? 7)
    }
    setOpen(next)
  }

  function handleSave() {
    dispatch({
      type: "LOG_WELLNESS",
      payload: { date: today(), energy, focus },
    })
    toast.success("Wellness logged", {
      description: `Energy ${energy}/10 · Focus ${focus}/10`,
    })
    setOpen(false)
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground sm:w-auto"
        >
          <Activity className="h-4 w-4 text-primary" />
          Log wellness
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Daily wellness check-in</DrawerTitle>
            <DrawerDescription>
              How are you feeling today? Your data helps track supplement effectiveness.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 py-2 space-y-8">
            <SliderRow
              label="Energy"
              icon={Zap}
              value={energy}
              onChange={setEnergy}
            />
            <SliderRow
              label="Focus"
              icon={Target}
              value={focus}
              onChange={setFocus}
            />
          </div>
          <DrawerFooter>
            <Button onClick={handleSave} size="lg" className="rounded-xl">
              Save check-in
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" size="lg" className="rounded-xl bg-transparent">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function SliderRow({
  label,
  icon: Icon,
  value,
  onChange,
}: {
  label: string
  icon: typeof Activity
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-2xl font-bold tabular-nums text-primary">{value}</span>
      </div>
      <Slider
        min={1}
        max={10}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
      <div className="flex justify-between text-[0.65rem] text-muted-foreground">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  )
}
