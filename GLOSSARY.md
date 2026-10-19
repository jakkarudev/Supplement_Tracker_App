# Supplement Tracker

A personal tracker for supplements, their schedules, and the doses actually taken.

## Language

### Supplements and schedules

**Supplement**:
A product a person tracks, with a dosage, a schedule, and an inventory count.
_Avoid_: pill, product, item

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

### Doses and logs

**Scheduled Dose**:
One occurrence of a supplement at a scheduled time on a calendar date.
_Avoid_: intake, occurrence, dose (unqualified)

**Dose Log**:
The record of a dose that was taken or snoozed. A dose that was neither has no log.
_Avoid_: intake, intake log, entry

**Dose Status**:
The state of a scheduled dose: taken, snoozed, or pending. Pending means no log exists for the dose.
_Avoid_: intake status, log status

**Day Regimen**:
The scheduled doses for one calendar date, each joined with its dose status.
_Avoid_: daily routine, day's intakes

**Period**:
A named part of the day used to group scheduled doses: Morning, Afternoon, Evening, or Night.
_Avoid_: time slot

**Wellness Log**:
A daily self-rating of energy and focus on a valid calendar date, with finite scores from 1 to 10. One entry per date; the last valid entry wins.
_Avoid_: check-in, mood log, rating

### Inventory

**Inventory**:
The amount of a supplement on hand, measured in the units of its dosage.
_Avoid_: stock, count, supply

**Overdrawn**:
The state of a supplement whose logged taken doses exceed its recorded inventory, leaving inventory below zero.
_Avoid_: out of stock, negative stock

### Calendar and adherence

**Calendar Date**:
A single local day, independent of time-zone conversions.
_Avoid_: timestamp, date string

**Time of Day**:
A clock time within a calendar date, independent of time zone.
_Avoid_: timestamp, datetime

**Adherence**:
The share of scheduled doses logged as taken on completed days. The current day counts only once it is fully complete.
_Avoid_: compliance, consistency

**Adherence Streak**:
The number of consecutive completed days with full adherence.
_Avoid_: consistency streak, run

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
