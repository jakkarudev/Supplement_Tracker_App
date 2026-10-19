# Mobile UX Optimization Implementation Plan

> **For agentic workers:** Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the supplement tracker feel intentionally designed for 360-430px mobile screens while preserving the current tablet/desktop layout.

**Architecture:** Keep the current single-page tab shell and shadcn/Tailwind v4 stack. Add a small set of reusable mobile layout primitives, then update each feature surface where the current code has touch target, spacing, safe-area, or overflow pressure.

**Tech Stack:** Next.js 16, React 19, TypeScript, TailwindCSS v4, shadcn/ui, Recharts, lucide-react.

---

## Codebase Analysis

The app is already close to mobile-first structurally: `app/page.tsx` uses a bottom nav below `sm`, feature views are card-based, inputs use shadcn defaults, and `app/layout.tsx` already exports a viewport config. The mobile optimization should be focused and should not introduce routing, a backend, or a new component library.

Main risks found in code:

- `app/page.tsx:44` uses a fixed `pb-28`, while the mobile nav at `app/page.tsx:102` is fixed at `bottom-3` without safe-area handling. This can collide with iOS home indicators and waste vertical space on shorter screens.
- `app/page.tsx:46` makes the header sticky on all viewport sizes. On mobile, that consumes persistent vertical space above a fixed bottom nav.
- `components/inventory-hub.tsx:101-115` uses `h-8 w-8` icon buttons, below the recommended 44x44px mobile touch target.
- `components/supplement-form.tsx:390-393` uses a `h-9 w-9` remove-time button, also below 44x44px.
- `components/supplement-form.tsx:467-486` uses a single horizontal sentence with `whitespace-nowrap`; this can overflow narrow screens.
- `components/supplement-form.tsx:492-505` keeps Cancel and Save in a right-aligned row; on mobile the primary action should be full-width and stable above the bottom nav.
- `components/biomarker-dashboard.tsx:60-68` keeps the page title and wellness check-in button in one row; this is likely cramped under 390px.
- `components/biomarker-dashboard.tsx:109-160` renders a 300px chart with negative left margin; on mobile it needs either tighter axes or a reduced-height presentation.
- `components/week-strip.tsx:26-47` fits at 360px, but the day tiles are visually dense and should use a fixed minimum touch area.
- `components/wellness-checkin.tsx:72-78` uses emoji labels inside the UI, while the rest of the app uses lucide icons.
- `app/globals.css` and `styles/globals.css` both define theme tokens, but only `app/globals.css` is imported. Keep all mobile token changes in `app/globals.css`.

## Design Direction

Use the existing calm health dashboard style, not a marketing app redesign. The mobile version should prioritize quick daily actions:

- Today tab: progress, current doses, and confirm/snooze should remain the fastest path.
- Add tab: form sections should feel shorter, with mobile-appropriate controls and a sticky submit area.
- Dashboard tab: metrics should scan as compact summaries, with chart content legible at 360px.
- Inventory tab: rows should become touch-friendly management cards.

Keep the existing emerald/amber/slate palette. Do not switch to the lavender palette suggested by the generic design-system search because the current app already has a coherent wellness identity and changing palette is outside the mobile optimization scope.

## Files To Modify

- `app/page.tsx`: mobile shell spacing, safe-area bottom nav, mobile header behavior, nav labels/touch targets.
- `app/globals.css`: safe-area utilities, mobile surface radius/padding helpers, reduced-motion support.
- `components/today-routine.tsx`: compact summary, timeline spacing, intake card mobile behavior.
- `components/week-strip.tsx`: stable day tile dimensions and accessibility labels.
- `components/supplement-form.tsx`: section density, mobile schedule controls, restock threshold layout, sticky mobile actions.
- `components/biomarker-dashboard.tsx`: responsive heading, compact stat cards, mobile chart sizing.
- `components/wellness-checkin.tsx`: replace emoji markers with lucide icons and improve trigger sizing.
- `components/inventory-hub.tsx`: 44px action buttons, card layout, low-stock action hierarchy.
- `components/theme-toggle.tsx`: verify 44px interactive area or wrap with an accessible hit target if needed.

## Task 1: Establish Mobile Layout Tokens

- [ ] Add reusable mobile-safe utility classes in `app/globals.css`.

Recommended additions:

