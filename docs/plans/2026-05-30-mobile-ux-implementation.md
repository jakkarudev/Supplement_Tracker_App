# Mobile UX/UI Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Optimize the Regimen app for 360px+ mobile screens (iOS + Android) and add PWA installability.

**Architecture:** Surgical Tailwind class fixes across existing components, one new `app/manifest.ts` file, and `next-pwa` integration. No new UI primitives added except a `Drawer` (already installed via `vaul`) for the mobile delete confirmation sheet.

**Tech Stack:** Next.js 16.2.6, React 19, Tailwind CSS 4, shadcn/ui, vaul (Drawer), lucide-react, next-pwa (to install)

> **Note on testing:** This project has no automated test framework. Verification steps are manual browser checks at 360px viewport width using Chrome DevTools Device Mode (iPhone SE preset is 375px — also test custom 360px width). For PWA verification use Lighthouse audit.

---

### Task 1: Foundation — globals.css + layout.tsx

**Files:**
- Modify: `app/globals.css` (lines 147–191, `@layer base` and `@layer utilities`)
- Modify: `app/layout.tsx` (lines 11–16 viewport export, lines 18–40 metadata export)

**Step 1: Fix globals.css — body overscroll, button touch-action, input font-size**

In `app/globals.css`, update the `@layer base` block (currently lines 147–154) to:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    overscroll-behavior-y: contain;
  }
  button,
  [role="button"] {
    touch-action: manipulation;
  }
  input,
  textarea,
  select {
    font-size: 16px;
  }
}
```

**Step 2: Fix layout.tsx — explicit viewport + apple PWA meta**

Replace the `viewport` export in `app/layout.tsx`:

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#12141C' },
  ],
}
```

Add `appleWebApp` to the `metadata` export (after the `icons` block):

```ts
export const metadata: Metadata = {
  title: 'Regimen — Supplement & Medication Tracker',
  description:
    'A premium supplement and medication tracker. Build routines, track adherence, monitor inventory, and measure your wellness margin.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Regimen',
  },
}
```

**Step 3: Verify**

Open the app in Chrome DevTools → Device Mode → set custom width 360px. Confirm:
- Tapping any button feels instant (no 300ms delay)
- Tapping any form input does NOT zoom the page (iOS behavior; test on real device or Safari simulator if available)
- Scrolling to the bottom and releasing does not show Android pull-to-refresh bounce

**Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "fix(mobile): foundation — overscroll, touch-action, input zoom, viewport meta"
```

---

### Task 2: Navigation & Header — app/page.tsx

**Files:**
- Modify: `app/page.tsx` (lines 26–29 `handleTabChange`, line 46 header class, lines 111–113 mobile nav button class)

**Step 1: Add scroll-to-top on tab change**

In `handleTabChange` (lines 26–29), add `window.scrollTo`:

```ts
function handleTabChange(id: TabId) {
  if (id !== "add") setEditingId(null)
  setTab(id)
  window.scrollTo({ top: 0, behavior: 'instant' })
}
```

**Step 2: Fix header safe-area**

On line 46, change `top-2` to `top-[max(0.5rem,env(safe-area-inset-top))]`:

```tsx
<header className="glass sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30 mb-4 flex items-center justify-between rounded-2xl px-3 py-2.5 sm:mb-6 sm:px-4 sm:py-3">
```

(Also remove the redundant `sm:top-3` since the `max()` handles it for all viewports.)

**Step 3: Fix nav label font size and add active:scale-95**

On line 111–113, change `text-[0.65rem]` to `text-xs` and add `active:scale-95`:

```tsx
className={cn(
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/70",
  active ? "text-primary" : "text-muted-foreground",
)}
```

**Step 4: Verify**

At 360px:
- Tap a bottom nav tab → page scrolls to top
- Header should sit below any notch/Dynamic Island (test on iPhone with notch in Safari)
- Nav labels readable at 12px
- Tapping nav buttons shows a subtle scale-down animation

**Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "fix(mobile): header safe-area, nav labels text-xs, scroll-to-top on tab change"
```

---

### Task 3: Week Strip — components/week-strip.tsx

**Files:**
- Modify: `components/week-strip.tsx` (full component rewrite — adds `useEffect`, `useRef`)

**Step 1: Rewrite week-strip.tsx**

Replace the entire file contents with:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const DAYS = ["S", "M", "T", "W", "T", "F", "S"]

function getWeek() {
  const today = new Date()
  const day = today.getDay()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - day)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })
}

