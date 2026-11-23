# Scripts Index

This directory contains four groups of scripts supporting CI integration verification, browser/emulator testing, Android/TWA verification, and design reviews.

## 1. CI Integration Runner & Tiers

- `integration.mjs`: Master emulator + browser integration runner used by `npm run test:integration` in CI. Organizes suites into three named arrays:
  - `DATA_TESTS` (`--data-only` / `npm run test:integration:data`): 7 Node/Firestore emulator data & rule test suites under `tests/integration/*.test.js`.
  - `CORE_BROWSER_TESTS` (`--core-browser` / `npm run test:integration:core`): 9 primary browser E2E checks covering sharing dialogs, saved workouts, assignment safety, direct-day editing, exercise library browsing, top-level navigation, manual workout planning, local combo operations, and completion feedback.
  - `EXTENDED_BROWSER_TESTS`: 13 additional browser smoke scripts covering planner redesign, UX follow-up, legacy compatibility, coaching, selection, period planning, compact layout, recovery, coach review, targets, planner requests, coach-guided flows, and performance.
  - Default (`node scripts/integration.mjs`): Runs `DATA_TESTS`, `CORE_BROWSER_TESTS`, and `EXTENDED_BROWSER_TESTS` in full.
  - `--browser-only`: Runs `CORE_BROWSER_TESTS` + `EXTENDED_BROWSER_TESTS` (skips `DATA_TESTS`).

### Browser Smoke Suites Invoked by `integration.mjs`

- Core tier:
  - `usability-direct-day.mjs`
  - `exercise-browser-smoke.mjs`
  - `navigation-smoke.mjs`
  - `workout-planner-smoke.mjs`
  - `combo-local-operations-smoke.mjs`
  - `completion-feedback-smoke.mjs`
- Extended tier:
  - `planner-redesign-smoke.mjs`
  - `ux-followup-review.mjs`
  - `browser-smoke.mjs`
  - `coaching-smoke.mjs`
  - `selection-smoke.mjs`
  - `period-smoke.mjs`
  - `compact-smoke.mjs`
  - `recovery-smoke.mjs`
  - `coach-review-smoke.mjs`
  - `targets-smoke.mjs`
  - `planner-requests-smoke.mjs`
  - `coach-guided-smoke.mjs`
  - `performance-smoke.mjs`

## 2. Shared Test & Server Helpers

- `smoke-server.mjs`: Starts an isolated Vite dev server on `127.0.0.1:<port>` with per-port dependency cache (`node_modules/.vite-smoke-<port>`) and demo-project emulator safety checks.
- `exercise-details-helpers.mjs`: Shared Puppeteer helpers (`openExerciseDetails`, `closeExerciseDetails`) for opening and dismissing exercise detail dialogs reliably.
- `planner-flow-helpers.mjs`: Shared Puppeteer helpers (`openAutomaticPlanning`, `closePlanningFlow`) for entering and safely exiting the immersive period-planning workspace.
- `legacy-fixture.mjs`: Deterministic fixture builder using frozen historical weekly plans (`tests/fixtures/legacyWeeklyPlans.json`) without calling the current generator.

## 3. Android / TWA Scripts

- `android-build.sh`: Local stage-1 debug APK build and `apksigner` verification script using `android/prototype-tooling.json`.
- `android-association.mjs`: Generates an offline Digital Asset Links fixture JSON from an actual signed prototype APK certificate (outside `public/`).
- `android-check-site.mjs`: Verifies deployed `manifest.webmanifest` and `/.well-known/assetlinks.json` headers/JSON against an optional prototype DAL fixture.

## 4. Historical Design-Review & Audit Scripts

- `combo-first-current-audit.mjs`: Manual design-audit screenshot script for the pre-redesign manual planner (`docs/planner-redesign/2026-11-combo-first/`).
- `combo-first-prototype-review.mjs`: Design evidence capture script against the historical `prototype.html` layout across 320/390/1440px viewports.
- `combo-first-review.mjs`: Standalone React app visual review capture script for combo-first planner screenshots.
- `planner-visual-capture.mjs`: Visual screenshot capture script for period planner views into `artifacts/planner-visual` (or `PLANNER_VISUAL_OUTPUT`).
