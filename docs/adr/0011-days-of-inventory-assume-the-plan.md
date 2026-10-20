# Days of Inventory assume the plan

**Status**: Accepted

The Inventory view shows how long the stock lasts and when it runs out. The recorded inventory is a ledger: a dose lowers it only when logged as taken, and the stored dosage text converts to the amount consumed, including `1/2` and `1/4`. That leaves two quite different estimates possible: project the schedule forward, or infer a rate from adherence. The schedule is what the person chose, and it is what already respects weekdays, cycle days, and the course window, so the estimate projects it. Start at the current Logical Day, count every Scheduled Dose that has no taken log — a snoozed dose has consumed nothing, so it still counts — and stop on the first day whose doses the stock cannot cover. The number of complete days covered is **Days of Inventory**; the first day it cannot cover is the **Run-out Date**. Adherence deliberately does not enter. Taking a scheduled dose lowers the stock and removes that dose from the plan by the same amount, so the figure does not move; a skipped dose leaves the plan intact, so it does not extend the figure either. When a limited course ends before the stock does, the figure continues at the plan's rate past the course end, because the question it answers is how long the stock would last; the course end is shown beside it rather than replacing it.

## Considered options

- **Infer a rate from adherence**: rejected. It makes the figure depend on how faithfully doses are logged, a stretch of unlogged doses inflates it, and it stops respecting the schedule the person actually set.
- **Cap the figure at the course end and report leftover stock instead**: rejected. The two numbers answer different questions, and the request shows both side by side.
- **Count doses already logged as taken**: rejected. The stock is already net of them, so they would be consumed twice.

## Consequences

- Taking a scheduled dose leaves the figure unchanged; only a restock, a count edit, a schedule or dosage edit, or the stock falling short of a day's plan moves it. That is deliberate, not stale data.
- The projection needs dose logs as well as the supplement and a Logical Day, so the stock read model keeps its date-only input and the Inventory view joins the forecast per row.
- A supplement with no Scheduled Doses has no figure and shows "No upcoming doses".
- The projection bounds itself, because a plan that consumes nothing must not spin; ten years is far beyond any real bottle.
