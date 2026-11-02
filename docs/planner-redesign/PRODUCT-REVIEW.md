# Read-only product/reference review

2026-11-02. Reviewed against `design.md` and [REFERENCE-CONTRACT.md](REFERENCE-CONTRACT.md), using the actual local React App with isolated signed-out browser storage and external network requests blocked. No private account data or external writes were used. This is an agent design review, not the five real people required by design.md §10.

The queued P0/P2/P3/P5/P6 deviations have been corrected and captured again. Automated screen checks and the actual P6 per-date editing check pass at390 and1440. Root's final PNG review passed for the latest P0/P6/mobile and desktop-empty pairs, together with the previously reviewed day/picker/detail/save pairs. Agent functional and visual acceptance for this redesign review is **passed**, with the sole structural exception P5 modal and the accepted P6 copy variation below. This does not claim human usability validation or authorize release.

## Findings and final disposition

| Screen / source | Finding and required behavior | Current evidence / disposition |
| --- | --- | --- |
| P0 / design.md §4 | Empty current week must show7dated 尚未安排 rows; mobile manual/automatic entries stack; range and arranged count are together; only manual entry is the indigo primary. | Corrected in final `paired/compare-week-{390,1440}.png`. Existing sidebar/mobile navigation retained. Root final PNG review passed. |
| P1 / §4 | Date selection is separate from period display and training conditions; chosen11/3,11/5,11/7; one fixed 開始安排3天. | Final `paired/compare-dates-{390,1440}.png`. |
| P2 empty / §4 | Exactly3clear start paths with descriptions/arrows, no competing review footer or More before first content; desktop header and choices in central760px column. | Corrected in final `paired/compare-empty-{390,1440}.png`. Removed former540px maximum on empty choice block. Explicit rest/removal remain secondary. |
| P2 populated / §§4,6 | Visible bordered 今天的課表名稱 input, then time/equipment summary, small 加入課表 entry and one compact action list.8warmups are individually visible by scrolling. | Corrected in final `paired/compare-day-{390,1440}.png`. Added-success state compressed; zero-change counts omitted. Root final PNG review passed. |
| P3 / §4 | Common/my segmented source tabs, date+weekday, search, one compact region row, four cards, scope before title, secondary single-exercise library. | Corrected in final `paired/compare-picker-{390,1440}.png`; all4cards exist in actual picker. No new primary navigation, folders or marketplace. |
| P4 / §4 | Full content before mutation; actual added and updated counts separate; incoming duplicate phase visible; default keeps existing prescription. | Final hip preview pairs plus real browser `p4-count-verification.json`: Chinese and English each show adding2; use-new prescription shows adding2+updating1 and incoming 輔助／Accessory. No draft applied. |
| P5 / §§4,8 | Scope/name/few purpose tags/storage/copy boundary in task order;44px targets; radios remain20px; save errors cannot appear as success. | Oversized radios and extra region tags corrected. Final `paired/compare-save-{390,1440}.png` shows5scope choices and3purpose tags. Existing modal is root-approved structural variance below. Data error handling is separately tested. |
| P6 actual manual flow / §4 | Review must use plain date-first divider rows, per-date 修改 and details, no stepper/status pills/outer rounded container, and one final confirmation. | Corrected in **ApplyWorkoutPlan**, which is the actual manual route. Final `paired/compare-review-{390,1440}.png`; `capture-report.json` independently records no visible stepper/pills, outer border/radius0 and transparent background,3Modify buttons. |
| P6 per-date editing / §4 | Clicking11/5修改 selects11/5 in the existing editor while preserving all3draft days; changed copy returns to review without applying dates. | Actual browser checks passed at390/1440: all3routine/prescription snapshots preserved,11/5 active, edited theme retained after return to review, scheduled-date storage still absent. Details in `capture-report.json` → `p6ManualChecks`. |

## Root-approved variance

P5 keeps the existing Save modal rather than introducing a full-page save architecture. Root accepted this because design.md §8 explicitly reuses the current Save flow. Scope, name, purpose tags, storage status, personal-data exclusion and primary save action retain their task order,44px targets and complete scroll access. **This is the sole approved structural variance.** The frozen reference was not rewritten to conceal it.

Root also accepted nonstructural P6 copy differences: the actual back label is 返回每日編輯 and its brief summary uses the named manual plan /3days rather than the reference's explanatory note. The screen remains an unapplied preview, the fixed confirmation explains that dates update only after confirmation, and actual/completion data remain separate. Date hierarchy, counts, Modify and final primary action follow the reference.

## Capture contract and limitations

Reproduce final pairs with `SMOKE_DISABLE_HMR=1 node docs/planner-redesign/capture-paired.mjs`. It starts a local server on5197 and uses390×844 and1440×1000 at device scale1. Browser time is fixed to2026-11-02 and dates are11/3,11/5,11/7. Reference fixture injection changes exercise names/doses/time/counts from the same reviewed catalog and sessions; it does not change frozen reference layout/actions. The capture script does not deploy, commit, apply scheduled dates, message others or contact external services.

P0 is an empty scheduled week. P1 selects3dates. P2 empty and P3/P4 before-add are reached through actual UI. Populated P2/P5/P6 use a consistent seeded snapshot: eight independent warmups on every day, hip/foot/scapula segments, daily40minutes. The P6 check then edits only a draft copy. Screenshot seeding demonstrates screen state; the separate product smoke test verifies additions, doses, dedup, undo, scoped save, reopen and actual apply. Screenshots do not substitute for those tests.

`paired/capture-report.json` records16screen pairs, width/overflow/runtime results, exact fixture and real P6 edit checks. `p4-count-verification.json` records both-language duplicate-update labels/phase disclosure. Static reference smoke separately covered44state/width combinations at320/390/768/1440 with no overflow or runtime error. Legacy/share/protected-date/account behavior is separately owned by domain/integration checks; those are not inferred from the visual review.

## Human acceptance still pending

The five-person task test remains pending:10-second orientation, foot-workout within60seconds, editing/reusing/applying within3minutes, recognition of all8warmups, misclick/help counts, task time and1–7difficulty. No agent walkthrough, screenshot or automated check is counted as a real participant.


## Documentation freeze

Root confirmed final visual approval after inspecting the latest week390, actual manual-review390 and empty1440 pairs, and the previously reviewed day390/1440, picker390, detail390 and save390. The final report reflects the latest real parent CSS grid (`manual-edit-workspace`:200px +36px gap + up to760px central column; workbench `display:contents`), with date rail in column1 and header/content in column2. No fixed negative offset is used. The empty choice block has width100% and no540px maximum; source CSS modification precedes the final empty1440 screenshot and capture report. No further captures were made after root's final approval.
