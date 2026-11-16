# 2026-11-16 — daily task usability correction

Latest request: Today / Plan / Records are too complex; chest and other body parts are absent from pickers; all movements need tags; modifying a day must not require a new multi-day planning wizard.

Implemented:
- Today has a compact workout header, an Add exercise action and a direct edit action. Save/share/timing details are secondary.
- Adding to an existing day or choosing an empty calendar date opens the exercise picker on that exact date. Single-day review cannot remap dates. Multi-day creation/import retain their date assignment flow.
- Single-day edits do not overwrite or clear a separate multi-day draft. Saving uses existing profile validation, concurrency checks and all-or-nothing assignment. Completed/logged days remain protected against replacement.
- Full shared body-part taxonomy including chest; shared tags on library, picker, daily rows, editor, details and summaries. Custom movements without known anatomy are marked unclassified, not assigned invented muscles. Tags are derived navigation metadata, with no stored-data migration.
- Plan starts with the week and two compact creation actions; Records starts with recent actual logs, with details and follow-ups collapsed.
- Blue remains the primary color.

Verification:
- `npm run check`: lint, 279 unit tests and production build passed. Final CSS consolidation also built successfully.
- Firestore/Auth emulator integration: 67 tests passed, including owner isolation, protected records, concurrent changes and atomic assignments.
- All 21 browser suites in `scripts/integration.mjs` passed across resumed runs after updating old navigation/disclosure selectors. No safety assertions were removed: they now open the visible controls instead of assuming a questionnaire is embedded in Today or that details are always expanded.
- New real App task passed at 320 / 390 / 1440 px: one-click day add, empty-calendar-day add, chest filtering/tags, fixed-date save, exact neighboring date and multi-day draft preservation, protected-record rejection, no horizontal overflow or page errors. See `screens/results.json` and captures.
- Existing browser coverage passed for sharing/import, scoped favorites, draft restore/undo, login/logout, native and legacy actual logs, readiness/next-day feedback, date rollover, long-press/keyboard/focus, free-planner region coverage and coach conditions in Chinese/English.
- With network completion deliberately held for 1200 ms, optimistic completion feedback measured 142 ms (zh) and 208 ms (en); failure/retry and reload passed. This is an emulated browser check, not a physical-phone measurement.

Limitations: single-day editing does not replace dates with existing completion/log records; the original facts stay protected. Unknown custom exercise anatomy is visibly unclassified. Tags describe navigation metadata, not measured muscle load or training adequacy.

Local implementation and review complete. Release verification is recorded below after publishing.

Screenshots are implementation captures, not replacement design references. No human usability test has been claimed.
