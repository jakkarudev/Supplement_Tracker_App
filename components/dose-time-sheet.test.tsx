// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DoseTimeSheet } from "./dose-time-sheet"
import { AppStateContext } from "@/lib/app-context"
import type { AppState } from "@/lib/app-state"

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

function stateWith(timeFormat: "12h" | "24h"): AppState {
  return {
    supplements: [],
    doseLogs: [],
    wellnessLogs: [],
    settings: { timeFormat },
  }
}

function renderSheet(
  overrides: Partial<SheetProps> = {},
  timeFormat: "12h" | "24h" = "12h",
) {
  const onSave = vi.fn()
  const onOpenChange = vi.fn()

  render(
    <AppStateContext.Provider value={stateWith(timeFormat)}>
      <DoseTimeSheet
        open
        mode="log"
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
})
