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
  useAppState: () => ({
    supplements: mocks.supplements,
    doseLogs: [],
    wellnessLogs: [],
    settings: { timeFormat: "12h" },
  }),
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

beforeEach(() => {
  mocks.dispatch.mockClear()
  mocks.supplements = []
})

afterEach(cleanup)

describe("SupplementForm editing an existing supplement", () => {
  it("prefills every field from the stored supplement", () => {
    const stored = supplement({
      form: "Tablet",
      dosage: "1/2 tablets",
      durationDays: 30,
      cycleActiveDays: 6,
      cycleBreakDays: 2,
    })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    expect(fieldValue("Name")).toBe("Vitamin D3")
    expect(fieldValue("Brand")).toBe("Thorne")
    expect(fieldValue("Potency")).toBe("5000 IU")
    expect(fieldValue("Started on")).toBe("2026-01-02")
    const takeForInputs = screen.getAllByText("Take for").map(
      (label) => label.closest('[data-slot="form-item"]')?.querySelector("input") as HTMLInputElement,
    )
    expect(takeForInputs[0]?.value).toBe("30")
    expect(takeForInputs[1]?.value).toBe("6")
    const breakFor = screen.getByText("Break for").closest('[data-slot="form-item"]')
    expect((breakFor?.querySelector("input") as HTMLInputElement).value).toBe("2")
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
      "true",
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

  it.each([
    ["1/4 capsules", "1/4"],
    ["1/3 capsules", "1/3"],
    ["1/2 capsules", "1/2"],
    ["2 capsules", "2"],
  ])("prefills the solid dosage %s", (dosage, expected) => {
    const stored = supplement({ dosage })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe("Capsule")
    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe(expected)
  })

  it.each([
    ["Liquid", "10.5 ml", "e.g. 10", "10.5", "ml"],
    ["Powder", "3.5 g", "e.g. 5", "3.5", "g"],
  ] as const)(
    "prefills a %s dosage with its decimal amount",
    (form, dosage, placeholder, amount, unit) => {
      const stored = supplement({ form, dosage })
      mocks.supplements = [stored]

      render(<SupplementForm editingId={stored.id} />)

      expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe(form)
      expect((screen.getByPlaceholderText(placeholder) as HTMLInputElement).value).toBe(amount)
      expect(screen.getByText(unit)).toBeTruthy()
    },
  )

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
    expect(screen.getByLabelText("Full amount (ml)")).toBeTruthy()
    expect(screen.getByLabelText("Current amount (ml)")).toBeTruthy()
    expect(screen.getByText("ml")).toBeTruthy()
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

  it("resets to defaults when editingId changes to an id with no stored supplement", () => {
    mocks.supplements = [supplement({ id: "supp-1" })]
    const view = render(<SupplementForm editingId="supp-1" />)
    expect(fieldValue("Name")).toBe("Vitamin D3")

    view.rerender(<SupplementForm editingId="supp-missing" />)

    expect(fieldValue("Name")).toBe("")
    expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe("Capsule")
    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("Choose amount")
  })

  it("prefills when the record for a changed editingId arrives later", () => {
    mocks.supplements = [supplement({ id: "supp-1" })]
    const view = render(<SupplementForm editingId="supp-1" />)

    view.rerender(<SupplementForm editingId="supp-2" />)
    expect(fieldValue("Name")).toBe("")

    mocks.supplements = [
      supplement({ id: "supp-1" }),
      supplement({ id: "supp-2", name: "Magnesium", dosage: "3 capsules" }),
    ]
    view.rerender(<SupplementForm editingId="supp-2" />)

    expect(fieldValue("Name")).toBe("Magnesium")
    expect(screen.getByRole("combobox", { name: "Form" }).textContent?.trim()).toBe("Capsule")
    expect(screen.getByRole("combobox", { name: "Dosage" }).textContent?.trim()).toBe("3")
  })

  it.each([".5", "1e3"])("submits a liquid dosage the number input accepts: %s", async (amount) => {
    const stored = supplement({ id: "supp-liquid", form: "Liquid", dosage: "10 ml" })
    mocks.supplements = [stored]

    render(<SupplementForm editingId={stored.id} />)

    fireEvent.change(screen.getByPlaceholderText("e.g. 10"), { target: { value: amount } })
    fireEvent.click(screen.getByRole("button", { name: "Update supplement" }))

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1))
    expect(mocks.dispatch.mock.calls[0][0].payload.dosage).toBe(`${amount} ml`)
  })
})

describe("SupplementForm creating a supplement", () => {
  it("rejects a blank Dosage instead of saving", async () => {
    render(<SupplementForm />)

    fireEvent.click(screen.getByRole("button", { name: "Save supplement" }))

    expect(await screen.findByText("Dosage is required")).toBeTruthy()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
