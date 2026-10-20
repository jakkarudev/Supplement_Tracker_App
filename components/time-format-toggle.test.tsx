// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TimeFormatToggle } from "./time-format-toggle"
import { AppStateContext } from "@/lib/app-context"
import type { AppState } from "@/lib/app-state"

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
}))

vi.mock("@/lib/app-context", async (importOriginal) => ({
  ...(await importOriginal()),
  useAppDispatch: () => mocks.dispatch,
}))

function stateWith(timeFormat: "12h" | "24h"): AppState {
  return {
    supplements: [],
    doseLogs: [],
    wellnessLogs: [],
    settings: { timeFormat },
  }
}

function renderToggle(state: AppState) {
  render(
    <AppStateContext.Provider value={state}>
      <TimeFormatToggle />
    </AppStateContext.Provider>,
  )
}

beforeEach(() => {
  mocks.dispatch.mockClear()
})

afterEach(() => {
  cleanup()
})

describe("TimeFormatToggle", () => {
  it("shows the current format and names the action it takes", () => {
    renderToggle(stateWith("12h"))

    expect(screen.getByText("12h")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Switch to 24-hour time" }),
    ).toBeTruthy()
  })

  it("dispatches the other format when clicked", () => {
    renderToggle(stateWith("12h"))

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to 24-hour time" }),
    )

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "SET_TIME_FORMAT",
      payload: "24h",
    })
  })

  it("offers the 12-hour format when 24-hour is active", () => {
    renderToggle(stateWith("24h"))

    expect(screen.getByText("24h")).toBeTruthy()

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to 12-hour time" }),
    )

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "SET_TIME_FORMAT",
      payload: "12h",
    })
  })
})
