# Date-range planning

## 使用流程與驗收計畫

1. 在動作庫選候選，或直接建立課表；先選開始與結束日期，包含起訖日，共 1–28 天。
2. 填「目標與時間 → 身體感受 → 挑選動作」三步問卷。每週體能可用日與打球日分開；可不挑動作，由範本配對。
3. 預覽整段日期與每週重點；點日期查看暖身、準備組、肌力／協調、收操。顯示比賽日、賽前減量及賽後恢復；分鐘只估計額外體能。
4. 確認後才套用。只更新所選日期；已有完成或實做紀錄的日期及區間外安排保留。若預覽後紀錄變動，必須重新預覽。
5. Today 依實際日期載入安排，週末與跨週均可使用。實際紀錄、勾選與預計課表分開，保留實際日期供匯出。
6. 核心／儲存／整合使用 GPT-6.1-sol，高風險資料邏輯採較高推理強度，UI／回歸採中等；三個使用者角色採 GPT-6-luna 中等推理強度，限制任務範圍以控制 token 成本。主代理負責 code review、修正、測試與部署。

三個模擬角色的任務與修正結果見 [日期排課試用 review](date-range-ux-review.md)。這是 agents 透過瀏覽器的角色試用，不是真人使用者研究。

## Plan and interface

The creation path is library choices → inclusive date range → existing three-step questionnaire → date-based preview → explicit apply. The date selector sits outside `Onboarding`, preserving its existing step indexes and callers. Default dates are today through six days later. Ranges must begin today or later and include 1–28 calendar dates; 7/14/28-day presets start from the selected start date. Weekends remain visible and selectable.

`PlanningRange({range,onChange,today,disabled,onContinue,lang})` is controlled. `range` is `{from,to}` in local-calendar `YYYY-MM-DD` format, and `onChange` receives the entire range. `onContinue()` runs only after validation. `today` defaults to the device's local date. It neither generates nor applies sessions.

`Onboarding` keeps its three internal steps and existing props. Goal, daily time and ISO weekday `context.trainingDays` controls appear in the first step. Missing training days display the weekday default `[1,2,3,4,5]`; explicit `[]` is preserved and means no fitness training. `context.badmintonDays` remains a separate court schedule. Navigation and editing retain the parent's questionnaire state.

`PeriodPlanPreview({preview,lang,exercises,today,onBack,onApply,busy,stale})` accepts `{range,sessions,weeklySummaries,conclusion,profile?,protectedDates?}`. Sessions have flat day fields plus actual `date` and ISO `week`. Weekly summaries have `{week,from,to,focus,trainingSessions,recoverySessions,restDays,minutes}`. `protectedDates` is an array of date strings. A separate `periodText(lang)` locale helper keeps this interface copy independent of legacy week copy.

The preview leads with dates and per-week goals, counts and estimated minutes, then groups every requested date by week. Each row labels planned training, recovery/rest and court day where applicable. Clicking a date opens read-only phase details, prescriptions, lift preparation, movement guides (including the full dynamic warm-up flow), warm-up notes and cool-down notes. Missing dates show an incomplete-data warning and block apply. This preview does not report planned workouts as completed and contains no completion or log controls.

`onBack` returns to retained settings. Apply is an explicit confirmation and is disabled while busy or stale. The interface states that only selected dates are updated, existing protected dates retain their arrangements, and plans outside the range remain preserved; persistence must enforce this contract. Estimates and planning notes describe an arrangement, not a guarantee of ideal fit or readiness.

Omitting `onApply` reuses the same date list as a saved overview. `PeriodOverview({period,preview,lang,exercises,today,onReplan,onToday})` optionally supplies navigation buttons and wraps that mode. Existing blue/indigo panel styles and the three main navigation destinations are retained.

## Implementation plan and ownership

1. Define inclusive calendar ranges and extend the existing planner to actual dates, including Saturday and Sunday. Keep the existing weekly AI contract compatible.
2. Add the date selector before the three questionnaire steps, with separate fitness availability and badminton days. Retain answers when going back or changing the date range.
3. Generate and preview every date, including rest days. Carry strength spacing across week boundaries, limit the allocation to selected dates, account for recorded sessions, and evaluate competition timing separately for each date.
4. Apply the selected range atomically. Preserve any date with a completion or a training log, preserve dates outside the range, and reject a preview if its source plans or records changed.
5. Connect saved date sessions to Today, logging, readiness adjustments, history and training exports. Restore saved overviews from actual stored sessions.
6. Run unit, security-rule, transaction and browser regressions. Have separate simulated user agents attempt novice, regular badminton and returning-user tasks; the primary agent reviews and addresses their findings before release.

Core planning, storage, integration and browser regression work use GPT-6.1-sol agents. The bounded user-role trials use GPT-6-luna agents. These trials are simulated usability checks, not a study with human participants.

## Storage and compatibility

The existing `plans/{ISO-week}` format remains a five-day legacy plan, so previous plans and the optional weekly AI path keep their existing contracts. Date planning uses three owner-scoped collections:

- `dateSessions/{YYYY-MM-DD}` stores date identity, the routine, public session notes, a revision and the originating period ID.
- `dateDoses/{date}_{exerciseId}` stores one validated prescription with the same revision. Only doses referenced by the active routine and matching its revision are joined.
- `planningPeriods/{id}` stores the selected range, creation time, public planning intent and conclusion. Questionnaire health notes and factual training logs are not copied into this metadata.

A 28-day range with eight movements per date fits in one transaction. The new security rules validate documents independently, avoiding Firestore's cross-document rule lookup limits. Metadata with missing matching prescriptions reserves its date and blocks execution instead of falling back to an obsolete weekly plan. Old dose revisions can remain stored but are not executed.

Before generating a cloud preview, the repository reads the relevant sessions, preceding and following weeks, weekly progress and training-log slots. Unchanged strength sessions on either side constrain spacing. Apply rechecks those documents transactionally; a concurrent change requires a fresh preview. A recorded date retains its complete existing arrangement even if the saved exercise is no longer a questionnaire candidate. Daily readiness adjustment is a separate operation: it may remove unfinished work while preserving completed slots and the original factual logs.

Device-only date plans retain separate per-week completion state and factual completion dates. Logging uses the scheduled week/day as identity and the actual performance date for reporting. Training exports continue to include actual records rather than treating planned sessions as completed work.

## Release checks

Use `npm run check` and `npm run test:integration`. The integration runner uses the `demo-fitness-planner` Auth/Firestore emulators and browser fixtures; it must not target the production project. Validate the optional Functions shared bundle without deploying or enabling paid AI services. Deploy the compatible Firestore rules before publishing the frontend that writes date-native documents.

The first release supports 1–28 future calendar dates per planning operation. It uses the free rule-based planner, structured questionnaire answers and selected eligible movements; it does not promise an injury assessment or automatic interpretation of every free-text goal. The optional BYOK AI planner remains a separate advanced current-week operation for weeks without native date sessions.

Mobility planning uses the currently loaded actual logs, dated completion marks, readiness court reports and fixed neighboring sessions. A rolling seven-day view and the prior two days of court/training context guide eight mobility regions; prior scheduled work is explicitly unconfirmed, and future neighbors after a target date cannot establish earlier coverage. The collapsed regional overview derives planned dates from the saved or previewed sessions; it does not report actual range or completion. Daily warm-up notes explain selected priorities. Existing protected sessions, actuals and account boundaries remain unchanged.
