# Purchase Link Restock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save an optional purchase link for each supplement during create/edit, then open that link from inventory for fast restocking.

**Architecture:** Add an optional `purchaseUrl` field to the existing `Supplement` model, persist it through the current localStorage-backed reducer flow, expose it in `SupplementForm`, and replace the inventory's fake vendor restock buttons with a real link-aware restock action. Existing supplements without the field remain valid through optional typing and form defaults.

**Tech Stack:** Next.js 16, React 19, TypeScript, react-hook-form, zod, TailwindCSS, shadcn/ui, sonner, lucide-react.

---

## Scope Decisions

- Store one optional URL per supplement as `purchaseUrl?: string`.
- Accept full `http://` or `https://` URLs only when provided.
- Keep the field optional, so existing localStorage records and seed supplements keep working.
- Show the inventory restock button whenever a supplement has a purchase link.
- For low-stock supplements without a purchase link, show a secondary action that opens edit mode so the user can add one.
- Open purchase links in a new tab using a real anchor, not a toast-only fake action.
- Do not add affiliate/vendor-specific logic in this pass.

## Files

- Modify: `lib/supplements-data.ts`
  - Add `purchaseUrl?: string` to `Supplement`.
  - Add generic search `purchaseUrl` seed values for the low-stock examples so the inventory UI can be verified immediately.
- Modify: `components/supplement-form.tsx`
  - Add `purchaseUrl` to the zod schema.
  - Add `purchaseUrl` to defaults, edit reset, add payload, and update payload.
  - Add a purchase link input inside the existing `Smart inventory` section.
- Modify: `components/inventory-hub.tsx`
  - Replace vendor-based fake `RestockButton` with a URL-based restock action.
  - Pass `purchaseUrl`, `isLow`, and `onEdit` into the restock area.
  - Ensure external links use `target="_blank"` and `rel="noopener noreferrer"`.
- Optional modify: `docs/plans/2026-05-30-purchase-link-restock-implementation.md`
  - Check off completed steps during implementation.

## Task 1: Extend The Supplement Data Contract

**Files:**
- Modify: `lib/supplements-data.ts`

- [ ] **Step 1: Add the optional field to `Supplement`**

In `lib/supplements-data.ts`, update the `Supplement` type:

```ts
export type Supplement = {
  id: string
  name: string
  brand: string
  potency: string
  dosage: string
  form: SupplementForm
  notes?: string
  purchaseUrl?: string
  days: number[]
  times: string[]
  totalCount: number
  currentCount: number
  restockReminder: boolean
  restockThreshold: number
}
```

- [ ] **Step 2: Add seed links for low-stock examples**

Add `purchaseUrl` only to the low-stock seeds so the inventory feature is visible immediately without making every mock supplement look fully configured. Use generic search URLs instead of specific vendor/product URLs:

For Vitamin D3 + K2:

```ts
purchaseUrl: "https://www.google.com/search?q=Thorne+Vitamin+D3+K2",
```

For Ashwagandha KSM-66:

```ts
purchaseUrl: "https://www.google.com/search?q=Nootropics+Depot+Ashwagandha+KSM-66",
```

- [ ] **Step 3: Run type/lint check**

Run:

```bash
pnpm lint
```

Expected: no new TypeScript or lint errors from the new optional field.

- [ ] **Step 4: Commit**

```bash
git add lib/supplements-data.ts
git commit -m "feat: add supplement purchase link field"
```

## Task 2: Add Purchase Link To Create/Edit Form

**Files:**
- Modify: `components/supplement-form.tsx`

- [ ] **Step 1: Import the link icon**

Update the lucide import to include `Link`:

```ts
import { Boxes, Clock, Link, NotebookPen, Pill, Plus, Save, X } from "lucide-react"
```

- [ ] **Step 2: Add URL validation**

Add `purchaseUrl` to the schema. Empty input should be accepted and normalized later.

```ts
purchaseUrl: z
  .string()
  .trim()
  .optional()
  .refine((value) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }, "Enter a valid http or https URL"),
```

- [ ] **Step 3: Add the default form value**

Update `defaultValues`:

```ts
purchaseUrl: "",
```

- [ ] **Step 4: Populate the field while editing**

In the `form.reset` call for `editing`, add:

```ts
purchaseUrl: editing.purchaseUrl ?? "",
```

- [ ] **Step 5: Normalize the submitted value**

At the top of `onSubmit`, before building the payload, add:

```ts
const purchaseUrl = values.purchaseUrl?.trim() || undefined
```

- [ ] **Step 6: Persist the field on update**

In the `UPDATE_SUPPLEMENT` payload, add:

```ts
purchaseUrl,
```

- [ ] **Step 7: Persist the field on create**

In the `ADD_SUPPLEMENT` payload, add:

```ts
purchaseUrl,
```

- [ ] **Step 8: Add the form control**

Inside the existing `Smart inventory` `SectionCard`, place this field after `currentCount` and before `restockReminder`:

