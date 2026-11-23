# State — 2026-11-22 (AI Period Planner, Member Proxy & Analytics)

## Implemented
- **Domain analytics (`src/domain/periodAnalytics.js`)**:
  - `summarizeRecentPerformance`: deterministic 28-day factual summary (active days, completed items, logged sets, next-day feedback, recent 7d readiness, latest metrics delta, 8-region mobility gaps).
  - `buildPeriodAnalytics`: shared chart data builder for both Free Template and AI Coach previews (daily minutes & session rhythm with court-day tags, 7 badminton strength/capability pillars, 8-region mobility coverage, KPI totals).
- **1–28 day AI period planner (`src/domain/aiPeriodPlanning.js`)**:
  - Splits 1–28 day ranges into ISO-week chunks (`<= 7` days/chunk) with rolling history context.
  - Locks and prepends the exact 8-item dynamic warm-up (`DAILY_WARMUP_IDS`) on eligible unprotected dates while deducting its time budget before AI plans main training/coordination/accessory/cooldown.
  - Preserves protected dates verbatim; enforces strict eligibility, jump-contact, phase-order, preparation-set, and daily-time guards via `sanitizePeriodSession` with 1x self-correction retry.
  - Produces a warm, encouraging, data-grounded 4-part coach report serialized cleanly inside `planningPeriods.conclusion` (`<= 3,800` chars, compatible with existing 4,000-char Firestore rule) and parseable back for saved overviews.
- **Dual-auth AI services & backend (`src/services/gemini.js`, `src/services/aiMembership.js`, `src/hooks/useAiMembership.js`, `functions/memberPeriod.js`, `functions/schema.js`, `functions/index.js`, `firestore.rules`)**:
  - BYOK chunked caller (`generateAIPeriodChunk`) with `AbortSignal` and structured error codes.
  - Member Cloud Functions proxy (`requestMemberAiPeriodChunk`) reading admin-managed `aiMembers/{uid}` (`active`, optional `dailyLimit` and `expiresAt`), enforcing atomic daily quota at `aiMemberQuota/${utcDate}_${uid}`, and calling Gemini using server-side Secret Manager (`FITNESS_TRIAL_GEMINI_KEY`). Raw API keys never reach client browsers.
  - Added `firestore.rules` for `aiMembers/{userId}` (owner-only `get`, no list/write) and `aiMemberQuota/{document=**}` (server-only).
- **UI integration (`src/components/PeriodWorkspace.jsx`, `src/components/PeriodPlanPreview.jsx`, `src/components/PeriodCoachReport.jsx`, `src/components/PeriodAnalyticsCharts.jsx`, `src/components/period-analytics.css`, `src/App.jsx`)**:
  - Free Template vs AI Coach mode switch in Auto Plan with inline BYOK key setup, automatic Member Cloud AI badge when `aiMembers/{uid}` is active, model picker, weekly chunk progress bar, cancel button, and one-click fallback to Free Template on API failure.
  - Recharts analytics charts rendered lazily (`PeriodAnalyticsCharts` chunk 6.64 kB) on BOTH Free Template and AI Coach previews, plus expandable overview charts and persisted 4-part `PeriodCoachReport`.
- **Operator docs**: `docs/ai-member-setup.md` documents Secret Manager setup, function/rules deployment, and Firebase Console member management.

## Verification completed
- `npm run check`: ESLint clean, all 321 unit tests pass (including `periodAnalytics.test.js`, `aiPeriodPlanning.test.js`, `aiMemberPeriod.test.js`, `cssTokens.test.js`, `i18nIntegrity.test.js`), production Vite build passes with `PeriodAnalyticsCharts` and `charts` lazily split.
- `npm run build --prefix functions`: succeeds and exports `['requestAiTrialPlan', 'requestMemberAiPeriodChunk']`.
- Firebase Emulator data/rules tests:
  - `tests/integration/firestore.test.js` (20/20 pass, including `aiMembers` self-read/write-denial and `aiMemberQuota` server-only rules).
  - Remaining 6 data integration suites in `npm run test:integration:data` passed (70/70 prior tests passed; only the newly added `aiMemberQuota` 5-segment path bug failed initially and was fixed to 2 segments in both `functions/index.js` and `tests/integration/firestore.test.js`, then re-verified 20/20 green).
