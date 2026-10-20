// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SupplementForm } from "./supplement-form"
import type { Supplement } from "@/lib/supplements-data"

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  supplements: [] as unknown[],
}))

vi.mock("@/lib/app-context", () => ({
  useAppState: () => ({ supplements: mocks.supplements, doseLogs: [], wellnessLogs: [] }),
  useAppDispatch: () => mocks.dispatch,
  nanoid: () => "new-id",
}))

vi.mock("@/lib/reminders", () => ({
  requestReminderPermission: vi.fn(async () => ({ status: "granted" })),
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

function supplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: "supp-1",
    name: "Vitamin D3",
    brand: "Thorne",
    potency: "5000 IU",
    form: "Capsule",
    dosage: "2 capsules",
    notes: "Take with dinner",
    purchaseUrl: "https://example.com/d3",
    startedOn: "2026-01-02",
    days: [1, 3, 5],
    times: ["08:00", "20:00"],
    totalCount: 120,
    currentCount: 100,
    restockReminder: true,
    restockThreshold: 20,
    ...overrides,
  }
}

function fieldValue(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value
}

describe("SupplementForm editing an existing supplement", () => {
  beforeEach(() => {
    mocks.dispatch.mockClear()
    mocks.supplements = []
  })

  afterEach(cleanup)

  it("prefills every field from the stored supplement", () => {
    const stored = supplement({ form: "Tablet", dosage: "1/2 tablets", durationDays: 30 })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    expect(fieldValue("Name")).toBe("Vitamin D3")
    expect(fieldValue("Brand")).toBe("Thorne")
    expect(fieldValue("Potency")).toBe("5000 IU")
    expect(fieldValue("Started on")).toBe("2026-01-02")
    const takeFor = screen.getByText("Take for").closest('[data-slot="form-item"]')
    expect((takeFor?.querySelector("input") as HTMLInputElement).value).toBe("30")
    expect(fieldValue("Full amount (tablets)")).toBe("120")
    expect(fieldValue("Current amount (tablets)")).toBe("100")
    expect((screen.getByPlaceholderText("https://...") as HTMLInputElement).value).toBe(
      "https://example.com/d3",
    )
    expect(fieldValue("Remind me when I have")).toBe("20")
    expect(screen.getByPlaceholderText(/fat-containing meal/).textContent).toBe("Take with dinner")
    expect(screen.getByDisplayValue("08:00")).toBeTruthy()
    expect(screen.getByDisplayValue("20:00")).toBeTruthy()

    expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe("Tablet")
    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("1/2")
    expect(screen.getByRole("combobox", { name: "Course length" }).textContent?.trim()).toBe(
      "For a set number of days",
    )
    expect(screen.getByRole("switch", { name: "Restock alert" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("switch", { name: "Take scheduled breaks" }).getAttribute("aria-checked")).toBe(
      "false",
    )

    for (const day of ["Mon", "Wed", "Fri"]) {
      expect(screen.getByRole("button", { name: day }).className).toContain("bg-primary")
    }
    for (const day of ["Sun", "Tue", "Thu", "Sat"]) {
      expect(screen.getByRole("button", { name: day }).className).not.toContain("bg-primary")
    }
  })

  it("saves an untouched edit with the stored values unchanged", async () => {
    const stored = supplement({ id: "supp-2", name: "Magnesium", dosage: "1 capsule" })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)
    fireEvent.click(screen.getByRole("button", { name: "Update supplement" }))

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1))
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_SUPPLEMENT",
      payload: stored,
    })
  })

  it("prefills a liquid dosage with its decimal amount", () => {
    const stored = supplement({ form: "Liquid", dosage: "10.5 ml" })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe("Liquid")
    expect((screen.getByPlaceholderText("e.g. 10") as HTMLInputElement).value).toBe("10.5")
    expect(screen.getByText("ml")).toBeTruthy()
  })

  it("prefills a powder dosage with its decimal amount", () => {
    const stored = supplement({ form: "Powder", dosage: "3.5 g" })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe("Powder")
    expect((screen.getByPlaceholderText("e.g. 5") as HTMLInputElement).value).toBe("3.5")
    expect(screen.getByText("g")).toBeTruthy()
  })

  it("keeps a legacy solid dosage as the current selection and saves it unchanged", async () => {
    const stored = supplement({ id: "supp-legacy", dosage: "1.5 capsules" })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("1.5")

    fireEvent.click(screen.getByRole("button", { name: "Update supplement" }))

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1))
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_SUPPLEMENT",
      payload: stored,
    })
  })

  it("drops a legacy dosage option once a fixed option is chosen", () => {
    const stored = supplement({ id: "supp-legacy", dosage: "1.5 capsules" })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Dosage" }), { key: "Enter" })
    expect(screen.getByRole("option", { name: "1.5" })).toBeTruthy()

    fireEvent.click(screen.getByRole("option", { name: "2" }))

    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("2")
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Dosage" }), { key: "Enter" })
    expect(screen.queryByRole("option", { name: "1.5" })).toBeNull()
  })

  it("clears Dosage only when the user changes Form", () => {
    const stored = supplement({ form: "Tablet", dosage: "1/2 tablets" })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    const formSelect = screen.getByRole("combobox", { name: "Form" })
    fireEvent.keyDown(formSelect, { key: "Enter" })
    fireEvent.click(screen.getByRole("option", { name: "Tablet" }))

    expect(formSelect.textContent?.trim()).toBe("Tablet")
    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("1/2")

    fireEvent.keyDown(formSelect, { key: "Enter" })
    fireEvent.click(screen.getByRole("option", { name: "Liquid" }))

    expect(formSelect.textContent?.trim()).toBe("Liquid")
    expect((screen.getByPlaceholderText("e.g. 10") as HTMLInputElement).value).toBe("")
  })

  it("prefills when the supplement arrives after editingId is set", () => {
    const view = render(<SupplementForm editingId="supp-1" />)

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("")

    mocks.supplements = [supplement({ id: "supp-1" })]
    view.rerender(<SupplementForm editingId="supp-1" />)

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Vitamin D3")
    expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe("Capsule")
    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("2")
  })

  it("keeps in-flight values when an adoption replaces the supplement", () => {
    mocks.supplements = [supplement({ id: "supp-1" })]
    const view = render(<SupplementForm editingId="supp-1" />)

    const name = screen.getByLabelText("Name") as HTMLInputElement
    fireEvent.change(name, { target: { value: "Edited here" } })

    mocks.supplements = [supplement({ id: "supp-1", name: "Adopted elsewhere", dosage: "3 capsules" })]
    view.rerender(<SupplementForm editingId="supp-1" />)

    expect(name.value).toBe("Edited here")
    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("2")
  })

  it("rejects a blank Dosage instead of saving", async () => {
    render(<SupplementForm />)

    fireEvent.click(screen.getByRole("button", { name: "Save supplement" }))

    expect(await screen.findByText("Dosage is required")).toBeTruthy()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