```css
@layer utilities {
  .safe-bottom {
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }

  .pb-mobile-nav {
    padding-bottom: calc(6.5rem + env(safe-area-inset-bottom));
  }

  .mobile-surface {
    border-radius: 1.25rem;
    padding: 1rem;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

- [ ] Confirm `styles/globals.css` is unused and leave it untouched unless the app imports it somewhere later.
- [ ] Run `pnpm lint`.

## Task 2: Optimize The App Shell

- [ ] In `app/page.tsx`, replace the static container bottom padding with the safe-area utility:

```tsx
<div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-3 pb-mobile-nav pt-3 sm:px-6 sm:pb-28 sm:pt-5">
```

- [ ] Make the header less vertically expensive on mobile:

```tsx
<header className="glass sticky top-2 z-30 mb-4 flex items-center justify-between rounded-2xl px-3 py-2.5 sm:top-3 sm:mb-6 sm:px-4 sm:py-3">
```

- [ ] Update the mobile bottom nav to include safe-area padding and larger hit targets:

```tsx
<nav className="glass-strong safe-bottom fixed inset-x-2 bottom-0 z-40 flex items-center justify-around rounded-t-2xl px-2 pt-2 sm:hidden">
```

- [ ] Give each nav button a `min-h-14`, `aria-current={active ? "page" : undefined}`, and clear focus-visible ring.
- [ ] Verify the bottom nav does not cover the last form buttons or inventory restock buttons at 360x740 and 390x844.

## Task 3: Improve Today Mobile Flow

- [ ] In `components/today-routine.tsx`, make the progress summary wrap cleanly under 380px by changing the summary row from `flex items-end justify-between` to a mobile column and desktop row:

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
```

- [ ] Reduce mobile card radius/padding on the summary and intake cards while keeping desktop styling:

```tsx
className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-6"
```

- [ ] Reduce the timeline indent on mobile by changing the intake list wrapper to:

```tsx
<div className="ml-3 space-y-3 border-l border-dashed border-border pl-4 sm:ml-[1.1rem] sm:pl-6">
```

- [ ] Adjust the timeline node offset to match the reduced mobile indent.
- [ ] Keep `SlideToConfirm` as the primary action because it prevents accidental intake logging and already uses a 52px track.
- [ ] Add an explicit `aria-label="Snooze intake"` to the snooze button in `IntakeCard`; do not rely only on `title`.

## Task 4: Make Week Strip More Stable

- [ ] In `components/week-strip.tsx`, give each day button a stable mobile touch area:

```tsx
className={cn(
  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2.5 transition-all",
  ...
)}
```

- [ ] Add `aria-label` values such as `Select Monday, June 1` and `aria-pressed={isSelected}`.
- [ ] Keep the single-letter day labels because they are appropriate for a 7-column mobile strip.

## Task 5: Rework Supplement Form For Mobile Completion

- [ ] In `components/supplement-form.tsx`, make `SectionCard` denser on mobile:

```tsx
<section className="glass rounded-[1.25rem] p-4 sm:rounded-3xl sm:p-6">
```

- [ ] Hide section descriptions on very small screens if vertical space is tight:

```tsx
<p className="mt-0.5 hidden text-sm text-muted-foreground min-[390px]:block">{description}</p>
```

- [ ] Increase the day toggle button height from `h-10` to `min-h-11` to meet mobile touch target guidance.
- [ ] Make time inputs full-width on mobile:

```tsx
<div key={idx} className="grid grid-cols-[1fr_44px] items-center gap-2 sm:flex">
  <Input ... className="w-full sm:w-36" />
</div>
```

- [ ] Increase remove-time button to `h-11 w-11` and add `aria-label="Remove time"`.
- [ ] Convert the restock threshold sentence into a stacked mobile layout:

```tsx
className={cn(
  "grid gap-2 transition-opacity sm:flex sm:items-center sm:gap-3",
  watchRestock ? "opacity-100" : "pointer-events-none opacity-40",
)}
```

- [ ] Remove `whitespace-nowrap` from the threshold label/span on mobile; keep it only at `sm`.
- [ ] Make the final action area sticky on mobile:

```tsx
<div className="glass-strong sticky bottom-[5.75rem] z-20 -mx-3 grid gap-2 rounded-2xl p-3 sm:static sm:mx-0 sm:flex sm:justify-end sm:bg-transparent sm:p-0 sm:shadow-none">
```

