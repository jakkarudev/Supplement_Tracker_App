# Spacing rules adjust a day, not the schedule

**Status**: Accepted

Two Supplements can be linked by a Spacing Rule: a minimum interval, whole hours, symmetric in both directions, and permanent. The rule lives in the Regimen for as long as it is useful; what a rule produces is not permanent. A Scheduled Dose that is still pending on a Logical Day may be held back to the rule's earliest allowed time, and that Spacing Adjustment belongs to that Logical Day alone. The base Schedule is never changed and a Dose Log is never rewritten, deleted, or re-timed: a dose that was taken stays where it was, and the app reports a Spacing Conflict instead of pretending the history was different. A rule is judged against the Logical Day, not the calendar date, so a 23:30 Copper and a 03:00 Zinc are measured against each other while a 23:30 Copper and a 05:30 Zinc the next morning are not.

Only a recorded Actual Intake Time constrains a partner. A Dose Log without one says nothing about when the dose was taken, so it constrains nothing: the app must not invent a time to make a rule bite. For the same reason a taken dose holds its partner to at least its own actual time plus the interval, while the partner keeps its own slot and its own log.

The domain write model stays pure, and the check lives in the UI seam, exactly as the future-time check does in ADR 0012. `logDose` records a time and moves inventory; it knows nothing about rules. The time sheet asks the read model whether a candidate time would break a gap and refuses it, naming the earliest safe time, and the dose card shows the adjusted time and any conflict. A shifted dose is planned at its adjusted time, so its Reminder carries a new identity — the Reminder id derives from the date and the time — and the sync cancels the old one.

## Consequences

- A rule that the two base Schedules cannot satisfy is allowed. The editor warns how far short they are and still saves, because the user may be about to move a time.
- Only pending doses move. A taken dose keeps its slot and its log, and a Snoozed dose keeps its slot too; a rule never rewrites history.
- Chains resolve as the doses are actually taken. A pending dose's adjusted time is not propagated onto a third Supplement, because that would be a scheduling solver rather than a rule.
- The interval is whole hours, stored in minutes. A rule is pairwise: it links two Supplements, never a group of three.
- Deleting a Supplement removes the rules that involve it, like it removes the dose history.
- A dose whose plan conflicts gets no Reminder, because there is no time to remind for.
- The rules are a stored collection, so the schema version rises and the normalizer validates and counts them like any other record.

## Considered options

- **Rewriting the taken dose's log to restore the gap**: rejected. History is what happened; a conflict is reported, never edited away.
- **Propagating an adjusted time through a chain**: rejected. A–B and B–C rules can demand incompatible times, and solving them is a scheduling solver with its own semantics.
- **Defaulting a Dose Log without an Actual Intake Time to its scheduled time**: rejected. It invents data that then looks as trustworthy as a recorded time.
- **Moving the rule into the write model, so `logDose` refuses a violating time**: rejected. The write model stays pure, and the check belongs in the seam that asks the user for a time, as the future-time check does.
- **Keeping the Reminder identity tied to the scheduled slot**: rejected. The Reminder is for a time, and the id derives from the date and the time, so a shifted dose replaces its old Reminder.
- **Storing the adjustment itself**: rejected. The adjustment is derived from the recorded times, so storing it would let a stale adjustment outlive the facts it came from.
