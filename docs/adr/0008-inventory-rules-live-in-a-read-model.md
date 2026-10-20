# Inventory rules live in one read model

**Status**: Accepted

## Superseded in part by ADR 0011

Days of Inventory and the Run-out Date now live in `lib/inventory-forecast.ts`, a separate read projection joined per row because it needs dose logs as well as the date. The rest of this decision stands: course state, ratio, low stock, overdrawn, and the summary counts remain in `lib/inventory.ts`.

Inventory was recomputed in `InventoryHub`, `useAdherenceStats`, and `BiomarkerDashboard`, and "active bottles" counted finished and upcoming courses. `buildInventory(supplements, date)` in `lib/inventory.ts` now returns rows and a summary: course state (current, upcoming, or finished from the course window), ratio (`null` when the bottle size is unknown), clamped display percent, low stock, and overdrawn. Views render the rows and counts unchanged.

Low stock is an alert for a current course only, and it remains an opt-in through restock tracking. The threshold is in inventory units (capsules, tablets, ml, g), not doses or days, so existing stored thresholds keep their meaning. Overdrawn is reported for every course because it is a data state, not an alert. Weekdays and cycle breaks do not change course state; they only decide whether a dose is scheduled.

## Consequences

- A rule change lands in `lib/inventory.ts`; components no longer compare counts.
- `useAdherenceStats` no longer returns low stock; `useInventory` owns the read model.
- Finished and upcoming supplements remain visible in their own groups, so leftover stock is not hidden.
- Low stock sends no notification; ADR 0007 still owns reminder planning.
- Days remaining and doses remaining are deliberately absent; adding them needs a definition of remaining on off-days and breaks.

## Considered options

- **Dose-aware threshold**: rejected. Reinterpreting stored thresholds would silently move every existing warning point.
- **Days remaining**: rejected. It needs speculative future adherence, the same reason ADR 0007 keeps inventory out of the reminder plan.
- **Show only current supplements**: rejected. Leftover stock would appear to vanish, and restarting a course would be harder to reason about.
- **Low stock for every course**: rejected. A finished course is not consuming stock, so warning about it is noise.