- [ ] Put Save above Cancel on mobile, full-width, with Cancel as a secondary button. Preserve the desktop row at `sm`.

## Task 6: Adapt Dashboard For Narrow Screens

- [ ] In `components/biomarker-dashboard.tsx`, stack the title and wellness button on mobile:

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
```

- [ ] Make `WellnessCheckin` trigger full-width on mobile and auto-width on `sm`.
- [ ] Reduce stat card padding/radius on mobile and use `grid grid-cols-1 min-[430px]:grid-cols-3 sm:grid-cols-3` only if content remains readable. If not, keep one column below `sm`.
- [ ] Change mobile chart height to `h-[240px] sm:h-[300px]`.
- [ ] Remove the negative chart margin on mobile:

```tsx
<ComposedChart data={chartData} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
```

- [ ] Consider hiding the left Y-axis on mobile only if labels crowd the chart; otherwise keep it for comprehension.
- [ ] Verify legend items wrap without overflow at 360px.

## Task 7: Improve Wellness Check-In Drawer

- [ ] In `components/wellness-checkin.tsx`, replace emoji props with lucide icons such as `Zap` and `Target`.
- [ ] Update `SliderRow` props from `emoji: string` to `icon: typeof Activity`.
- [ ] Increase the drawer trigger touch target:

```tsx
className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground sm:w-auto"
```

- [ ] Ensure slider thumbs remain reachable; if needed, wrap each slider section with extra vertical padding rather than changing shadcn slider internals.

## Task 8: Convert Inventory Rows Into Better Mobile Cards

- [ ] In `components/inventory-hub.tsx`, keep the current row layout for desktop but improve the mobile card structure:

```tsx
<div className="glass rounded-[1.25rem] p-4 transition-all sm:rounded-3xl sm:p-5">
```

- [ ] Move action buttons into a consistent top-right cluster with `h-11 w-11` on mobile and `sm:h-8 sm:w-8` only if desktop density is desired.
- [ ] Add `aria-label={`Edit ${supplement.name}`}` and `aria-label={`Delete ${supplement.name}`}` to the icon buttons.
- [ ] Make long supplement names wrap to two lines instead of forcing the action cluster to wrap unpredictably:

```tsx
<h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-tight">
```

- [ ] Keep restock buttons stacked on mobile, but shorten labels if they wrap poorly:
  - Primary: `Restock on Amazon`
  - Secondary: `Restock on iHerb`

## Task 9: Accessibility And Interaction Pass

- [ ] Search for mobile action buttons smaller than 44px:

```bash
rg -n "h-8 w-8|h-9 w-9|h-10 w-10|size-8|size-9|size-10" app components
```

- [ ] For app-specific interactive controls, raise mobile targets to at least 44x44px. Do not bulk-edit shadcn internals unless a used component is visibly problematic.
- [ ] Add `aria-label` to every icon-only button in app-specific components.
- [ ] Confirm visible `focus-visible` states remain after class changes.
- [ ] Avoid adding hover-only affordances for mobile-only behavior.

## Task 10: Verification

- [ ] Run static checks:

```bash
pnpm lint
pnpm build
```

- [ ] Start the app:

```bash
pnpm dev
```

- [ ] Manually verify at these viewport widths:
  - 360x740: no horizontal scroll, bottom nav does not cover content, form submit area reachable.
  - 390x844: Today flow can confirm and snooze without accidental taps.
  - 430x932: dashboard chart and inventory cards scan cleanly.
  - 768x1024: tablet layout still uses desktop/tab behavior where expected.

- [ ] In browser DevTools, check:
  - No horizontal overflow on `body` or `main`.
  - Bottom nav respects safe-area insets.
  - All app-specific buttons have at least a 44x44px hit area on mobile.
  - Chart labels and legends do not overlap.
  - Form validation messages do not push controls under the fixed bottom nav.

## Suggested Commit Sequence

This folder is not currently a Git repository, so use these as logical checkpoints if the project is later placed under version control:

1. `style: add mobile layout utilities`
2. `fix: improve mobile app shell and nav`
3. `fix: optimize today routine for mobile`
4. `fix: improve supplement form mobile flow`
5. `fix: adapt dashboard and inventory for mobile`
6. `fix: complete mobile accessibility pass`

