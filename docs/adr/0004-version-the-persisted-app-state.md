# Version the persisted app state

**Status**: Accepted

The app persists its entire `AppState` under the `regimen-v1` localStorage key. That key is an opaque legacy identifier, not a schema version: the 2026-05-29 design doc named the key `regimen-state`, the same-day implementation plan named it `regimen-state-v1`, and the shipped code settled on `regimen-v1`. The key stays as it is, so an old cached PWA client and a current client cannot diverge onto two keys.

Stored payloads are flat and carry `schemaVersion` alongside the state collections. A payload without a numeric `schemaVersion` is version 0, the unversioned legacy shape; the canonical shape was version 1 when this decision was recorded and is now version 3 (see below). Loading runs versioned migration steps (`0 → 1`, `1 → 2`, `2 → 3`) and then an always-on normalizer that validates and salvages records. A stored version newer than the current one is never migrated, downgraded, or overwritten: the app reports that the data was written by a newer version and hydrates empty.

Before a load can be followed by a save, the raw stored value is backed up to `regimen-v1.corrupt.<ISO timestamp>` whenever it cannot be parsed, fails the top-level shape check, or produces dropped or repaired records during normalization (ADR 0005). Only the three newest backups are kept. If the backup write fails, the original value is left untouched and storage is treated as unavailable, so no overwrite can occur.

The historical-draft deletion rule is dropped. It could erase user annotations because its equality check ignored `notes` and `purchaseUrl`, and a destructive migration must not be re-runnable. Cross-tab sync was deliberately out of scope for the versioning work; ADR 0006 adds it without changing the payload shape.

The canonical shape is now version 3. The `1 → 2` step adds the optional `takenAt` Actual Intake Time field (ADR 0012) and transforms nothing, because a Dose Log without one is valid and must not be given an invented time. The `2 → 3` step adds the `settings` display preferences with their defaults and transforms nothing else, for the same reason: a payload without a preference is valid, so it gets the default 12-hour format rather than an invented one. The step supplies those defaults for a payload that predates the field, so a payload migrated from an older version lands on the default 12-hour format without a repair. A `settings` object that is already stored is preserved untouched and judged by the always-on normalizer like any other stored value: a `timeFormat` that is missing or unreadable becomes the default 12-hour format and is counted as a repair, in a current-version payload as much as in a migrated one (ADR 0005). A current-version payload with no `settings` object at all never reaches the step, so the normalizer supplies the default and counts that repair too. The display preference is the one absent value that counts as a repair, because a preference the app cannot read is one the user never chose. Unknown keys inside a stored `settings` object are dropped, like unknown keys in any other record, and are not counted.

## Consequences

- Old clients ignore `schemaVersion` and strip it when they save, so every migration step must be pure, idempotent, and non-destructive; `0 → 1` can run again.
- The display preferences are part of the persisted state, not a separate key, so a load, an adoption, and a migration all carry them together.
- Storage failures (quota, unavailable storage, a failed backup) surface as toasts instead of being swallowed. The app stays usable in memory, but writes stop when storage is unavailable.
- Restore is manual for now: copy a backup key's value back to `regimen-v1`. Export/import and restore UI are separate work.
- Future schema changes append a migration step and raise the current schema version. They must also consider stale PWA clients writing older shapes under the same key.
- `lib/app-storage.ts` owns the storage adapter, load/save, backup, and the future-version guard. `lib/storage-migration.ts` owns version detection, migration steps, and normalization. The provider only routes results to state and toasts.

## Considered options

- **Nested envelope (`{ version, state }`)**: rejected. Old clients would see no `supplements` key, hydrate empty, and overwrite the envelope with empty state. A flat payload survives old-client reads.
- **Renaming the key to `regimen-state`**: rejected. Old cached clients would keep writing `regimen-v1` while new clients read the new key, so the two would silently diverge.
- **Backing up only on parse failure**: rejected. The first post-hydration save would destroy the only copy of records the validator rejected.
- **Keeping the historical-draft rule as a one-time step**: rejected. It can erase annotated records and would run again when an old client strips `schemaVersion`.
