# Supplement Tracker — Full Implementation Design
**Date:** 2026-05-29  
**Stack:** Next.js 16 · TypeScript · TailwindCSS v4 · React Context

> **Historical**: the persistence key and schema described below are superseded by [ADR 0004](../adr/0004-version-the-persisted-app-state.md).

---

## Summary
Transform the existing glassmorphic UI prototype into a fully functional, offline-first supplement tracker. All data persists to `localStorage`. No backend. Zero new runtime dependencies.

---

## 1. Data Layer (React Context + useReducer + localStorage)

**File:** `lib/app-context.tsx`

### State Shape
```ts
AppState {
  supplements: Supplement[]
  intakeLogs: IntakeLog[]     // includes date field (YYYY-MM-DD)
  wellnessLogs: WellnessLog[] // one per day
}
```

### New Types
```ts
IntakeLog {
  id: string
  supplementId: string
  date: string       // "YYYY-MM-DD"
  time: string       // "08:00 AM"
  period: Period
  status: "taken" | "pending" | "snoozed"
}

WellnessLog {
  date: string  // "YYYY-MM-DD"
  energy: number   // 1-10
  focus: number    // 1-10
}
```

### Persistence
- `useEffect` on state → `localStorage.setItem("regimen-state", JSON.stringify(state))`
- On mount → hydrate from localStorage, fallback to seed data (5 sample supplements)

### Intake Generation
`TodayRoutine` generates today's scheduled intakes by:
1. Filtering supplements where `days[]` includes `new Date().getDay()`
2. For each supplement × time, creating an IntakeLog if one doesn't already exist for today
3. Merging with persisted logs for today's date

---

## 2. Actions

| Action | Payload | Side Effect |
|---|---|---|
| `ADD_SUPPLEMENT` | `Supplement` | Seeds today's pending intakes if today is in schedule |
| `UPDATE_SUPPLEMENT` | `Supplement` | Replaces by id; re-evaluates today's intakes |
| `DELETE_SUPPLEMENT` | `{ id }` | Removes supplement + all its logs |
| `LOG_INTAKE` | `{ id, status }` | Upserts log; if `taken` → decrements `currentCount` |
| `LOG_WELLNESS` | `{ energy, focus }` | Upserts today's wellness entry |

---

## 3. UI Changes

### Today's Routine
- Reads from context (dynamic, not mock data)
- Pending cards: `SlideToConfirm` + small `Snooze` button
- Snooze dispatches `LOG_INTAKE` with `status: "snoozed"`
- Inventory auto-decrements on confirm

### Supplement Form (Add + Edit)
- Wired with `react-hook-form` + `zod` validation
- Accepts optional `supplement` prop for edit mode
- On submit → `ADD_SUPPLEMENT` or `UPDATE_SUPPLEMENT`
- Cancel returns to Inventory or Today tab

### Inventory Hub
- Reads real supplements from context
- Each row: Edit button (opens form in edit mode) + Delete button (confirm dialog)

### Biomarker Dashboard
- Adherence %, streak, and chart calculated from real `intakeLogs`
- "Log Today's Wellness" button → bottom sheet with Energy + Focus sliders (1–10)
- Chart updates immediately after logging

---

## 4. Adherence Calculations

```
7-day adherence:
  For each of last 7 days:
    scheduled = supplements with that day in their days[]
    taken = intakeLogs where date=that day AND status="taken"
    dayPct = taken / scheduled * 100

  adherenceRate = avg(dayPct) across 7 days

Streak:
  Count consecutive days ending today where dayPct >= 100%
```

---

## Task IDs (for implementation tracking)
- TASK-1: Data layer (AppContext, reducer, localStorage)
- TASK-2: TodayRoutine wiring + snooze
- TASK-3: SupplementForm CRUD (add + edit)
- TASK-4: InventoryHub edit/delete
- TASK-5: BiomarkerDashboard real data + wellness check-in
