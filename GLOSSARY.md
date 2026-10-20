# Supplement Tracker

A personal tracker for supplements, their schedules, and the doses actually taken.

## Language

### Supplements and schedules

**Supplement**:
A product a person tracks, with a dosage, a schedule, and an inventory count.
_Avoid_: pill, product, item, bottle

**Regimen**:
The set of supplements a person follows.
_Avoid_: stack, routine

**Schedule**:
The rules that determine when a supplement produces a scheduled dose: weekdays, times, start date, duration, and cycle.
_Avoid_: regimen, plan

**Dosage**:
The amount and form instructions for one dose of a supplement.
_Avoid_: dose, amount

**Cycle**:
An alternating pattern of active and break days in a supplement's schedule.
_Avoid_: phase, rotation

**Course Window**:
The calendar dates from a supplement's start date through its duration, if it has one. Weekdays and cycle breaks do not narrow it.
_Avoid_: active period, run

**Current**:
A supplement whose course window includes a given calendar date.
_Avoid_: active, ongoing, in stock

**Upcoming**:
A supplement whose course window begins after a given calendar date.
_Avoid_: scheduled, future

**Finished**:
A supplement whose course window ended before a given calendar date.
_Avoid_: expired, ended, inactive

### Doses and logs

**Scheduled Dose**:
One occurrence of a supplement at a scheduled time on a logical day.
_Avoid_: intake, occurrence, dose (unqualified)

**Dose Log**:
The record of a dose that was taken or snoozed. A dose that was neither has no log.
_Avoid_: intake, intake log, entry

**Dose Status**:
The state of a scheduled dose: taken, snoozed, or pending. Pending means no log exists for the dose.
_Avoid_: intake status, log status

**Day Regimen**:
The scheduled doses for one logical day, each joined with its dose status.
_Avoid_: daily routine, day's intakes

**Period**:
A named part of the logical day used to group scheduled doses: Morning (05:00–11:59), Afternoon (12:00–16:59), Evening (17:00–20:59), or Night (21:00–04:59).
_Avoid_: time slot

**Wellness Log**:
A daily self-rating of energy and focus on a logical day, with finite scores from 1 to 10. One entry per date; the last valid entry wins.
_Avoid_: check-in, mood log, rating

### Inventory

**Inventory**:
The amount of a supplement on hand, measured in inventory units: capsules or tablets for solid forms, millilitres for liquids, grams for powders.
_Avoid_: stock, count, supply, bottle

**Restock Tracking**:
The user's opt-in to restock alerts for a supplement.
_Avoid_: restock reminder, stock monitoring

**Restock Threshold**:
The inventory level at or below which a supplement under restock tracking counts as low stock, measured in inventory units.
_Avoid_: minimum, reorder point

**Low Stock**:
The state of a supplement under restock tracking whose inventory is at or below its restock threshold while its course is current.
_Avoid_: running low, out of stock

**Restock Alert**:
A low-stock warning for a supplement the user opted into restock tracking. It is not a Reminder and sends no notification.
_Avoid_: restock reminder, restock notification

**Overdrawn**:
The state of a supplement whose logged taken doses exceed its recorded inventory, leaving inventory below zero.
_Avoid_: out of stock, negative stock

### Calendar and adherence

**Calendar Date**:
A single local day, independent of time-zone conversions. It is the label that identifies a Logical Day.
_Avoid_: timestamp, date string

**Logical Day**:
The app's day, running from 05:00 to 04:59 on the following physical date. It is identified by a Calendar Date and is the date assigned to scheduled doses, dose logs, wellness logs, and adherence.
_Avoid_: physical day, calendar day

**Time of Day**:
A clock reading, independent of time zone. Within a Logical Day, a reading before 05:00 occurs on the following physical date.
_Avoid_: timestamp, datetime

**Adherence**:
The share of scheduled doses logged as taken on completed logical days. The current logical day counts only once it is fully complete.
_Avoid_: compliance, consistency

**Adherence Streak**:
The number of consecutive completed logical days with full adherence.
_Avoid_: consistency streak, run

### Reminders

**Reminder**:
A prompt to log the scheduled doses due at one time of day on one logical day.
_Avoid_: notification, alert, push

**Reminder Plan**:
The set of reminders the app wants pending at a given moment, derived from the regimen and dose logs.
_Avoid_: notification schedule, reminder queue

**Pending Reminder**:
A reminder currently registered with the operating system.
_Avoid_: scheduled notification, alarm

**Reminder Sync**:
Reconciling pending reminders with the current reminder plan.
_Avoid_: reschedule, refresh, rebuild

### Storage recovery

**Dropped Record**:
A stored record that failed validation while loading and is left out of the loaded state; the recovery backup keeps the original.
_Avoid_: rejected record, deleted record

**Repaired Record**:
A loaded record whose stored values were invalid and were removed, replaced, or rewritten while loading.
_Avoid_: fixed record, cleaned record

**Recovery Backup**:
A verbatim copy of stored data taken before the app overwrites it after a load that dropped or repaired records.
_Avoid_: snapshot, dump

### Cross-tab state

**Tab**:
One open instance of the app in a browser; the unit that shares the stored state.
_Avoid_: window, client, session

**External Write**:
A write to the stored app state made by another tab.
_Avoid_: remote write, foreign write

**Adoption**:
A tab replacing its displayed state with the state loaded after an external write.
_Avoid_: sync, refresh, reload

**Stale Write**:
A write computed from a tab's state after an external write has already replaced it.
_Avoid_: losing write, conflict, clobber
