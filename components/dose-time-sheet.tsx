"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppState, useTimeFormat } from "@/lib/app-context"
import {
  isRecordableIntakeTime,
  normalizeTimeOfDay,
  today,
  type CalendarDate,
} from "@/lib/day-regimen"
import { findSpacingConflict } from "@/lib/spacing"

type DoseTimeSheetProps = {
  open: boolean
  /** `log` records a first actual time; `correct` edits a recorded one. */
  mode: "log" | "correct"
  /** The supplement the dose belongs to; a spacing rule is checked against it. */
  supplementId: string
  logicalDate: CalendarDate
  scheduledTime: string
  initialTime: string
  onOpenChange: (open: boolean) => void
  onSave: (takenAt: string) => void
}

const TITLES = {
  log: "Log actual time",
  correct: "Correct actual time",
} as const

export function DoseTimeSheet({
  open,
  mode,
  supplementId,
  logicalDate,
  scheduledTime,
  initialTime,
  onOpenChange,
  onSave,
}: DoseTimeSheetProps) {
  // The parent mounts a fresh sheet for each opening, so the initial value is
  // also the starting draft.
  const [value, setValue] = useState(initialTime)
  const [error, setError] = useState<string | null>(null)
  const { formatTime } = useTimeFormat()
  const { supplements, doseLogs, spacingRules } = useAppState()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (today() !== logicalDate) {
      setError("The day has changed. Reopen this dose to log it.")
      return
    }

    const normalized = normalizeTimeOfDay(value)
    if (normalized === null) {
      setError("Enter a valid time.")
      return
    }
    if (!isRecordableIntakeTime(logicalDate, normalized)) {
      setError("Enter a time that is not in the future.")
      return
    }

    // The spacing rule is a UI-seam check, as the future-time check is: the
    // write model records the time and never rewrites history.
    const conflict = findSpacingConflict(
      { supplements, doseLogs, spacingRules },
      { supplementId, logicalDate, takenAt: normalized },
    )
    if (conflict) {
      const partnerName =
        supplements.find(
          (supplement) => supplement.id === conflict.partnerSupplementId,
        )?.name ?? "the linked supplement"

      setError(
        conflict.earliestSafeTime
          ? `Too close to ${partnerName}. The earliest safe time is ${formatTime(conflict.earliestSafeTime)}.`
          : `Too close to ${partnerName}. No safe time is left in this day.`,
      )
      return
    }

    setError(null)
    onSave(normalized)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
          <DialogDescription>
            Scheduled for {formatTime(scheduledTime)}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dose-actual-time">Actual time</Label>
            {/*
              The native time picker follows the browser and OS convention, so
              it may still show AM/PM while the app is set to 24-hour. The
              in-app preference cannot override it; a custom picker would.
            */}
            <Input
              id="dose-actual-time"
              type="time"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
              aria-invalid={error !== null}
            />
            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
