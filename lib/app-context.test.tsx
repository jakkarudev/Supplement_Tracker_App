// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  AppProvider,
  AppStateContext,
  useAppDispatch,
  useAppState,
  useTimeFormat,
} from "./app-context"
import { STORAGE_KEY } from "./app-storage"
import type { AppState } from "./app-state"

/**
 * The recovery toast is the seam for what a recovered load tells the user.
 * The toast module is mocked so the message can be asserted as the user
 * reads it, without exporting the internals that build it.
 */
const toastMock = vi.hoisted(() => ({
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: toastMock }))

/**
 * jsdom ships no storage implementation, so the provider gets a simple
 * in-memory one. The storage seam itself is covered by its own tests.
 */
function installLocalStorage() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    clear: () => {
      values.clear()
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  }

  Object.defineProperty(window, "localStorage", {
    value: storage,
    writable: true,
    configurable: true,
  })

  return storage
}

function TimeProbe() {
  const { timeFormat, formatTime } = useTimeFormat()
  const dispatch = useAppDispatch()
  const { supplements } = useAppState()

  return (
    <div>
      <span data-testid="format">{timeFormat}</span>
      <span data-testid="time">{formatTime("23:59")}</span>
      <span data-testid="supplements">
        {supplements.map((supplement) => supplement.id).join(",")}
      </span>
      <button
        type="button"
        onClick={() => dispatch({ type: "SET_TIME_FORMAT", payload: "24h" })}
      >
        switch
      </button>
    </div>
  )
}

const STORED_SUPPLEMENT = {
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

let storage: ReturnType<typeof installLocalStorage>

beforeEach(() => {
  storage = installLocalStorage()
  toastMock.warning.mockClear()
  toastMock.error.mockClear()
  // The recovery path logs the counts it reports; the noise is not the
  // subject of these tests.
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("useTimeFormat", () => {
  it("shows the 12-hour format by default", () => {
    render(
      <AppProvider>
        <TimeProbe />
      </AppProvider>,
    )

    expect(screen.getByTestId("format").textContent).toBe("12h")
    expect(screen.getByTestId("time").textContent).toBe("11:59 PM")
  })

  it("updates the visible times immediately when the preference changes", () => {
    render(
      <AppProvider>
        <TimeProbe />
      </AppProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "switch" }))

    expect(screen.getByTestId("format").textContent).toBe("24h")
    expect(screen.getByTestId("time").textContent).toBe("23:59")
  })

  it("leaves the rest of the state alone and persists the preference", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 3,
        supplements: [STORED_SUPPLEMENT],
        doseLogs: [],
        wellnessLogs: [],
        settings: { timeFormat: "12h" },
      }),
    )

    render(
      <AppProvider>
        <TimeProbe />
      </AppProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "switch" }))

    expect(screen.getByTestId("format").textContent).toBe("24h")
    expect(screen.getByTestId("supplements").textContent).toBe("vitamin-d")

    const persisted = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}")
    expect(persisted.settings).toEqual({ timeFormat: "24h" })
    expect(persisted.supplements).toHaveLength(1)
    expect(persisted.supplements[0].id).toBe("vitamin-d")
  })

  it("falls back to the default format when the state carries no settings", () => {
    const stateWithoutSettings = {
      supplements: [],
      doseLogs: [],
      wellnessLogs: [],
    } as unknown as AppState

    render(
      <AppStateContext.Provider value={stateWithoutSettings}>
        <TimeProbe />
      </AppStateContext.Provider>,
    )

    expect(screen.getByTestId("format").textContent).toBe("12h")
    expect(screen.getByTestId("time").textContent).toBe("11:59 PM")
  })
})

describe("the recovery toast", () => {
  it("reports a repaired display setting without calling it a repaired record", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 3,
        supplements: [],
        doseLogs: [],
        wellnessLogs: [],
        settings: { timeFormat: "half past" },
      }),
    )

    render(
      <AppProvider>
        <TimeProbe />
      </AppProvider>,
    )

    expect(toastMock.warning).toHaveBeenCalledTimes(1)
    const message = String(toastMock.warning.mock.calls[0][0])
    expect(message).toContain("the time display setting was reset to 12-hour")
    expect(message).not.toContain("record was repaired")
    expect(message).toContain("Backup saved as regimen-v1.corrupt.")
  })

  it("reports both the repaired records and the repaired display setting", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 3,
        supplements: [{ ...STORED_SUPPLEMENT, restockReminder: "yes" }],
        doseLogs: [],
        wellnessLogs: [],
        settings: { timeFormat: "half past" },
      }),
    )

    render(
      <AppProvider>
        <TimeProbe />
      </AppProvider>,
    )

    expect(toastMock.warning).toHaveBeenCalledTimes(1)
    const message = String(toastMock.warning.mock.calls[0][0])
    expect(message).toContain("1 record was repaired")
    expect(message).toContain("the time display setting was reset to 12-hour")
    expect(message).toContain("Backup saved as regimen-v1.corrupt.")
  })
})
