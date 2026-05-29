# Mobile UX/UI Optimization Design

**Date:** 2026-05-30  
**Approach:** B — Mobile-First Polish + PWA  
**Target:** 360px minimum screen width (iOS + Android), installable PWA  
**Stack:** Next.js 16.2.6, React 19, Tailwind CSS 4, shadcn/ui (vaul, Radix UI)

---

## 1. Foundation & Globals (`app/globals.css`, `app/layout.tsx`)

### globals.css
- Add `overscroll-behavior-y: contain` on `body` to prevent Android pull-to-refresh hijacking.
- Add `touch-action: manipulation` on all `button` and `[role="button"]` elements to eliminate the 300ms tap delay on Android browsers.
- Set `font-size: 16px` on all `input`, `textarea`, and `select` elements to prevent iOS from auto-zooming the page on focus.

### layout.tsx
- Update the `viewport` export to be explicit:
  ```ts
  width: 'device-width', initialScale: 1, maximumScale: 1
  ```
  (`maximumScale: 1` + `font-size: 16px` on inputs together suppress iOS zoom — either alone is insufficient.)
- Add `appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Regimen' }` to the `metadata` export.

---

## 2. Navigation & Header (`app/page.tsx`)

### Sticky header
- Change `top-2` to `top-[max(0.5rem,env(safe-area-inset-top))]` so the header respects the Dynamic Island / notch on modern iPhones.

### Bottom nav labels
- Increase from `text-[0.65rem]` to `text-xs` (12px) — the minimum comfortable readable size.

### Tab change behavior
- On tab change, call `window.scrollTo({ top: 0, behavior: 'instant' })` so the new tab always starts at the top.

### Nav button active states
- Add `active:scale-95 transition-transform` to all nav button elements for tactile touch feedback.

---

## 3. Week Strip (`components/week-strip.tsx`)

At 360px, 7 × 48px buttons in a single row = 336px + gaps, which is too tight.

- Wrap the strip in `overflow-x-auto` with `snap-x snap-mandatory` and `-mx-4 px-4` to bleed edge-to-edge.
- Each day button: add `snap-center shrink-0` with a minimum width of `min-w-[2.75rem]` (44px).
- On mount (and whenever the selected date changes), call `buttonRef.scrollIntoView({ inline: 'center', behavior: 'smooth' })` to center the active day in the viewport.
- Hide the scrollbar via `scrollbar-hide` utility (already defined in globals).

---

## 4. Today Routine & Intake Cards (`components/today-routine.tsx`)

### Progress header
- The header can stay `flex-row` on mobile — the content (day label, progress fraction, percentage) is short enough. Remove the redundant `sm:flex-row` fallback that adds a class-toggle on resize.

### IntakeCard layout
- Move the `StatusBadge` inline with the supplement name rather than rendering it below the pill-info block. This eliminates a wasted row of vertical space per card.
- Exact change: wrap name + badge in `flex items-center gap-2 flex-wrap` so they sit on the same line on most screens and wrap only when the name is very long.

---

## 5. Supplement Form (`components/supplement-form.tsx`)

### Sticky submit bar
- Current: `sticky bottom-[5.75rem]`. This is hardcoded and doesn't stack with `env(safe-area-inset-bottom)` on devices where the safe area inset displaces the nav bar.
- Fix: `sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]`.
- Add `backdrop-blur-sm` so the bar remains readable when content scrolls beneath it.

### Day-of-week buttons
- Change `w-12` to `w-11` so 7 buttons fit on 360px without overflow.
- Add `active:scale-95 transition-transform` for touch feedback.

### Restock threshold row
- Replace `grid gap-2 sm:flex` with `flex flex-wrap items-center gap-2` so the phrase "Remind me when I have [input] capsules left" wraps naturally and reads as a coherent sentence on all screen widths.

---

## 6. Dashboard (`components/biomarker-dashboard.tsx`)

### Stat cards grid
- Change `grid-cols-1 sm:grid-cols-3` → `grid-cols-2 sm:grid-cols-3`.
- The third card (Low Stock Warning) gets `col-span-2 sm:col-span-1` to span the full row on mobile.
- Card padding: compact to `p-4 rounded-[1.25rem]` on mobile (keep `sm:p-5 sm:rounded-3xl`).

### Chart Y-axis
- Set `left: -8` margin on mobile to reclaim label space.
- Reduce axis `fontSize` from `12` to `11` for narrow screens.

---

## 7. Inventory Hub (`components/inventory-hub.tsx`)

### Delete confirmation — mobile Drawer vs. AlertDialog
- `AlertDialog` (centered modal) feels jarring on mobile; a bottom sheet feels native.
- Add a `useIsMobile()` hook that reads `window.innerWidth < 640`.
- Conditionally render: `<Drawer>` (from `vaul`, already installed) on mobile, `<AlertDialog>` on sm+.
- Same state (`deleteTarget`) drives both paths.
- Drawer content:
  ```
  ─────────────────────────────────
    [drag handle]
    Delete "Omega-3 Fish Oil"?
    This action cannot be undone.
    [Delete]           [Cancel]
  ─────────────────────────────────
  ```

---

## 8. PWA Setup

### app/manifest.ts (new file)
Use Next.js 13+ built-in manifest API:
```ts
{
  name: 'Regimen',
  short_name: 'Regimen',
  start_url: '/',
  display: 'standalone',
  background_color: '#0a0a0a',
  theme_color: '#0a0a0a',
  icons: [
    { src: '/icon-light-32x32.png', sizes: '32x32', type: 'image/png' },
    { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
  ]
}
```

### Service worker
- Install `next-pwa` (Workbox wrapper).
- Configure `runtimeCaching` for navigation routes and API routes.
- Provides offline splash + cached page shells.
- Keep to basic caching only (no background sync) per YAGNI.

### Apple meta tags
- Add `appleWebApp` to `metadata` export in `layout.tsx` (covered in Section 1).

---

## Files Changed

| File | Change |
|------|--------|
| `app/globals.css` | `overscroll-behavior-y`, `touch-action`, input font-size |
| `app/layout.tsx` | viewport explicit fields, apple PWA meta |
| `app/page.tsx` | header safe-area, nav labels, scroll-to-top, active states |
| `app/manifest.ts` | new — PWA manifest |
| `components/week-strip.tsx` | overflow scroll + snap + scrollIntoView |
| `components/today-routine.tsx` | IntakeCard StatusBadge inline |
| `components/supplement-form.tsx` | sticky bar calc, day button width + feedback, restock row |
| `components/biomarker-dashboard.tsx` | 2-col grid, chart margin |
| `components/inventory-hub.tsx` | Drawer on mobile for delete confirmation |
| `next.config.mjs` | next-pwa integration |
| `package.json` | add `next-pwa` |
