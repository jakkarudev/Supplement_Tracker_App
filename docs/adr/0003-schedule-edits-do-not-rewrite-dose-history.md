# Schedule edits do not rewrite dose history

**Status**: Accepted

A supplement has one current schedule: every date, past included, is evaluated against the schedule as it exists today, and scheduled doses are always derived, never seeded. Editing a supplement replaces its schedule and leaves every dose log untouched, so a log whose time no longer exists stays stored but stops joining to a scheduled dose. Deleting a supplement removes it together with its entire dose log history, matching the destructive action's confirm copy.

## Consequences

- Editing times, days, started-on, duration, or cycle retroactively re-derives past adherence; versioned schedules are deliberately out of scope. If dose history must survive schedule edits visibly, that is a read-model design of its own.
- There is no retire/archive state yet; pausing is expressed through the schedule (days, duration, cycle), not deletion.
