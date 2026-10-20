# Store times as 24-hour HH:mm

**Status**: Accepted

Supplement schedules and dose logs originally stored times as 12-hour display strings (e.g. `"08:00 AM"`), and five separate helpers parsed them. Persisted times are now canonical 24-hour `HH:mm`; `Period` is derived from the time, and 12-hour formatting happens only at the UI edge. The dose join key becomes unambiguous and `<input type="time">` binds directly.

## Consequences

- `migrateStoredAppState` normalizes legacy display times, dedupes each supplement's times, drops the stored `period`, and discards invalid times and logs.
- Notification IDs change because the ID hash includes the time. `syncSupplementReminders` cancels every `supplement-reminder` by kind before scheduling, so old notifications do not survive.
- Stored times stay canonical 24-hour `HH:mm`. The display clock is the user's Time Format preference, 12-hour or 24-hour, and `formatTimeForDisplay` remains the only place that formats a stored time for display.
