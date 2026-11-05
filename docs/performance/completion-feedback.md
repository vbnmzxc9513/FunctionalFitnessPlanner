# Immediate completion feedback

The user clarified that the delay was the daily exercise completion checkbox. Previously its checked state only changed after the Firestore transaction and subscription updated, and the shared busy state disabled the entire list.

## Behavior

- A tap immediately changes that checkbox and displays “儲存中…” / “Saving…”. Other completion checkboxes remain available.
- Writes to the weekly progress document are serialized. Repeated taps on an already pending item are disabled, so intent is not duplicated.
- The list and detail dialog use the same pending intent. Confirmed counts, completion celebrations, exports and training history still use persisted progress, never pending selections.
- A failed write removes only that item's optimistic intent and shows an inline retry message plus the existing save-error notification. Other queued items continue.
- A successful write retains its visual selection until the subscription catches up, avoiding a brief jump back to the old checkbox state. A newer authoritative snapshot can supersede a saved selection.
- Navigating within the app keeps the queue. Logout/account linking wait for pending completion changes; leaving the page while changes remain pending uses the browser's unsaved-change prompt.
- Account teardown discards unstarted work and suppresses callbacks to the old UI. This is an in-memory queue, not a durable offline synchronization feature.

## Validation

Four unit cases cover immediate intent, ordering, duplicate suppression, success/echo timing, newer snapshots, failure/retry and account teardown.

The new mobile browser regression uses real Firebase emulators with intercepted network responses. It holds completion transaction reads for at least 1.2 seconds, taps two different checkboxes, checks both pending selections and unchanged confirmed counts, opens the detail dialog, then releases the reads and verifies persistence. A controlled permission-denied response tests failed undo, rollback, explicit retry and reload. Both Chinese and English run at 390 px with touch input. Initial measured tap-to-selected feedback: 73 ms / 84 ms; these include browser automation overhead and are not real-device guarantees.

The regression is included in `scripts/integration.mjs`. Existing repository conflict/revision checks remain unchanged.
