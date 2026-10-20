# Start the logical day at 05:00

**Status**: Accepted

The app's day runs from 05:00 to 04:59 on the following physical date. 00:00–04:59 is Night, not Morning: Morning is 05:00–11:59, Afternoon 12:00–16:59, Evening 17:00–20:59, and Night 21:00–04:59. A scheduled dose at 01:00 belongs to the previous logical day and occurs at 01:00 on the next physical date. Weekdays and cycles are matched against the logical day, so a Saturday-only 01:00 dose fires at 01:00 on Sunday. The Week Strip, Today label, dose logging, Wellness Log, Adherence, course state, and inventory all read the logical day. The Reminder Plan starts its horizon at the logical day and converts each logical date and time to a physical timestamp, adding a day for times before 05:00.

## Consequences

- **No historical remap.** Dose Logs keep their stored dates and continue to join the scheduled doses for those dates; what changes is that a log at 00:00–04:59 now denotes that time on the following physical morning. A remap would need a non-idempotent migration step, or an out-of-payload marker, because ADR-0004 requires migration steps to be pure and idempotent while pre-versioning clients strip `schemaVersion`. The single-user data does not justify that machinery.
- **A Day Regimen is ordered chronologically from 05:00.** Its 00:00–04:59 Night segment appears after 21:00–23:59, not at the top.
- **All schedule edges advance at 05:00.** A schedule's started-on date, duration, cycle, and weekday set are evaluated against the logical day, so course and cycle changes no longer happen at midnight.
- **DST.** A local time that does not exist (spring forward) rolls forward to the next real time; an ambiguous time (fall back) resolves to the first occurrence. A 05:00 boundary is unaffected in zones that transition at 02:00 or 03:00.
- **No live rollover.** An app left open across 05:00 keeps showing the previous logical day until the next interaction, which then offers "Back to today". A dose logged in that interaction still lands on the day the dose belongs to.
- **Late-night entries belong to the previous logical day.** A Wellness Log written after midnight edits the previous day's entry, and Adherence for a logical day finalises at 05:00.
- **Reminder identities change once.** Reminder IDs hash the logical date and time, so early-morning reminders are replaced on the first sync after the change; the plan diff cancels the old ones.

## Considered options

- **Keep midnight as the boundary**: rejected. Night would be 21:00–23:59 only, and 00:00–04:59 doses would be classified and attributed to the wrong day.
- **Match weekdays against the physical date**: rejected. The screen shows logical Saturday, but a Saturday-only night dose would follow Sunday's schedule, contradicting the displayed day.
- **Remap historical Dose Logs**: rejected. The stored dates already join to the same scheduled doses, and the migration would either be non-idempotent or need a marker outside the payload.
- **Skip or clamp nonexistent DST times**: rejected. It adds special cases for one night a year; rolling forward is what the local clock does.
- **Timer-driven rollover at 05:00**: rejected. It would move the screen under the user mid-action.
