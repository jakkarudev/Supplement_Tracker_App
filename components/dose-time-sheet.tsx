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
import {
  formatTimeForDisplay,
  isValidIntakeTime,
  normalizeTimeOfDay,
  type CalendarDate,
} from "@/lib/day-regimen"

type DoseTimeSheetProps = {
  open: boolean
  /** `log` records a first actual time; `correct` edits a recorded one. */
  mode: "log" | "correct"
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalized = normalizeTimeOfDay(value)
    if (normalized === null) {
      setError("Enter a valid time.")
      return
    }
    if (!isValidIntakeTime(logicalDate, normalized)) {
      setError("Enter a time that is not in the future.")
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
            Scheduled for {formatTimeForDisplay(scheduledTime)}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dose-actual-time">Actual time</Label>
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
