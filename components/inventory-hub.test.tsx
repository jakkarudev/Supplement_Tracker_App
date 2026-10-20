// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { InventoryHub } from "./inventory-hub"
import type {
  InventoryForecast,
  InventoryRowWithForecast,
} from "@/lib/inventory-forecast"
import type { Inventory } from "@/lib/inventory"
import type { Supplement } from "@/lib/supplements-data"

const mocks = vi.hoisted(() => ({
  inventory: null as Inventory | null,
  dispatch: vi.fn(),
}))

vi.mock("@/lib/app-context", () => ({
  useInventory: () => mocks.inventory,
  useAppDispatch: () => mocks.dispatch,
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

window.HTMLElement.prototype.scrollIntoView = vi.fn()

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

function inventoryWith(
  courseState: InventoryRowWithForecast["courseState"],
  forecast: InventoryForecast | null,
): Inventory {
  const row: InventoryRowWithForecast = {
    supplement,
    courseState,
    ratio: 1,
    percent: 100,
    lowStock: false,
    overdrawn: false,
    forecast,
  }

  return {
    rows: [row],
    summary: {
      current: courseState === "current" ? 1 : 0,
      upcoming: courseState === "upcoming" ? 1 : 0,
      finished: courseState === "finished" ? 1 : 0,
      lowStock: 0,
      overdrawn: 0,
    },
  }
}

beforeEach(() => {
  mocks.dispatch.mockClear()
  mocks.inventory = inventoryWith("current", null)
})

afterEach(cleanup)

describe("InventoryHub forecast copy", () => {
  it("shows the days of inventory and the run-out date on a current row", () => {
    mocks.inventory = inventoryWith("current", {
      status: "projected",
      days: 60,
      runOutDate: "2026-07-03",
      courseEndDate: null,
    })

    render(<InventoryHub />)

    expect(screen.getByText("60 days of inventory")).toBeTruthy()
    expect(screen.getByText(/Runs out July 3/)).toBeTruthy()
  })

  it("shows the course end beside the run-out date when the course ends first", () => {
    mocks.inventory = inventoryWith("current", {
      status: "projected",
      days: 60,
      runOutDate: "2026-07-03",
      courseEndDate: "2026-06-02",
    })

    render(<InventoryHub />)

    expect(screen.getByText("60 days of inventory")).toBeTruthy()
    expect(screen.getByText(/Course ends June 2/)).toBeTruthy()
  })

  it.each([
    [
      { status: "less-than-a-day", days: 0, runOutDate: "2026-05-04" } as const,
      "Less than a day of inventory",
      "Runs out May 4",
    ],
    [
      { status: "beyond-horizon", days: 3650, courseEndDate: null } as const,
      "10+ years of inventory",
      null,
    ],
    [{ status: "out-of-stock" } as const, "Out of stock", null],
    [{ status: "no-upcoming-doses" } as const, "No upcoming doses", null],
  ])("renders the %s edge case", (forecast, headline, secondary) => {
    mocks.inventory = inventoryWith("current", forecast)

    render(<InventoryHub />)

    expect(screen.getByText(headline)).toBeTruthy()
    if (secondary) expect(screen.getByText(new RegExp(secondary))).toBeTruthy()
  })

  it("does not show a forecast on an upcoming row", () => {
    mocks.inventory = inventoryWith("upcoming", null)

    render(<InventoryHub />)

    expect(screen.queryByText(/of inventory/)).toBeNull()
    expect(screen.queryByText(/Runs out/)).toBeNull()
  })
})
