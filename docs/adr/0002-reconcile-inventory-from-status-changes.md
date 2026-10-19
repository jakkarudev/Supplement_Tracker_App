# Reconcile inventory from dose status changes

**Status**: Accepted

A dose's status is reversible: entering `taken` consumes the supplement's dosage amount from inventory, and leaving `taken` (to `snoozed` or `pending`) restores it. The applied amount is recorded on the dose log (`inventoryAmount`) when the dose is taken, so a later dosage edit cannot corrupt a reversal; logs written before this decision fall back to the current dosage. `pending` is the absence of a log, not a stored row; inventory is never clamped at zero and may go negative, which the read model presents as overdrawn.

## Consequences

- Repeating `taken` on an already-taken dose moves no inventory, so the double-decrement class of bug is impossible by construction.
- A clamped counter cannot be restored without asymmetry, which is why overdraw stays visible as a negative count instead of being hidden at zero.
- `migrateStoredAppState` tolerates and preserves `inventoryAmount` on taken logs and omits it elsewhere.

## Considered options

- **Derived inventory** (a movement ledger as the source of truth): correct, but a much larger change; the stored counter stays authoritative for now, and a ledger can adopt the recorded amounts later.
- **Terminal `taken`**: prevents accidental double-decrement too, but makes mis-taps unfixable and gives `snoozed`-after-`taken` no defined meaning.
