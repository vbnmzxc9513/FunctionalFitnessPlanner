# Project continuity

## Current AI period planner, AI coach & analytics work (2026-11-22)

Read `docs/ai-period-planner-2026-11-22/DESIGN.md`, `STATE.md`, and `docs/ai-member-setup.md`. Auto-plan (`PeriodWorkspace`) and AI Coach (`AICoachDrawer`, plus in-preview conversational refinement `ai-refine-box`) support Free Rules (for auto-plan), BYOK AI (`gemini_byok_key`), and Member Cloud AI via Cloud Functions (`requestMemberAiPeriodChunk` + `requestMemberAiCoachReply` + Secret Manager + Firestore `aiMembers/{uid}` allowlist & shared `aiMemberQuota`; raw keys never stored in Firestore or sent to member browsers). Preserve locked 8-item dynamic warm-up, protected dates, blue tokens, 4 primary tabs (Today/Plan/Library/Records), lazy-loaded Recharts/Markdown chunks, and direct single-day editing.

## Current navigation work (2026-11-18)

Read `docs/navigation-library-2026-11-18/DESIGN.md` and STATE for the latest navigation change. Library is a primary destination: Today / Plan / Library / Records. Preserve direct selected-day Add and immersive editor protections.

## Current exercise library work (2026-11-18)

Read `docs/exercise-library-2026-11-18/DESIGN.md` and its STATE first. Make basic chest/shoulder movements discoverable, show eligibility reasons instead of hiding them, provide manual custom creation without an AI key from both the picker and library, and use the refreshed blue selection cards. Preserve exact dates and all existing eligibility/history protections.


## Current usability correction

Read `docs/usability-2026-11-16/DESIGN.md` first for the latest task. Single-day editing must open the selected day directly; Add opens the exercise picker without choosing a date. Today, Plan and Records each have a primary task. Body-part filters and exercise tags share `src/domain/exerciseTags.js`; chest must be directly selectable. Keep blue and preserve existing recorded facts. The old combo-first work is historical context, not a reason to route daily maintenance through a new multi-day planning flow.

## Previous manual-planner redesign

When working on manual scheduling, combo selection, or the planning UI, read:

1. `docs/planner-redesign/2026-11-combo-first/STATE.md` — actual progress, missing work, next step.
2. `docs/planner-redesign/2026-11-combo-first/DESIGN.md` — current product decisions and acceptance contract.

Color requirement (2026-11-15): keep BLUE as the primary app color. The purple primary palette in reference-v5 was rejected by the user; use that reference for layout only. Current blue screenshots are under `blue-correction/` in the same design directory.

The latest user instructions take precedence. Root `design.md` and earlier UX documents contain historical requirements; do not combine their retired phase-first navigation with the current design. The new direction is **compose a day using visible, reusable combos, with very little default text**.

Before changing implementation, identify the acceptance IDs affected. After each coherent change, update STATE with touched files, actual verification, unresolved gaps, and the next executable step. Record facts rather than intended work as completed. This is the restart point after context compaction or a handoff.

`reference-v5/` is the current visual baseline; `reference-v3/` and `reference-v4/` are historical snapshots. These references are not production code and must not be overwritten to fit the implementation. Generate implementation screenshots separately. If a reference must change, record the reason and create a new reference version; do not silently overwrite the baseline to make an implementation appear compliant.

Review behavior, appearance, and data preservation separately. A prototype browser check does not validate Firebase writes, production performance, or human usability. Keep those statuses distinct. Do not call the redesign finished while the old workflow is still the user-facing route.

Preserve current exercise IDs, eight independently recorded warmups, dose validation, completion records, account/date isolation, and share/import compatibility. UI replacement may be substantial; reuse domain protections rather than rebuilding them in a second editor.

These instructions do not introduce an extra approval requirement or authorize external messaging. Use the authorization and scope already established by the user.
