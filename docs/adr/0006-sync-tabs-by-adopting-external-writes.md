# Sync tabs by adopting external writes, last write wins

**Status**: Accepted

Two tabs share one `regimen-v1` key, and each holds its own reducer state. Every change writes the full state, so the tab that writes last wins and the other tab's change is lost. The storage seam now exposes `subscribe` and `refresh`: the browser's `storage` event, filtered to the live key, reports an external write; a cold start and an external write run the same parse, version, migrate, and normalize pipeline; and an adopted state is rendered but never written back. A tab still writes only for its own actions, and a `refresh` on `visibilitychange` and `pageshow` catches writes that a frozen or bfcache-restored tab missed. The winner is simply the later write. A tab that computes a write from stale state can still clobber a change made milliseconds earlier, and that is accepted. No revision counter, `updatedAt`, or tombstone is added: the payload stays flat and `schemaVersion` stays 1.

A revision-stamped refusal is rejected because old cached clients strip `schemaVersion` and every other unknown field when they save (ADR 0004), so a counter cannot be trusted across builds. Record-level merge is rejected as a schema, clock, and tombstone project for a single-user tracker. A single-writer leader tab is rejected because it needs leader election plus a read-only UI that does not exist.

## Consequences

- Two tabs editing at the same time resolve to the later write, silently. The stale window is the gap between a write and its storage event, plus any time the tab was frozen; the visibility refresh closes the frozen-tab part.
- An external payload that fails to load behaves exactly like a cold start: a damaged one is backed up, salvaged, and announced; a newer-version one hydrates empty and turns writes off. Adoption itself never persists, so a passive tab leaves an old client's version-0 payload in place; the next local action upgrades it.
- The persist effect distinguishes an adopted state from a local change by object identity and skips the write for an adoption. Saves remain a local-action concern.
- Reminders reschedule when an adoption changes the supplements array. On native platforms the app is one WebView and has no tabs, so this is web-only behavior.
- `SupplementForm` reports that the supplement was deleted in another tab and discards the save instead of resurrecting it. In-flight form values otherwise survive an adoption, and the submitted record is built from the freshly adopted one.
- `lib/app-storage.ts` owns the subscription and the unchanged-payload check; `lib/app-context.tsx` owns routing a result to state and toasts.

## Considered options

- **Revision-stamped writes that refuse a stale save**: rejected. Unknown fields do not survive an old client's save, so the stamp is not reliable, and retrying the action needs persistence to move from the state effect into the dispatch path.
- **Record-level merge with `updatedAt` and tombstones**: rejected. It changes the payload, needs clocks and deleted-record markers, and the app is single-user.
- **Single-writer leader tab (Web Locks) with read-only followers**: rejected. Leader election and a read-only mode are a larger project than the risk warrants.
- **Adopting `event.newValue` directly**: rejected. The event payload skips version detection, migration, and normalization, so a damaged or legacy write would bypass the backup guarantee.
- **Writing an adopted state back to upgrade it immediately**: rejected. Two tabs would then echo each other, and a passive tab would fight the writer over the key.
