# Spacing rules adjust a day, not the schedule

**Status**: Accepted

Two Supplements can be linked by a Spacing Rule: a minimum interval, whole hours, symmetric in both directions, and permanent. The rule lives in the Regimen for as long as it is useful; what a rule produces is not permanent. A Scheduled Dose that is still pending on a Logical Day may be held back to the rule's earliest allowed time, and that Spacing Adjustment belongs to that Logical Day alone. The base Schedule is never changed and a Dose Log is never rewritten, deleted, or re-timed: a dose that was taken stays where it was, and the app reports a Spacing Conflict instead of pretending the history was different. A rule is judged against the Logical Day, not the calendar date, so a 23:30 Copper and a 03:00 Zinc are measured against each other while a 23:30 Copper and a 05:30 Zinc the next morning are not.

Only a recorded Actual Intake Time constrains a partner. A Dose Log without one says nothing about when the dose was taken, so it constrains nothing: the app must not invent a time to make a rule bite.

A rule constrains a pending dose only when the dose's own scheduled slot falls inside the forbidden window around the partner's actual time. The gap is symmetric and is measured between actual intake times, so a dose that is already far enough away from the partner keeps its slot, and a dose that was due before the partner is never pushed forward by it. A dose inside the window is held back to the partner's actual time plus the interval; when that leaves the Logical Day, the dose carries a Spacing Conflict instead of moving. A taken dose keeps its slot and its own log either way.

The earliest safe time is the partner's actual time plus the interval, and there is none when that time falls outside the Logical Day, because the time before the partner is in the past and cannot be taken. The dose card and the time sheet name that same time, and both say there is no safe time left when there is none.

The domain write model stays pure, and the check lives in the UI seam, exactly as the future-time check does in ADR 0012. `logDose` records a time and moves inventory; it knows nothing about rules. The time sheet asks the read model whether a candidate time would break a gap and refuses it, naming the earliest safe time, and the dose card shows the adjusted time and any conflict. An adjusted dose is planned at its adjusted time, so its Reminder carries a new identity — the Reminder id derives from the date and the time — and the sync cancels the old one.

## Consequences

- A rule that the two base Schedules cannot satisfy is allowed. The editor warns how far short they are — as soon as the chosen partner and interval make the Schedules too close, and again on every edit to a rule — and still saves, because the user may be about to move a time.
- Only pending doses move. A taken dose keeps its slot and its log, and a Snoozed dose keeps its slot too; a rule never rewrites history.
- Chains resolve as the doses are actually taken. A pending dose's adjusted time is not propagated onto a third Supplement, because that would be a scheduling solver rather than a rule.
- The interval is whole hours, stored in minutes. A rule is pairwise: it links two Supplements, never a group of three, and a pair carries one rule, so a second rule for the same pair is dropped.
- Deleting a Supplement removes the rules that involve it, like it removes the dose history.
- A dose whose plan conflicts gets no Reminder, because there is no time to remind for.
- The rules are a stored collection, so the schema version rises and the normalizer validates and counts them like any other record.

## Considered options

- **Rewriting the taken dose's log to restore the gap**: rejected. History is what happened; a conflict is reported, never edited away.
- **Holding back every pending dose of a partner, whatever its slot**: rejected. The gap is symmetric and is measured between actual intake times, so a dose whose slot is already outside the forbidden window is not in conflict; moving it would make the dose card and the time sheet disagree about the same day.
- **Propagating an adjusted time through a chain**: rejected. A–B and B–C rules can demand incompatible times, and solving them is a scheduling solver with its own semantics.
- **Defaulting a Dose Log without an Actual Intake Time to its scheduled time**: rejected. It invents data that then looks as trustworthy as a recorded time.
- **Moving the rule into the write model, so `logDose` refuses a conflicting time**: rejected. The write model stays pure, and the check belongs in the seam that asks the user for a time, as the future-time check does.
- **Keeping the Reminder identity tied to the scheduled slot**: rejected. The Reminder is for a time, and the id derives from the date and the time, so an adjusted dose replaces its old Reminder.
- **Storing the adjustment itself**: rejected. The adjustment is derived from the recorded times, so storing it would let a stale adjustment outlive the facts it came from.
