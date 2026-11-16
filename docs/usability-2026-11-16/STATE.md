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

Local implementation and review complete.

Screenshots are implementation captures, not replacement design references. No human usability test has been claimed.

Release verification (2026-11-16):
- Source commit `b2cb8db` pushed to GitHub `main`.
- Canonical Cloudflare site is live: https://badminton-functional-fitness-planner.pages.dev/ ; production entry asset `/assets/index-AJRr1cNw.js`.
- Isolated 390px production browser verified Today → Add opens the single-exercise picker directly, chest and serratus are selectable, chest movements render with tags, there is no date wizard or horizontal overflow, and Plan shows the compact week plus manual/automatic actions. No page errors. These checks did not write any production account data.
- Production captures: `screens/live-chest-picker-390.png`, `screens/live-plan-390.png`.
- Separate GitHub Pages workflow started as run `43808466867`; its hosted CI is independent of the verified canonical Cloudflare deployment.

## Requested dumbbell power additions

- Added `bf_E11` 啞鈴火箭推 (dumbbell thruster: squat into grounded press) and `bf_E12` 啞鈴原地跳轉 (small-angle rotational jump and stick), with bilingual names/aliases, guides, conservative starting doses and full shared body tags. Existing identities are unchanged. Both are training/skill movements, not stretching warmups.
- E12 is the explicitly requested active advanced movement; it remains excluded for beginner experience, unavailable equipment and treatment restrictions. Existing advanced movements remain disabled by default. Jump contacts and per-direction counts are explicit.
- Explicit power selections can replace an unselected skill slot even when their strength patterns differ from default footwork; no extra session or slot is added, and existing dose/time/recovery protections remain in force.
- Verified: `npm run check` (283 unit tests, lint, production build); all 11 shared-plan emulator tests including new IDs; isolated 390px browser searched both names, added them with eight warmups, saved all ten on the same day with correct skill phases and no page errors.
- `firestore.rules` expands public E codes only through E12; emulator publication/reload succeeds. Production rules deploy attempted for `myfitnessapp-c4aba` and failed before changes with “Failed to authenticate, have you run firebase login?”. Firebase CLI currently has no usable authorization. Client catalog/manual/free planning and embedded share/import work; server short links containing the new IDs require the pending rules publication. After Firebase authentication, run `firebase deploy --only firestore:rules --project myfitnessapp-c4aba`. Do not claim these production rules are deployed.
