# Version the persisted app state

**Status**: Accepted

The app persists its entire `AppState` under the `regimen-v1` localStorage key. That key is an opaque legacy identifier, not a schema version: the 2026-05-29 design doc named the key `regimen-state`, the same-day implementation plan named it `regimen-state-v1`, and the shipped code settled on `regimen-v1`. The key stays as it is, so an old cached PWA client and a current client cannot diverge onto two keys.

Stored payloads are flat and carry `schemaVersion` alongside the state collections. A payload without a numeric `schemaVersion` is version 0, the unversioned legacy shape; the canonical shape is version 1. Loading runs versioned migration steps (`0 → 1` today) and then an always-on normalizer that validates and salvages records. A stored version newer than the current one is never migrated, downgraded, or overwritten: the app reports that the data was written by a newer version and hydrates empty.

Before a load can be followed by a save, the raw stored value is backed up to `regimen-v1.corrupt.<ISO timestamp>` whenever it cannot be parsed, fails the top-level shape check, or produces dropped records during normalization. Only the three newest backups are kept. If the backup write fails, the original value is left untouched and storage is treated as unavailable, so no overwrite can occur.

The historical-draft deletion rule is dropped. It could erase user annotations because its equality check ignored `notes` and `purchaseUrl`, and a destructive migration must not be re-runnable. Cross-tab sync is deliberately out of scope.

## Consequences

- Old clients ignore `schemaVersion` and strip it when they save, so every migration step must be pure, idempotent, and non-destructive; `0 → 1` can run again.
- Storage failures (quota, unavailable storage, a failed backup) surface as toasts instead of being swallowed. The app stays usable in memory, but writes stop when storage is unavailable.
- Restore is manual for now: copy a backup key's value back to `regimen-v1`. Export/import and restore UI are separate work.
- Future schema changes append a migration step and raise the current schema version. They must also consider stale PWA clients writing older shapes under the same key.
- `lib/app-storage.ts` owns the storage adapter, load/save, backup, and the future-version guard. `lib/storage-migration.ts` owns version detection, migration steps, and normalization. The provider only routes results to state and toasts.

## Considered options

- **Nested envelope (`{ version, state }`)**: rejected. Old clients would see no `supplements` key, hydrate empty, and overwrite the envelope with empty state. A flat payload survives old-client reads.
- **Renaming the key to `regimen-state`**: rejected. Old cached clients would keep writing `regimen-v1` while new clients read the new key, so the two would silently diverge.
- **Backing up only on parse failure**: rejected. The first post-hydration save would destroy the only copy of records the validator rejected.
- **Keeping the historical-draft rule as a one-time step**: rejected. It can erase annotated records and would run again when an old client strips `schemaVersion`.
