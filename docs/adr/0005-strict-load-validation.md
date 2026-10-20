# Validate stored records strictly at load

**Status**: Accepted

The always-on normalizer (`normalizeSupplement` in `lib/storage-migration.ts`) now validates instead of only defaulting. A required field with no truthful default drops the record, counted in the per-collection dropped counts: `id` and `name` must be non-empty strings, `form` must be one of `Capsule | Tablet | Liquid | Powder`, `startedOn` must be a real calendar date, and `days`/`times` must be arrays (missing or non-array drops the record; an explicit `[]` is kept because schedule-less is a real state). Present-but-invalid values elsewhere are repaired instead of dropped: `days` is filtered to integers 0–6 and deduped, `times` keeps its existing element normalization, non-string text falls back to its default, a non-boolean `restockReminder` becomes `true`, and counts and thresholds coerce numeric strings the way the duration and cycle fields already do (negative `currentCount` is preserved; it is Overdrawn). Repairs are counted per collection separately from drops, and any repair routes the same recovery path as a drop: the raw payload is backed up, the salvaged state is written back, and the toast reports both totals. The rule applies to all three collections, so a dose log's 12-hour rewrite or stripped `inventoryAmount` and a wellness log's duplicate-date collapse are counted repairs too. The hardening lives in the normalizer, never in a versioned migration step, because steps do not run on current-version payloads and must stay pure and non-destructive.

The later migration steps only add fields, and leave validation where it is. `1 → 2` adds the optional `takenAt` Actual Intake Time field and `2 → 3` adds the `settings` display preferences; neither transforms a record. The settings are validated and repaired in the normalizer like everything else: a missing or invalid `timeFormat` becomes the default 12-hour format and is counted as a repair, because a preference the app cannot read is a preference the user never chose. The repair counts carry a `settings` counter for it, separate from the collection counts, because the settings are not a collection.

## Consequences

- `lib/storage-migration.ts` gains `RepairedRecordCounts` beside `DroppedRecordCounts`; `lib/app-storage.ts` treats any drop or repair as a load that must back up first; `lib/app-context.tsx` owns the toast wording. The repaired counts carry a `settings` counter, because the display preferences are repaired like a record but are not a collection.
- The normalizer must stay idempotent and non-throwing: normalizing its own output is a no-op, and a repaired store is clean after the write-back.
- Dropped supplements leave their dose logs stored with dangling `supplementId`s. Unlike a user-initiated deletion (which ADR 0003 makes cascade), a drop is reversible by restoring the recovery backup, so the logs must survive to rejoin.
- `lib/storage-migration.test.ts` expectations change: a missing `startedOn` no longer defaults to `1970-01-01` in the normalizer, and the `1970-01-01` fallback remains only in the v0→v1 step for genuine legacy payloads.

## Considered options

- **Coercing an unknown `form` to `Capsule`**: rejected. Form drives the dosage unit, so coercing invents user-visible meaning; the backup keeps the raw value.
- **Defaulting a missing or invalid `startedOn`** (to `1970-01-01` or today): rejected for the same reason; a wrong start date silently shifts duration and cycle phase.
- **Repairing silently** (no counts, no backup, no toast): rejected. A filtered `days` entry is stored data being deleted, and ADR 0004's promise is that nothing is overwritten without a copy.
- **A 1→2 migration step for validation hardening**: rejected. Steps never see a current-version payload, which is exactly where hand edits and foreign writes live, and steps must be non-destructive. (The later `1 → 2` and `2 → 3` steps only add fields — `takenAt` and `settings` — and transform no records; validation stays in the normalizer.)
- **Dropping records on any invalid value, repairable ones included**: rejected. A non-string brand or a numeric-string count has a truthful, lossless fix.
