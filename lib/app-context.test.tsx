// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  AppProvider,
  useAppDispatch,
  useAppState,
  useTimeFormat,
} from "./app-context"
import { STORAGE_KEY } from "./app-storage"

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
})

afterEach(() => {
  cleanup()
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
})
