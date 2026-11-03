# P0–P6 implementation reference contract

Source: approved `design.md` §§3–6, 8–10 and `docs/interface-redesign.md` visual system. This is a concrete reference of that plan, not a new design direction. Reference UI only: it never writes application data. Real human five-person task testing remains pending.

## Layout and palette

390 px mobile: single column, 20 px side padding; 28 px page headings, 16 px body, 14 px secondary; 44 px minimum action targets; compact rows separated by rules, not nested colored cards. Existing sky-600 navigation, indigo-600 primary actions, slate-50 page, white surfaces, slate-800 text; amber conflicts. Sticky bottom task action has reserved content padding. Desktop 1440 px: max-width 1120, left date list only for daily work, central editor 760 px; selector/details/save/review max-width 760 centered. Global chrome follows the existing App shell: P0 uses the current 232 px desktop sidebar and mobile bottom navigation (今天／課表／紀錄 + 設定). P1–P6 use the current `planner-immersive` behavior and have no global navigation. The initial top-navigation reference was corrected before product comparison; do not copy that superseded shell.

## Required states and exact primary actions

| Reference hash | First fold and required labels | Main action | Source |
|---|---|---|---|
| `#week` | 本週安排; week interval; count; seven dated rows with theme/minutes/status; empty 尚未安排; 手動排課 and 自動排課 explanatory copy | 手動排課 | §4 P0 |
| `#dates` | 要安排哪幾天？; period controls distinct from selected date checkboxes; selected 11/3,11/5,11/7 | 開始安排 3 天 | §4 P1 |
| `#empty` | 返回本週安排; 草稿已保留在此裝置; 安排 11/3（二）; 調整日期; three selected dates; 這一天想怎麼安排？; three choices 選常見課表／選我的課表／從空白開始 | 選常見課表 | §4 P2 |
| `#day` | 安排 11/3（二）; name field; 預估 28 分鐘／可用 40 分鐘; 時間與器材; ＋ 加入課表; 暖身 8 個動作; real independent rows immediately begin | 檢查並套用 3 天 (fixed bottom) | §4 P2, §6 |
| `#picker` | 返回今日草稿; 加入課表到 11/3（二）; 常見課表／我的課表; search 髖內旋、足弓、肩胛…; one compact region row 全部／髖／足踝／肩胛／更多; four quick workouts | each 查看 opens detail without mutation | §4 P3 |
| `#mine` | same picker shell; pinned / recently used list; clear scope 整天課表 or 可加入一天的訓練片段 | 查看 | §4 P3,P5 |
| `#detail` | destination draft, purpose, segment scope, 3 real exercise rows with phase/dose/sides/teaching, equipment/time; 尚未更新已排課表 | 加入 3 個動作到 11/3 草稿 | §4 P4 |
| `#conflict` | exact existing exercise phase/dose; 保留原本內容 default vs 改用新劑量; 只加入2項 and concrete time/equipment conflict; actual retained list; replacement secondary | 確認加入 2 個動作到草稿 only after explicit conflict acknowledgment | §4 P4 |
| `#replace` | explicit before/after full affected list and replacement scope; cancel available | 確認取代暖身 | §4 P4 |
| `#save` | 存為我的課表; scope 整天／暖身／訓練／收操／勾選動作; name field; few purpose tags; device/account storage status; no dates or completion included | 存入我的課表 | §4 P5 |
| `#review` | 檢查並套用; three date rows each theme/phase counts/time/problems; expand individual date; blank date remove/explicit rest; protected-date/replacement consent where relevant | 確認套用到 3 天 | §4 P6 |

## Warmup reference order

嬰兒式動態後坐 → 偉大拉伸 → 貓牛式 → 徒手 Y／T → 前鋸肌牆推 → 胸椎開書 → 坐姿 90/90 髖轉換 → 下犬式交替踩跟. Each is its own visible row and independently actionable; UI must not leave one sequence behind those rows. Dose/time fixtures illustrate layout and require catalog/data-layer review before final production. No start/completion state is prefilled.

## Review gates

Reference screenshots first, then product screenshots of matching states at 390 and1440; compare first fold, action order, labels, list density and conflicts. Functional/data tests independently verify actual IDs/capacity/draft/apply/save/share semantics. Static prototype interactions and agent walkthroughs are not five real human task tests. No release/deploy implied by this artifact.


## Freeze and evidence

Root reviewed `reference-day-390-fold.png`, `reference-picker-390-fold.png` and `reference-empty-1440-fold.png` and froze their inner hierarchy/actions. The shell was then corrected to existing `src/App.jsx` and `src/plannerVisual.css` behavior (P0 sidebar/mobile navigation; focused P1–P6 without chrome). All captures have been regenerated after that correction. Product comparison must use the regenerated images and identical viewport heights: mobile 390×844, desktop 1440×1000.

Reference fixtures intentionally show all dates of the sample 3-day review already populated, even though the empty/day editing fixture shows other days as not yet arranged. Each hash is an independent screen state, not an application data store. `reference.js` is not production domain logic. Actual product verification must use real snapshots with consistent data through the whole path, separately verify persistence and conflicts, and compare matching states. Estimated minutes and final exercise prescriptions must come from the reviewed catalog, not copied from these illustrative fixtures.
