// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DoseTimeSheet } from "./dose-time-sheet"
import { AppStateContext } from "@/lib/app-context"
import type { AppState } from "@/lib/app-state"
import type { Supplement } from "@/lib/supplements-data"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

window.HTMLElement.prototype.scrollIntoView = vi.fn()

type SheetProps = React.ComponentProps<typeof DoseTimeSheet>

const copper: Supplement = {
  id: "copper",
  name: "Copper",
  brand: "Now Foods",
  potency: "2 mg",
  dosage: "1 capsule",
  form: "Capsule",
  startedOn: "2026-01-01",
  days: [0, 1, 2, 3, 4, 5, 6],
  times: ["08:00"],
  totalCount: 60,
  currentCount: 60,
  restockReminder: false,
  restockThreshold: 10,
}

const zinc: Supplement = { ...copper, id: "zinc", name: "Zinc", times: ["12:00"] }

function stateWith(timeFormat: "12h" | "24h"): AppState {
  return {
    supplements: [],
    doseLogs: [],
    wellnessLogs: [],
    spacingRules: [],
    settings: { timeFormat },
  }
}

function stateWithRule(timeFormat: "12h" | "24h"): AppState {
  return {
    supplements: [copper, zinc],
    doseLogs: [
      {
        id: "log-1",
        supplementId: "zinc",
        date: "2026-05-04",
        time: "12:00",
        status: "taken",
        takenAt: "09:00",
      },
    ],
    wellnessLogs: [],
    spacingRules: [
      {
        id: "rule-1",
        supplementAId: "copper",
        supplementBId: "zinc",
        minimumIntervalMinutes: 240,
      },
    ],
    settings: { timeFormat },
  }
}

function renderSheet(
  overrides: Partial<SheetProps> = {},
  timeFormat: "12h" | "24h" = "12h",
  state: AppState = stateWith(timeFormat),
) {
  const onSave = vi.fn()
  const onOpenChange = vi.fn()

  render(
    <AppStateContext.Provider value={state}>
      <DoseTimeSheet
        open
        mode="log"
        supplementId="copper"
        logicalDate="2026-05-04"
        scheduledTime="08:00"
        initialTime="10:12"
        onOpenChange={onOpenChange}
        onSave={onSave}
        {...overrides}
      />
    </AppStateContext.Provider>,
  )

  return { onSave, onOpenChange }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("DoseTimeSheet", () => {
  it("prefills the actual time and shows the scheduled slot", () => {
    renderSheet()

    expect((screen.getByLabelText("Actual time") as HTMLInputElement).value).toBe(
      "10:12",
    )
    expect(screen.getByText(/Scheduled for 08:00 AM/)).toBeTruthy()
  })

  it("shows the scheduled slot in 24-hour form when the preference says so", () => {
    renderSheet({}, "24h")

    expect(screen.getByText(/Scheduled for 08:00\./)).toBeTruthy()
    expect(screen.queryByText(/Scheduled for 08:00 AM/)).toBeNull()
  })

  it("uses a different title when correcting an existing time", () => {
    renderSheet({ mode: "correct" })

    expect(screen.getByText("Correct actual time")).toBeTruthy()
  })

  it("rejects a future time with a visible error and does not save", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 4, 10, 0))

    const { onSave } = renderSheet()

    fireEvent.change(screen.getByLabelText("Actual time"), {
      target: { value: "10:01" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(screen.getByRole("alert").textContent).toMatch(/future/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("saves a valid earlier time in canonical form", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 4, 10, 0))

    const { onSave } = renderSheet()

    fireEvent.change(screen.getByLabelText("Actual time"), {
      target: { value: "09:59" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith("09:59")
  })

  it("refuses to save when the logical day has changed since opening", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 4, 4, 59))

    const { onSave } = renderSheet({
      logicalDate: "2026-05-03",
      initialTime: "04:59",
    })

    vi.setSystemTime(new Date(2026, 4, 4, 5, 1))
    fireEvent.change(screen.getByLabelText("Actual time"), {
      target: { value: "05:01" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(screen.getByRole("alert").textContent).toMatch(/day has changed/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("cancels without saving", () => {
    const { onSave, onOpenChange } = renderSheet()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("refuses a time that breaks a spacing rule and names the earliest safe time", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 4, 10, 0))

    const { onSave } = renderSheet({}, "12h", stateWithRule("12h"))

    fireEvent.change(screen.getByLabelText("Actual time"), {
      target: { value: "10:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const alert = screen.getByRole("alert").textContent ?? ""
    expect(alert).toMatch(/earliest safe time/i)
    expect(alert).toMatch(/01:00 PM/)
    expect(alert).toMatch(/Zinc/)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("saves a time that keeps the spacing gap", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 4, 10, 0))

    const { onSave } = renderSheet({}, "12h", stateWithRule("12h"))

    fireEvent.change(screen.getByLabelText("Actual time"), {
      target: { value: "05:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith("05:00")
  })
})