export function WeekStrip() {
  const week = getWeek()
  const todayDate = new Date().getDate()
  const [selected, setSelected] = useState(todayDate)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Center the selected day in the scrollable strip
  useEffect(() => {
    const idx = week.findIndex((d) => d.getDate() === selected)
    if (idx !== -1) {
      buttonRefs.current[idx]?.scrollIntoView({
        inline: "center",
        behavior: "smooth",
        block: "nearest",
      })
    }
  }, [selected])

  return (
    <div
      ref={containerRef}
      className="-mx-3 flex items-stretch gap-1.5 overflow-x-auto px-3 scrollbar-hide snap-x snap-mandatory sm:mx-0 sm:gap-2 sm:px-0"
    >
      {week.map((d, i) => {
        const date = d.getDate()
        const isToday = date === todayDate
        const isSelected = date === selected
        return (
          <button
            key={i}
            ref={(el) => { buttonRefs.current[i] = el }}
            type="button"
            onClick={() => setSelected(date)}
            aria-label={d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            aria-pressed={isSelected}
            className={cn(
              "flex min-h-14 w-11 shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2.5 transition-all sm:min-w-0 sm:flex-1",
              isSelected
                ? "border-primary/30 bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "border-border bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            <span className="text-[0.7rem] font-medium uppercase tracking-wide">{DAYS[i]}</span>
            <span className="text-base font-semibold tabular-nums">{date}</span>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                isToday ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
```

**Step 2: Add `scrollbar-hide` utility to globals.css**

In `app/globals.css` `@layer utilities` block, add after the existing utilities:

```css
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

**Step 3: Verify**

At 360px: the week strip should horizontally scroll. Today's day should be centered on first render. Tapping another day scrolls it into center. No horizontal page overflow.

**Step 4: Commit**

```bash
git add components/week-strip.tsx app/globals.css
git commit -m "fix(mobile): week-strip horizontal scroll with snap + scrollIntoView centering"
```

---

### Task 4: IntakeCard StatusBadge inline — components/today-routine.tsx

**Files:**
- Modify: `components/today-routine.tsx` (lines 208–225, `IntakeCard` inner layout)

**Step 1: Move StatusBadge inline with name**

In the `IntakeCard` function, find the inner `<div>` that wraps name/brand/potency/dosage and the sibling `<div>` wrapping `StatusBadge`. Replace:

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
  <div className="flex min-w-0 items-start gap-3">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
      <Pill className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <h4 className="truncate text-[0.95rem] font-semibold leading-tight">{name}</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {brand} · {potency}
      </p>
      <p className="mt-1 text-xs font-medium text-foreground">{dosage}</p>
    </div>
  </div>
  <div className="sm:shrink-0">
    <StatusBadge status={status} />
  </div>
</div>
```

With:

```tsx
<div className="flex min-w-0 items-start gap-3">
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
    <Pill className="h-5 w-5" />
  </span>
  <div className="min-w-0 flex-1">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h4 className="truncate text-[0.95rem] font-semibold leading-tight">{name}</h4>
      <StatusBadge status={status} />
    </div>
    <p className="mt-0.5 text-xs text-muted-foreground">
      {brand} · {potency}
    </p>
    <p className="mt-1 text-xs font-medium text-foreground">{dosage}</p>
  </div>
</div>
```

**Step 2: Verify**

At 360px: each intake card shows the supplement name and its status badge on the same line (or wrapping tightly). No wasted vertical row for the badge alone.

**Step 3: Commit**

```bash
git add components/today-routine.tsx
git commit -m "fix(mobile): intake card — status badge inline with supplement name"
```

---

### Task 5: Supplement Form — components/supplement-form.tsx

**Files:**
- Modify: `components/supplement-form.tsx` (line 364 day buttons, line 474 restock row, line 493 sticky bar)

**Step 1: Fix sticky submit bar bottom offset**

On line 493, replace `bottom-[5.75rem]` with a `calc()` that stacks the nav height + safe area:

```tsx
<div className="glass-strong sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-20 -mx-3 grid gap-2 rounded-2xl p-3 backdrop-blur-sm sm:static sm:mx-0 sm:flex sm:justify-end sm:bg-transparent sm:p-0 sm:shadow-none">
```

**Step 2: Fix day-of-week buttons width + active feedback**

On line 362–368, change `w-12` → `w-11` and add `active:scale-95`:

```tsx
className={cn(
  "min-h-11 w-11 rounded-xl border text-sm font-medium transition-all active:scale-95",
  active
    ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
)}
```

**Step 3: Fix restock threshold row layout**

On line 472–488, replace `grid gap-2 transition-opacity sm:flex sm:items-center sm:gap-3` with `flex flex-wrap items-center gap-2 transition-opacity`:

```tsx
<FormItem
  className={cn(
    "flex flex-wrap items-center gap-2 transition-opacity",
    watchRestock ? "opacity-100" : "pointer-events-none opacity-40",
  )}
>
  <FormLabel className="text-sm text-muted-foreground">
    Remind me when I have
  </FormLabel>
  <FormControl>
    <Input type="number" min={1} {...field} className="h-9 w-20 text-center" />
  </FormControl>
  <span className="text-sm text-muted-foreground">capsules left</span>
</FormItem>
```

**Step 4: Verify**

At 360px:
- Sticky submit bar stays above the bottom nav and doesn't overlap content beneath safe area
- Day-of-week buttons (7 × 44px + 6 × 8px gap = 356px) fit without overflow on 360px width
- Restock threshold reads as a natural sentence on one or two lines

**Step 5: Commit**

```bash
git add components/supplement-form.tsx
git commit -m "fix(mobile): form sticky bar safe-area, day buttons w-11 + active state, restock layout"
```

---

### Task 6: Dashboard — components/biomarker-dashboard.tsx

**Files:**
- Modify: `components/biomarker-dashboard.tsx` (line 36 StatCard padding/radius, line 70 grid, lines 109–130 chart margins/fontSize)

**Step 1: Update stat cards grid to 2 columns on mobile**

On line 70, change `grid-cols-1` to `grid-cols-2`:

```tsx
<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
```

**Step 2: Make the third stat card (Low Stock) span full width on mobile**

The third `<StatCard>` (Low Stock Warning, line 85) needs `col-span-2 sm:col-span-1`:

```tsx
<div className="col-span-2 sm:col-span-1">
  <StatCard
    label="Low Stock Warning"
    value={`${lowStock.length} bottle${lowStock.length !== 1 ? "s" : ""}`}
    sub={lowStock.length ? lowStock.map((s) => s.name.split(" ")[0]).join(", ") : "All stocked"}
    icon={AlertTriangle}
    accent="destructive"
  />
</div>
```

Wrap the first two stat cards similarly so the grid layout is explicit:

```tsx
<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
  <StatCard label="7-Day Adherence" ... />
  <StatCard label="Consistency Streak" ... />
  <div className="col-span-2 sm:col-span-1">
    <StatCard label="Low Stock Warning" ... />
  </div>
</div>
```

**Step 3: Compact StatCard on mobile**

Update the `StatCard` component `<div>` className (line 36):

```tsx
<div className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-5">
```

**Step 4: Fix chart margin and axis fontSize**

On line 110 `<ComposedChart>`, update the `margin` prop and add `fontSize={11}` to both axes:

```tsx
<ComposedChart data={chartData} margin={{ left: -8, right: 4, top: 8, bottom: 0 }}>
  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
  <XAxis
    dataKey="day"
    tickLine={false}
    axisLine={false}
    tickMargin={8}
    stroke="var(--muted-foreground)"
    fontSize={11}
  />
  <YAxis
    yAxisId="left"
    domain={[0, 100]}
    tickLine={false}
    axisLine={false}
    stroke="var(--muted-foreground)"
    fontSize={11}
  />
```

Also update the right YAxis `fontSize` if it exists in the same pattern.

**Step 5: Verify**

At 360px:
- Stat cards show as a 2-column grid with the Low Stock card spanning full width beneath
- Chart Y-axis labels are not clipped on the left edge
- Scrolling the dashboard feels comfortable — significantly less scroll distance than before

**Step 6: Commit**

```bash
git add components/biomarker-dashboard.tsx
git commit -m "fix(mobile): dashboard 2-col stat grid, chart margin fix, compact card padding"
```

---

### Task 7: Inventory Hub — mobile Drawer for delete — components/inventory-hub.tsx

**Files:**
- Modify: `components/inventory-hub.tsx` (add Drawer imports, add `useIsMobile` hook, update `InventoryRow`)

**Step 1: Add `useIsMobile` hook**

At the top of `inventory-hub.tsx`, after the existing imports, add:

```ts
import { useEffect, useState } from "react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}
```

**Step 2: Update `InventoryRow` to use Drawer on mobile**

In `InventoryRow`, replace the `<AlertDialog>` block (lines 110–138) with a conditional:

```tsx
function InventoryRow({ supplement, onEdit }: { supplement: Supplement; onEdit?: (id: string) => void }) {
  const dispatch = useAppDispatch()
  const isMobile = useIsMobile()
  const pct =
    supplement.totalCount > 0
      ? Math.round((supplement.currentCount / supplement.totalCount) * 100)
      : 0
  const isLow = supplement.restockReminder && supplement.currentCount <= supplement.restockThreshold

  function handleDelete() {
    dispatch({ type: "DELETE_SUPPLEMENT", payload: supplement.id })
    toast.success(`${supplement.name} removed`)
  }

  const deleteButton = (
    <button
      type="button"
      aria-label={`Delete ${supplement.name}`}
      title="Delete"
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )

  return (
    <div className={cn("glass rounded-[1.25rem] p-4 transition-all sm:rounded-3xl sm:p-5", isLow && "ring-1 ring-destructive/30")}>
      {/* ... existing content unchanged ... */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onEdit?.(supplement.id)}
          aria-label={`Edit ${supplement.name}`}
          title="Edit"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground sm:h-8 sm:w-8"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

        {isMobile ? (
          <Drawer>
            <DrawerTrigger asChild>{deleteButton}</DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Remove {supplement.name}?</DrawerTitle>
                <DrawerDescription>
                  This will permanently delete this supplement and all its intake history.
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  className="w-full"
                >
                  Delete
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline" className="w-full">Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>{deleteButton}</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {supplement.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this supplement and all its intake history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {/* ... rest of existing content ... */}
    </div>
  )
}
```

> **Important:** Keep all existing JSX for the inventory item content (pill icon, name, low-stock badge, progress bar, etc.) intact. Only the delete button trigger and dialog are replaced above.

**Step 3: Verify the Drawer component exists**

Check that `@/components/ui/drawer` exists:

```bash
ls components/ui/drawer.tsx
```

If it doesn't exist, install it via shadcn:

```bash
npx shadcn@latest add drawer
```

**Step 4: Verify**

At 360px: tapping the trash icon opens a bottom sheet drawer with drag handle, supplement name, description text, and Delete/Cancel buttons. At 640px+: opens the original centered AlertDialog.

**Step 5: Commit**

```bash
git add components/inventory-hub.tsx
git commit -m "fix(mobile): inventory delete — Drawer bottom sheet on mobile, AlertDialog on desktop"
```

---

### Task 8: PWA — manifest + next-pwa

**Files:**
- Create: `app/manifest.ts`
- Modify: `package.json` (add `next-pwa`)
- Modify: `next.config.mjs` (wrap with `withPWA`)

**Step 1: Install next-pwa**

```bash
npm install next-pwa
npm install --save-dev @types/next-pwa
```

**Step 2: Create app/manifest.ts**

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Regimen — Supplement Tracker',
    short_name: 'Regimen',
    description: 'Track your supplements, build routines, monitor inventory.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-light-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
```

**Step 3: Update next.config.mjs**

Check current contents of `next.config.mjs`, then wrap with `withPWA`:

```js
import withPWAInit from 'next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // keep any existing config here
}

export default withPWA(nextConfig)
```

> **Note:** `disable: process.env.NODE_ENV === 'development'` prevents service worker from interfering during dev. The `sw.js` and `workbox-*.js` files are auto-generated into `public/` on production build — add them to `.gitignore`.

**Step 4: Add generated PWA files to .gitignore**

If a `.gitignore` exists, add:
```
public/sw.js
public/workbox-*.js
public/worker-*.js
```

If no `.gitignore` exists, create one with those entries.

**Step 5: Build and verify PWA**

```bash
npm run build
npm run start
```

Then open Chrome → DevTools → Application → Manifest. Confirm:
- Manifest loads with name "Regimen"
- Icons show correctly
- `display: standalone` is set

Run Lighthouse (DevTools → Lighthouse → Mobile → PWA category). Target: green PWA score with "Installable" check passing.

**Step 6: Commit**

```bash
git add app/manifest.ts next.config.mjs .gitignore package.json package-lock.json
git commit -m "feat(pwa): add manifest.ts, next-pwa service worker, apple PWA meta"
```

---

## Summary of All Changes

| Task | File(s) | Change |
|------|---------|--------|
| 1 | `app/globals.css`, `app/layout.tsx` | overscroll, touch-action, input font-size, explicit viewport, apple PWA meta |
| 2 | `app/page.tsx` | header safe-area top, nav text-xs, scroll-to-top, active:scale-95 |
| 3 | `components/week-strip.tsx`, `app/globals.css` | overflow-x-auto snap scroll, scrollbar-hide |
| 4 | `components/today-routine.tsx` | StatusBadge inline with name |
| 5 | `components/supplement-form.tsx` | sticky bar calc env, day button w-11, restock flex-wrap |
| 6 | `components/biomarker-dashboard.tsx` | 2-col grid, chart margin, axis font |
| 7 | `components/inventory-hub.tsx` | Drawer on mobile for delete |
| 8 | `app/manifest.ts`, `next.config.mjs`, `package.json` | PWA manifest + service worker |

## Execution Order

Tasks 1–7 are independent of each other and can be done in any order. Task 8 (PWA) must be done last as it requires `npm run build` verification.

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**