```tsx
<FormField
  control={form.control}
  name="purchaseUrl"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Purchase link</FormLabel>
      <FormControl>
        <div className="relative">
          <Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="url"
            inputMode="url"
            placeholder="https://..."
            className="pl-9"
            {...field}
          />
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

- [ ] **Step 9: Run type/lint check**

Run:

```bash
pnpm lint
```

Expected: no schema, form type, or JSX errors.

- [ ] **Step 10: Commit**

```bash
git add components/supplement-form.tsx
git commit -m "feat: capture supplement purchase links"
```

## Task 3: Replace Fake Inventory Restock Buttons

**Files:**
- Modify: `components/inventory-hub.tsx`

- [ ] **Step 1: Remove vendor assumptions**

Delete the current low-stock block:

```tsx
{isLow && (
  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
    <RestockButton vendor="Amazon" name={supplement.name} primary />
    <RestockButton vendor="iHerb" name={supplement.name} />
  </div>
)}
```

- [ ] **Step 2: Replace it with link-aware inventory actions**

Add this block in the same location:

```tsx
{(isLow || supplement.purchaseUrl) && (
  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
    {supplement.purchaseUrl ? (
      <RestockButton name={supplement.name} href={supplement.purchaseUrl} primary={isLow} />
    ) : (
      <button
        type="button"
        onClick={() => onEdit?.(supplement.id)}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground transition-all hover:border-primary/40 hover:text-primary active:scale-[0.98]"
      >
        <ShoppingCart className="h-4 w-4" />
        Add purchase link
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3: Rewrite `RestockButton`**

Replace the existing `RestockButton` function with:

```tsx
function RestockButton({
  name,
  href,
  primary,
}: {
  name: string
  href: string
  primary?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        toast.success("Opening purchase link", {
          description: `Restocking ${name}.`,
        })
      }
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98]",
        primary
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
          : "border border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      <ShoppingCart className="h-4 w-4" />
      Restock
      <ExternalLink className="h-3.5 w-3.5 opacity-70" />
    </a>
  )
}
```

- [ ] **Step 4: Keep linked restock actions always visible**

Keep the condition from Step 2:

```tsx
{(isLow || supplement.purchaseUrl) && (
```

This makes linked supplements show `Restock` even when stock is not low, matching the requested fast inventory restock workflow.

- [ ] **Step 5: Run type/lint check**

Run:

```bash
pnpm lint
```

Expected: no unused prop/import errors and no anchor/button accessibility lint errors.

- [ ] **Step 6: Commit**

```bash
git add components/inventory-hub.tsx
git commit -m "feat: open purchase links from inventory"
```

## Task 4: Manual Product Verification

**Files:**
- Verify: `components/supplement-form.tsx`
- Verify: `components/inventory-hub.tsx`
- Verify: browser at local dev URL

- [ ] **Step 1: Start the app**

Run:

```bash
pnpm dev
```

Expected: Next starts successfully. Use the localhost URL printed by Next, commonly `http://localhost:3000`.

- [ ] **Step 2: Verify create flow**

In the app:

1. Open `Add Supplement`.
2. Fill required supplement fields.
3. Enter `https://example.com/product` in `Purchase link`.
4. Save.
5. Open `Inventory`.

Expected: the new supplement appears and shows a `Restock` action.

- [ ] **Step 3: Verify edit flow**

In the app:

1. Open `Inventory`.
2. Edit an existing supplement.
3. Add or change the `Purchase link`.
4. Save.
5. Return to `Inventory`.

Expected: the edited supplement shows the new `Restock` action.

- [ ] **Step 4: Verify link behavior**

Click `Restock`.

Expected:

- The link opens in a new browser tab.
- The original app state remains intact.
- A toast says `Opening purchase link`.

- [ ] **Step 5: Verify invalid URL behavior**

In `Add Supplement` or edit mode:

1. Enter `not-a-link` in `Purchase link`.
2. Try to save.

Expected: form blocks submission and shows `Enter a valid http or https URL`.

- [ ] **Step 6: Verify backwards compatibility**

Use a supplement that has no `purchaseUrl`.

Expected:

- It still renders in Today, Dashboard, and Inventory.
- It can still be edited and saved.
- If low stock, it shows `Add purchase link`.
- If not low stock, no restock action is required unless a link is added.

## Task 5: Final Verification

**Files:**
- Check: entire app

- [ ] **Step 1: Run lint**

```bash
pnpm lint
```

Expected: pass.

- [ ] **Step 2: Run production build**

```bash
pnpm build
```

Expected: pass.

- [ ] **Step 3: Check git diff**

```bash
git diff -- lib/supplements-data.ts components/supplement-form.tsx components/inventory-hub.tsx
```

Expected:

- `Supplement` has exactly one new optional field.
- The form persists `purchaseUrl` for add and edit.
- Inventory uses saved URLs rather than hard-coded vendors.
- No unrelated files are changed.

- [ ] **Step 4: Final commit if not already committed task-by-task**

```bash
git add lib/supplements-data.ts components/supplement-form.tsx components/inventory-hub.tsx
git commit -m "feat: add purchase links for restocking"
```
