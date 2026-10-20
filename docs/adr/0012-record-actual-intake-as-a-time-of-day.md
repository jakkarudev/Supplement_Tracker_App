# Record actual intake as a time of day

**Status**: Accepted

A Dose Log is keyed by supplement, logical date and scheduled time: the Schedule owns the slot, and the log records only whether it was taken. Nothing records when it was actually taken, which the dose card should show and which a future spacing rule needs. The obvious alternative is a timestamp, but the log already carries its logical date, the app stores no timezone, and the 05:00 logical-day rule plus `physicalDateForTime` turn a clock reading into an instant on the correct side of the boundary. So the actual time is stored as a canonical 24-hour `HH:mm` in `takenAt`, only on a taken log, and absence is meaningful: logs written before this field existed have no actual time and the app must not invent one.

## Consequences

- Old logs load unchanged and show only their scheduled time.
- Correcting the time changes no inventory; undo clears the field.
- A spacing rule resolves the instant from `(log.date, log.takenAt)`; a dose taken at 02:00 after a 23:00 slot stays on the same Logical Day.
- The normalizer strips `takenAt` from any log that is not taken, as it already does with `inventoryAmount`.
- The schema version rises, but the migration step transforms nothing because absence is valid for old logs.

## Considered options

- **A full ISO timestamp**: rejected. It duplicates the logical date, needs a timezone the app does not store, and the picker edits a clock time anyway.
- **Defaulting old logs to their scheduled time**: rejected. It invents data that then looks as trustworthy as a recorded time.
- **A separate intake table**: rejected. The actual time is one field on the log it belongs to.
