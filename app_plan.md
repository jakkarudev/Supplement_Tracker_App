```markdown
# Implementation Plan: Offline-First Supplement & Medication Tracker

This document outlines the engineering blueprint for building a local-first, high-performance, and private supplement tracking mobile application using React Native (Expo) and WatermelonDB.

---

## 1. Environment Setup & Architecture

### Tech Stack
*   **Framework:** React Native via Expo Application Services (EAS)
*   **Database:** WatermelonDB (Reactive layer over native SQLite)
*   **Animations:** React Native Reanimated (for 60fps glassmorphic cards and sliders)
*   **Graphics:** `@shopify/react-native-skia` (for hardware-accelerated frosted glass blurs)
*   **Haptics:** `expo-haptics`

### Initial Installation Command
```bash
npx create-expo-app@latest ResuppApp --template blank-typescript
cd ResuppApp
npx expo install @nozbe/watermelondb expo-haptics expo-notifications react-native-reanimated @shopify/react-native-skia expo-background-fetch expo-task-manager

```

---

## 2. Database Schema & Models (WatermelonDB)

To support complex relational matching (Supplements ➔ Schedules ➔ Intake Logs ➔ Wellness Metrics), create a local relational SQLite database schema.

### Schema Definition (`src/db/schema.ts`)

```typescript
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'supplements',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'brand', type: 'string' },
        { name: 'potency', type: 'string' },
        { name: 'form', type: 'string' }, // e.g., 'capsule', 'tablet'
        { name: 'total_pills', type: 'number' },
        { name: 'current_pills', type: 'number' },
        { name: 'low_stock_threshold', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'is_active', type: 'boolean' },
      ]
    }),
    tableSchema({
      name: 'schedules',
      columns: [
        { name: 'supplement_id', type: 'string', isIndexed: true },
        { name: 'days_of_week', type: 'string' }, // Saved as JSON string, e.g., "[1,2,3,4,5]"
        { name: 'time_of_day', type: 'string' },  // Saved as "HH:MM" format
        { name: 'dosage_quantity', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'intake_logs',
      columns: [
        { name: 'supplement_id', type: 'string', isIndexed: true },
        { name: 'scheduled_time', type: 'number' }, // Timestamp
        { name: 'actual_time', type: 'number', isOptional: true }, // Timestamp
        { name: 'status', type: 'string' }, // 'taken' | 'skipped' | 'snoozed'
      ]
    }),
    tableSchema({
      name: 'wellness_metrics',
      columns: [
        { name: 'date', type: 'string', isIndexed: true }, // YYYY-MM-DD
        { name: 'energy_rating', type: 'number' }, // 1-5
        { name: 'focus_rating', type: 'number' },  // 1-5
      ]
    }),
  ]
})

```

---

## 3. Core Feature Engineering

### Phase 1: Local Push Notifications Loop

To guarantee execution without a backend server, utilize the native OS clock via `expo-notifications`.

1. **Scheduling Rules:**
When a user creates/edits a schedule, calculate the next 7 days of matches locally and register them via `Notifications.scheduleNotificationAsync`.
2. **The Follow-Up Engine (15-Minute Rule):**
* Attach custom payload metadata (`supplementId`, `logId`) to the primary notification.
* If the user does not interact with the app or notification actions within 15 minutes, a background background task evaluates `intake_logs`. If the status remains `pending`, it broadcasts a secondary escalating push notification asking: *"Did you forget to log your [X]?"*



### Phase 2: High-Performance Glassmorphic UI

Glassmorphism requires real-time canvas calculations.

* **Implementation Strategy:** Use `@shopify/react-native-skia` on the container layer to render runtime backdrop filters (`<BackdropFilter blur={15} clip={rect}>`).
* **Accessibility Fail-Safe:** Ensure light mode uses solid text overlays (`#12141C`) over white panels with opacity no lower than `0.85` to fulfill contrast standards.

### Phase 3: The "Slide to Confirm" Component

Replaces the frustrating 5-second hold with a sleek tracking interaction.

* **Logic flow:** Use React Native Reanimated's `PanGestureHandler`. Track the X-axis translation of a custom capsule handle.
* **Action Trigger:** If translation reaches `>90%` of the bar width:
1. Fire heavy haptic feedback: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`.
2. Execute database write updating the corresponding item state inside `intake_logs` to `taken`.
3. Decrement the `current_pills` count by the designated dosage size inside `supplements`.



---

## 4. Development & Testing Schedule

```
┌───────────────────────────────────────────────────────────┐
│ WEEK 1: Baseline Architecture & Relational Schema Engine │
└─────────────────────────────┬─────────────────────────────┘
                              ▼
┌───────────────────────────────────────────────────────────┐
│ WEEK 2: Notification Scheduling Logic & Background Tasks  │
└─────────────────────────────┬─────────────────────────────┘
                              ▼
┌───────────────────────────────────────────────────────────┐
│ WEEK 3: UI Build (Skia Glassmorphism & Reanimated Slider) │
└─────────────────────────────┬─────────────────────────────┘
                              ▼
┌───────────────────────────────────────────────────────────┐
│ WEEK 4: Dashboard Graphs, Inventory Alert Loop, Optimization│
└───────────────────────────────────────────────────────────┘

```

### Phase 4 Criteria for Release (Definition of Done)

* [ ] App maintains a constant 60fps frame rate during high-frequency scrolling over the Glassmorphic layers.
* [ ] Mock device test proves inventory drops accurately and alerts fire whenever `current_pills` <= `low_stock_threshold`.
* [ ] Device airplane mode test ensures 100% data access and notification tracking works without data drops.

```

```