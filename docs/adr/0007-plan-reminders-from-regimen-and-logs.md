# Plan reminders from the regimen and dose logs

**Status**: Accepted

The reminder planner is a pure function of the regimen, the dose logs, the spacing rules, and the current time. It produces one reminder per calendar date and time, covering every scheduled dose due then that has no dose log; doses already taken or snoozed, and times at or before "now", are skipped. A dose a spacing rule shifted is planned at its adjusted time, so it carries the identity of that time rather than the slot it left, and the diff cancels the reminder that used to cover the old slot. A dose whose spacing plan conflicts produces no reminder at all, because there is no time to remind for. Inventory does not affect the plan: projecting consumption assumes future adherence and would stop reminding someone who merely stopped updating a count, and low stock is already a UI concern. The plan covers 30 days, sorted nearest-first and capped at 60 reminders to stay inside the 64 pending local notifications iOS allows. The provider re-plans on hydration, on changes to supplements, dose logs, or spacing rules, and on resume. A diff against the operating system's pending reminders cancels only stale or changed reminders and schedules only missing ones, so an inventory decrement no longer rebuilds the month. Reminder syncs are single-flight, coalescing to the latest state so overlapping runs cannot cancel each other's work. Permission is requested only from a successful supplement save, never from the sync effect. The planner lives in `lib/reminder-plan.ts` and is free of Capacitor types; `lib/reminders.ts` owns the diff and the driver adapter.

## Consequences

- A snoozed dose gets no follow-up reminder. The model has no snooze-until, so there is nothing to schedule; adding one is a separate feature.
- Logging a dose after its reminder fired leaves the delivered notification in the shade; only pending reminders are reconciled.
- A reminder's identity is its date and time. Editing a supplement's dosage changes the body and replaces the notification; changing a time creates a new identity and cancels the old one. A spacing rule that shifts a dose does the same: the shifted dose gets the identity of its adjusted time, and the reminder for the slot it left is cancelled by the diff.
- If the app is not opened for 30 days, reminders stop until it is opened again; there is no background refresh.
- Denying notification permission is sticky. The app never re-prompts, the OS blocks reminders until the user re-enables them in system settings, and the next sync reconciles.
- An existing install whose owner never adds or edits a supplement never sees a permission prompt, so its reminders never start until the next save.
- `restockReminder` still drives no notification; restock alerts are separate work.
- The app currently ships Android only. The 60 cap is future-proofing for an iOS target, not a live constraint.

## Considered options

- **Per-dose reminders**: rejected. Several supplements sharing a time produce simultaneous notifications, and the plan grows with the regimen rather than the day.
- **Inventory-aware planning**: rejected. Suppressing at zero hides reminders from users who do not maintain counts; simulating consumption assumes adherence and silently stops reminding.
- **Cancel-all-then-reschedule**: rejected. It is the current rebuild on every inventory change; a content diff makes unchanged plans a no-op.
- **Diffing by id only**: rejected. IDs stay stable across a rename or dosage edit, which would leave stale copy.
- **Requesting permission on load**: rejected. A background effect gives no context and no user gesture; the save action is when reminders first matter.
- **A 7-day horizon with a daily rollover**: rejected. It needs a timer and leaves the app silent after a week away; 30 days with a cap is simpler and more robust.