- Puppeteer end-to-end smoke (`scripts/ai-period-planner-smoke.mjs`) passed at **320px, 390px, and 1440px** with mocked Gemini API (zero external requests, zero page errors, zero horizontal overflow): verified inline BYOK key setup, AI plan generation, 4-section coach report, Recharts analytics on both AI and Free Template previews, applying plan, and reload persistence.
- **Single-day in-progress edit bugfix & 1-tap `+/-` quick editing** (`src/domain/singleDayEdit.js`, `src/domain/periodDraft.js`, `src/services/periodRepository.js`, `src/components/ApplyWorkoutPlan.jsx`, `src/components/Training.jsx`, `src/components/ExerciseRow.jsx`, `src/components/QuickWorkoutPicker.jsx`, `src/components/SessionPlanEditor.jsx`, `src/components/ManualPlanner.jsx`, `src/App.jsx`, `src/usability.css`):
  - Fixed bug where modifying today's workout after checking off or logging even one exercise failed with `這天已有訓練紀錄，會保留原內容；本次修改尚未儲存` (`DATE_PROTECTED`). Single-day saves (`saveSingleDaySession` / `saveLocalSingleDaySession`) now preserve completed/logged exercises verbatim while allowing additions/removals/edits of unrecorded exercises; multi-day bulk assignments retain strict `DATE_PROTECTED` protection.
  - Added 1-tap `± 增減動作` inline quick-remove (`−`) buttons with recorded lock badges (`已紀錄`) and 1-tap Undo directly on Today (`Training.jsx`), instant-save `＋`/`−` toggling right inside `QuickWorkoutPicker`, and direct `−` buttons on every row of `SessionPlanEditor`.
  - Verified via `tests/unit/singleDayEdit.test.js` (325/325 total unit tests pass), `scripts/quick-single-day-smoke.mjs` at 320 / 390 / 1440px (zero overflow, zero page errors), and `tests/integration/period.test.js` on Firebase Emulator.
- **AI Coach chat & conversational draft refinement** (`src/domain/aiCoachChat.js`, `src/services/gemini.js`, `src/services/aiMembership.js`, `functions/memberCoach.js`, `functions/index.js`, `src/components/AICoachDrawer.jsx`, `src/components/ai-coach.css`, `src/components/PeriodPlanPreview.jsx`, `src/components/PeriodWorkspace.jsx`, `src/components/Training.jsx`, `src/App.jsx`, `src/hooks/useLegacyWeeklyPlan.js`, `docs/ai-member-setup.md`):
  - Added pure domain module `src/domain/aiCoachChat.js` (24KB UTF-8 budgeted de-identified coach context with strict factual-grounding & medical-safety rules, 4 badminton-specific quick prompts, multi-turn history normalizer, and `<= 1800`-char draft refinement message builder preserving original questionnaire notes).
  - Added `generateCoachReply` (BYOK) and `requestMemberAiCoachReply` Cloud Function proxy (`functions/memberCoach.js` + `functions/index.js`, sharing `aiMembers/{uid}` allowlist and `aiMemberQuota/${utcDate}_${uid}` atomic daily quota; flash-only `thinkingBudget: 0` so `gemini-2.5-pro` succeeds cleanly with `maxOutputTokens: 4096`).
  - Added lazy-loaded accessible `<AICoachDrawer />` (`12.75 kB` JS + `7.76 kB` CSS, lazy `markdown` chunk) with dual-auth (Member Cloud AI + inline BYOK), 4 quick prompts, multi-turn Markdown thread, error rollback preserving user draft input, Stop/Clear controls, and entry points on Today (`open-ai-coach`) and Plan (`plan-open-ai-coach`) while preserving the 4 primary tabs.
  - Added blue-bordered conversational refinement box (`ai-refine-box`) below `PeriodCoachReport` on AI previews so athletes can tweak drafts in place while retaining the locked 8-item dynamic warm-up, protected dates, and safety guards.
  - Verified via `npm run check` (ESLint clean, **335/335** unit tests including `aiCoachChat.test.js` and `aiMemberCoach.test.js`, Vite production build clean), `npm run build --prefix functions` (exports `['requestAiTrialPlan', 'requestMemberAiCoachReply', 'requestMemberAiPeriodChunk']`), and Puppeteer smoke `scripts/ai-coach-smoke.mjs` + `scripts/ai-period-planner-smoke.mjs` at **320px, 390px, and 1440px** (zero overflow, zero page errors).

## Remaining operator actions (outside VM)
- Production Firebase deployment requires authenticated Firebase CLI on the project owner's machine:
  1. `npx firebase functions:secrets:set FITNESS_TRIAL_GEMINI_KEY --project myfitnessapp-c4aba`
  2. `npx firebase deploy --only firestore:rules,functions:requestMemberAiPeriodChunk,functions:requestMemberAiCoachReply --project myfitnessapp-c4aba`
  3. Create `aiMembers/{uid}` (`{ active: true, dailyLimit: 20 }`) in Firebase Console for designated members.
- No live real-Gemini API call or live production Blaze deployment was executed from this sandbox.
