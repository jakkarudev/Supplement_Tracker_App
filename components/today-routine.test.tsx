// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react"
import { TodayRoutine } from "./today-routine"
import { AppStateContext } from "@/lib/app-context"
import type { AppState } from "@/lib/app-state"
import type { DoseLog, SpacingRule, Supplement } from "@/lib/supplements-data"

const mocks = vi.hoisted(() => ({
  state: {
    supplements: [],
    doseLogs: [],
    wellnessLogs: [],
    spacingRules: [],
    settings: { timeFormat: "12h" },
  } as AppState,
  dispatch: vi.fn(),
}))

vi.mock("@/lib/app-context", async (importOriginal) => ({
  ...(await importOriginal()),
  useAppDispatch: () => mocks.dispatch,
}))

vi.mock("@/components/week-strip", () => ({
  WeekStrip: () => null,
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

window.HTMLElement.prototype.scrollIntoView = vi.fn()

const DATE = "2026-05-04"

const supplement: Supplement = {
  id: "vitamin-d",
  name: "Vitamin D3",
  brand: "Thorne",
  potency: "5000 IU",
  dosage: "1 capsule",
  form: "Capsule",
  startedOn: "2026-05-01",
  days: [0, 1, 2, 3, 4, 5, 6],
  times: ["08:00"],
  totalCount: 60,
  currentCount: 60,
  restockReminder: false,
  restockThreshold: 10,
}

function takenLog(overrides: Partial<DoseLog> = {}): DoseLog {
  return {
    id: "log-1",
    supplementId: supplement.id,
    date: DATE,
    time: "08:00",
    status: "taken",
    inventoryAmount: 1,
    ...overrides,
  }
}

function renderRoutine(date = DATE) {
  render(
    <AppStateContext.Provider value={mocks.state}>
      <TodayRoutine date={date} onSelectDate={vi.fn()} />
    </AppStateContext.Provider>,
  )
}

function slideToConfirm() {
  const slider = screen.getByRole("button", { name: "Slide to confirm dose" })
  fireEvent.pointerDown(slider, { pointerId: 1 })
  fireEvent.pointerUp(window)
  act(() => {
    vi.advanceTimersByTime(320)
  })
}

beforeEach(() => {
  mocks.dispatch.mockClear()
  mocks.state = {
    supplements: [supplement],
    doseLogs: [takenLog({ takenAt: "10:12" })],
    wellnessLogs: [],
    spacingRules: [],
    settings: { timeFormat: "12h" },
  }
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 4, 4, 10, 30))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("TodayRoutine actual intake time", () => {
  it("shows the actual time beside the scheduled slot on a taken dose", () => {
    renderRoutine()

    expect(screen.getByText("Taken at 10:12 AM")).toBeTruthy()
    expect(screen.getByText("08:00 AM")).toBeTruthy()
  })

  it("shows every time in 24-hour form when the preference says so", () => {
    mocks.state = {
      ...mocks.state,
      settings: { timeFormat: "24h" },
    }

    renderRoutine()

    expect(screen.getByText("Taken at 10:12")).toBeTruthy()
    expect(screen.getByText("08:00")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Taken at 10:12" }),
    ).toBeTruthy()
  })

  it("shows no invented actual time for a legacy taken log", () => {
    mocks.state = {
      ...mocks.state,
      doseLogs: [takenLog()],
    }

    renderRoutine()

    expect(screen.queryByText(/^Taken at/)).toBeNull()
    expect(screen.queryByRole("button", { name: /Taken at/ })).toBeNull()
  })

  it("opens the correction sheet from the actual time and saves the new time", () => {
    renderRoutine()

    fireEvent.click(
      screen.getByRole("button", { name: "Taken at 10:12 AM" }),
    )

    expect(screen.getByText("Correct actual time")).toBeTruthy()
    const input = screen.getByLabelText("Actual time") as HTMLInputElement
    expect(input.value).toBe("10:12")

    fireEvent.change(input, { target: { value: "10:05" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "LOG_DOSE",
      payload: {
        supplementId: "vitamin-d",
        date: DATE,
        time: "08:00",
        status: "taken",
        takenAt: "10:05",
      },
    })
  })

  it("dispatches pending when the taken dose is undone", () => {
    renderRoutine()

    fireEvent.click(screen.getByRole("button", { name: /undo/i }))

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "LOG_DOSE",
      payload: {
        supplementId: "vitamin-d",
        date: DATE,
        time: "08:00",
        status: "pending",
      },
    })
  })

  it("shows the actual time read-only on a past day", () => {
    const past = "2026-05-03"
    mocks.state = {
      ...mocks.state,
      doseLogs: [takenLog({ date: past, takenAt: "10:12" })],
    }

    renderRoutine(past)

    expect(screen.getByText("Taken at 10:12 AM")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /Taken at/ })).toBeNull()
  })

  it("opens the time sheet at the current time when a pending dose is confirmed", () => {
    mocks.state = { ...mocks.state, doseLogs: [] }

    renderRoutine()
    slideToConfirm()

    expect(screen.getByText("Log actual time")).toBeTruthy()
    expect(
      (screen.getByLabelText("Actual time") as HTMLInputElement).value,
    ).toBe("10:30")
  })

  it("resets the slider so a cancelled time sheet leaves the dose actionable", () => {
    mocks.state = { ...mocks.state, doseLogs: [] }

    renderRoutine()
    slideToConfirm()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByText("Log actual time")).toBeNull()

    slideToConfirm()

    expect(screen.getByText("Log actual time")).toBeTruthy()
  })
})

