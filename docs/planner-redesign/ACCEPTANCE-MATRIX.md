# Approved-design screen acceptance matrix

Source of truth: [design.md](../../design.md) §§3–10. Reference contract: [REFERENCE-CONTRACT.md](REFERENCE-CONTRACT.md). This matrix records design-reference coverage and the completed agent visual/functional review. Root approved the final paired PNGs; P5 modal is the sole structural variance, with P6 copy variation accepted separately. Human usability validation remains pending. Root froze the inner hierarchy after reviewing P2 mobile/day, P3 mobile/picker and P2 desktop/empty. Existing global shell correction is documented in the contract.

Open [reference.html](reference.html) locally. Select a hash from the table. Capture all states with `node docs/planner-redesign/capture-reference.mjs`; screenshots use 390×844 and1440×1000 at device scale1. Each state has `reference-STATE-WIDTH.png` (full content) and `reference-STATE-WIDTH-fold.png` (first fold). With a fixed footer, use the fold image to judge overlay positions; full-page screenshots preserve the footer at the initial viewport bottom.

| Design section / state | First fold contract | Actions and exact labels | Reference evidence | Actual product status |
| --- | --- | --- | --- | --- |
| §4 P0 / week | 本週安排;11/2–11/8;已安排3天;create modes precede long secondary information | 手動排課:選日期，使用常見或自己的課表，再微調動作。; 自動排課:回答條件，先看建議，再確認安排。;我的課表／動作庫 secondary | `#week`;`reference-week-{390,1440}-fold.png`;seven compact rows in full screenshot | Agent visual/functional review passed; root PNG approval passed |
| §4 P1 / dates | 要安排哪幾天？;可選不連續日期;最多跨28天;顯示期間 separate from date selections | 開始安排3天 fixed; period arrows; selected3/5/7;快速選星期 explicitly constrained to selected period | `#dates`;`reference-dates-{390,1440}-fold.png` | Agent visual/functional review passed; root PNG approval passed; no training filters here |
| §4 P2 / empty | Destination date, local-draft state, adjustment action, selected dates then 這一天想怎麼安排？ | 選常見課表 primary; 選我的課表 and 從空白開始 secondary | `#empty`;`reference-empty-{390,1440}-fold.png` | Agent visual/functional review passed; root PNG approval passed; no three large empty stage cards |
| §4 P2 + §6 / day | Date/name/time/equipment, one ＋加入課表 entry, first independent warmup rows immediately visible | 檢查並套用3天 fixed; each row詳情; per-stage加入動作;更多操作 reveals 存為我的課表／複製到其他天／分享草稿 | `#day`;`reference-day-{390,1440}.png` shows8 individually separated warmup rows,3 training rows | Paired390/1440 captured; underlying8independent-ID check owned by product smoke |
| §4 P3 / picker | 加入課表到11/3（二）;常見／我的 tabs;search;one compact部位 row;scope labels;four default cards | 查看 opens content before mutation; 開啟動作庫 secondary; 更多 progressively reveals filters | `#picker`;`reference-picker-{390,1440}.png` | Agent visual/functional review passed; root PNG approval passed; no marketplace or folders |
| §4 P3,P5 / mine | Same picker shell;已釘選 then最近使用;scope marks片段 vs整天 | 查看; same joining preview; no extra primary navigation | `#mine`;`reference-mine-{390,1440}.png` | Agent picker/reuse checks passed in product smoke; source/catalog sorting remains covered by root tests |
| §4 P4 / detail | Purpose, destination draft, scope,3exercise order/dose/sides/phase, equipment/time;教学 is secondary | 加入3個動作到11/3草稿; 尚未更新已排課表; 其他加入方式 collapsed by default | `#detail`;`reference-detail-{390,1440}.png` | Paired390/1440 captured; domain preview/add checks separate |
| §4 P4 / conflict | Same preview plus explicit original phase/dose and 保留原本內容 default; exact超出3分鐘 warning, no silent truncation | 改用新劑量 explicit; 調整可用時間; acknowledgment of retained list; 確認加入2個動作到草稿 reflects dedup | `#conflict`;`reference-conflict-{390,1440}.png` | Agent duplicate-count/phase browser checks passed; broader conflict guards covered by root domain/browser checks |
| §4 P4 / replace | Exact affected scope; visible before8/after1; training/cooldown preserved; cancel route | 確認取代暖身 primary;取消取代，返回預覽 | `#replace`;`reference-replace-{390,1440}.png` | Agent domain/browser checks passed per root report; standalone reference covers before/after UI |
| §4 P5 / save | 存為我的課表;scope5choices;name;few目的 tags;device/account status;excluded personal/completion data stated | 存入我的課表;取消，返回今日草稿;scope勾選動作 reveals individual checkboxes | `#save`;`reference-save-{390,1440}.png` | Agent visual/functional passed; persistence/reopen/error checks separately covered by product smoke/root tests |
| §4 P6 / review | 檢查並套用;three dated rows with theme,8/3/0etc counts,total minutes,unresolved-state text;full lists only on demand | 唯一primary確認套用到3天;每日期修改;查看完整動作清單;blank date explicit rest/remove; protected original consent when applicable | `#review`;`reference-review-{390,1440}.png` | Agent P6 visual/functional passed; root reports protected-date/browser checks passed |

## Data and safety boundary acceptance (cannot pass via static screen)

- §6: eight warmup rows represent eight independently persisted prescriptions/IDs and independent completion/actuals; historical sequence completion is never expanded into fake completed entries.
- §§6–7:8warmup+4training+2cooldown survive save/reopen/share/import;24limit/28days and multibatch publication completeness tested; legacy shares, saved workouts and protected dates remain readable.
- §4 P2: draft save success/failure are distinct; day switching/back/refresh preserve draft without applying or completing it.
- §4 P4: concrete equipment, disabled exercise and clinical-limit conflicts require resolution; partial acceptance lists exact retained items; actual count and undo reflect the resulting transaction.
- §4 P5: local and account synchronization, save failure, duplicate name, cancel, rename/delete/share/use-date, updating original vs saving a copy are verified with repository data.
- §4 P6: empty dates are removed or explicitly marked rest; existing actuals/completion/date replacement checks remain transactional; automatic questionnaire outcomes enter the same editor/review.

## Human and accessibility acceptance still pending

The approved five-person task study in design.md §10 remains pending. No agent walkthrough, prototype screenshot or automated test may be counted as those five people. Track recognition at10seconds, foot-workout task within60seconds, edited-scapula reusable-workout task within3minutes, all8warmup recognition, misclicks/help/time/1–7difficulty, no accidental date update and no overwritten actuals.

Target widths320/390/768/1440;16px body14px secondary;44px action targets, visible keyboard focus, no document overflow, no footer/keyboard obstruction. Reference layout smoke results are separate from product accessibility acceptance.