describe("TodayRoutine spacing rules", () => {
  const zinc: Supplement = {
    ...supplement,
    id: "zinc",
    name: "Zinc",
    times: ["12:00"],
  }

  const RULE: SpacingRule = {
    id: "rule-1",
    supplementAId: supplement.id,
    supplementBId: "zinc",
    minimumIntervalMinutes: 240,
  }

  it("shows the earliest time a shifted pending dose may be taken", () => {
    mocks.state = {
      ...mocks.state,
      supplements: [supplement, zinc],
      doseLogs: [takenLog({ takenAt: "10:00" })],
      spacingRules: [RULE],
    }

    renderRoutine()

    expect(screen.getByText("Earliest at 02:00 PM")).toBeTruthy()
  })

  it("shows the earliest time in 24-hour form when the preference says so", () => {
    mocks.state = {
      ...mocks.state,
      supplements: [supplement, zinc],
      doseLogs: [takenLog({ takenAt: "10:00" })],
      spacingRules: [RULE],
      settings: { timeFormat: "24h" },
    }

    renderRoutine()

    expect(screen.getByText("Earliest at 14:00")).toBeTruthy()
  })

  it("shows no earliest time when no rule shifts the dose", () => {
    mocks.state = {
      ...mocks.state,
      supplements: [supplement, zinc],
      doseLogs: [takenLog({ takenAt: "10:00" })],
      spacingRules: [],
    }

    renderRoutine()

    expect(screen.queryByText(/^Earliest at/)).toBeNull()
  })

  it("shows a conflict notice on the taken dose and on the partner", () => {
    mocks.state = {
      ...mocks.state,
      supplements: [supplement, zinc],
      doseLogs: [
        takenLog({ takenAt: "10:00" }),
        {
          id: "log-2",
          supplementId: "zinc",
          date: DATE,
          time: "12:00",
          status: "taken",
          takenAt: "09:00",
        },
      ],
      spacingRules: [RULE],
    }

    renderRoutine()

    const notices = screen.getAllByRole("alert")
    expect(notices).toHaveLength(2)
    expect(notices[0].textContent).toMatch(/spacing conflict/i)
    expect(notices[0].textContent).toMatch(/4 hours/)
  })

  it("offers the shifted time as the default in the time sheet", () => {
    mocks.state = {
      ...mocks.state,
      supplements: [supplement, zinc],
      doseLogs: [takenLog({ takenAt: "10:00" })],
      spacingRules: [RULE],
    }

    renderRoutine()

    const sliders = screen.getAllByRole("button", { name: "Slide to confirm dose" })
    fireEvent.pointerDown(sliders[0], { pointerId: 1 })
    fireEvent.pointerUp(window)
    act(() => {
      vi.advanceTimersByTime(320)
    })

    expect((screen.getByLabelText("Actual time") as HTMLInputElement).value).toBe("14:00")
  })
})
