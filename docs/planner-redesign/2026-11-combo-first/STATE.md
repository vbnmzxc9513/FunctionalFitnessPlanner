# 接續工作入口

更新：2026-11-15。狀態：**P2/P3與本地工程驗收完成；整套browser exit 0。P5受GitHub寫入403阻擋，尚未上線。**

## 先讀這些，避免依聊天摘要猜測

1. 本檔：實際進度與下一步。
2. [DESIGN.md](DESIGN.md)：唯一現行行為規格 v3／視覺 v5，包含第一性原理推導與 UX-01～UX-10。
3. [FINAL-REVIEW.md](FINAL-REVIEW.md)：正式畫面、測試與限制；視覺基準為 [reference-v5](reference-v5/HANDOFF.md)，v3／v4保留作歷史。

最新使用者要求：允許重構排課；常用組合容易找到；取消三段選擇負擔；UI 字太多；必須保住產品方向及成品品質，不靠 context 記憶。

## 已確定的方向

- 用熟悉的組合拼出一天。日期 → 編輯 → 檢查／套用；局部面板不變成另一套流程。
- 名稱直接可見、同面板連續加入、即時回饋；階段只分組，不要求先選。
- 常態卡片：名稱＋動作數＋加入。詳情按需展開；沒有常駐教學段落。
- 藍色為主色；使用者已否定v5紫色主調，保留新版排版。重組 UI 容器與狀態；沿用資料契約、檢核與保護。
- 八個暖身分開；重複保留原劑量、不能默默排除；可撤銷。
- 舊三入口、三階段大按鈕、各階段加入入口與整頁組合預覽須替換，不能在旁邊多加第四入口。

## 進度與證據

| 階段 | 狀態 | 事實／缺口 |
| --- | --- | --- |
| P0 現況審視、方向與原型 | 已有；基準已保存 | 現況基於 `0563f53`；before-*.png；prototype.html；原型走查 320/390/1440px |
| P1 完整流程設計 | v4 狀態已補；v5 已提供 | reference-v4/states.html 補日期、多日、衝突、檢查與結果；保護日期整批阻擋，不靜默略過。使用者否定先前視覺後已另產 reference-v5（含HANDOFF與對比檢查），正式樣式已套用，待整體成品審查 |
| P2 正式 UI 替換 | 本地完成 | ManualPlanner / SessionPlanEditor / QuickWorkoutPicker 正式流程已替換三來源與階段入口，已由root對照v5審查 |
| P3 正式資料／同步整合 | 本地完成 | 沿用 preview/apply、prepareManualPreview 與既有套用保護；markUsed 背景同步，統一最新加入／移除 undo。收藏 hook 與儲存面板由獨立實作更新 |
| P4 成品審查 | 工程驗收通過 | check 275單元＋build、67資料整合、11/15完整browser exit0、正式React四尺寸任務與畫面。真人／實機／人工讀屏未驗證 |
| P5 發佈與讀回 | 權限阻擋 | 11/15 GitHub dry-run仍403，未推送／部署／線上讀回 |

本地工程結論見FINAL-REVIEW；UX-10的部署讀回仍受阻，不能把本地通過等同已上線。prototype-review.json僅是舊原型證據。真人、實機p95與原生縮放／人工讀屏仍未驗證，不推定使用者試用結果。

## 下一個可執行步驟

只剩P5：恢復GitHub對此repo的寫入權限後，先fetch核對遠端main是否有新變更，再依既有授權推送／合併、觀察CI及現有部署，確認canonical網站實際版本與主要任務。不要強推或覆蓋他人修改，不需重新詢問使用者是否要做已授權的改版。

不重啟設計或重做已通任務。除非source有修改、出現失敗或新的未解疑慮，不需重跑整套測試。以下帶日期的舊「待完成／不部署」段落是歷史工作紀錄，不是撤銷使用者原本的部署授權。

## 實作切入點

- `src/components/ManualPlanner.jsx`：日期→同工作區編輯，統一加入／移除undo、可見常用與日期草稿。
- `src/components/SessionPlanEditor.jsx`：實際內容清單、更多選單與沿用domain的組次／phase編輯。
- `src/components/QuickWorkoutPicker.jsx`：唯一原生dialog、組合與單動作、即時本機加入、例外與背景markUsed。
- `src/components/combo-first.css`：單套v5 scoped樣式；BatchExercisePicker已不是manual加入入口。
- `src/domain/quickWorkoutDraft.js`：共用 preview/apply/undo，不繞過檢核。
- `src/domain/manualPlanner.js`、`savedWorkouts.js`：日期、草稿及收藏快照。
- 保留完成勾選既有即時回饋修正；本輪不重寫自動排課引擎或分享資料格式。

## 可重現命令及環境

- `node scripts/smoke-server.mjs 5211`，另開程序執行 `node scripts/combo-first-prototype-review.mjs`。
- 舊畫面：`node scripts/combo-first-current-audit.mjs`，使用隔離草稿、封鎖外部請求。
- 腳本使用 `/usr/bin/chromium`。產物為設計目錄根層截圖，不會寫入 reference-v3。
- 正式實作後：相關 domain/UI/emulator 測試、`npm run check`，及受影響的整合套件。
- 工作目錄 `/workspace/FunctionalFitnessPlanner`。目前未重新驗證 GitHub/Firebase 部署認證；不要把歷史一次性授權碼當可重用憑證。

## 每次接續／交接的紀錄規則

更新本檔的階段狀態、修改檔案、實際命令與結果、未解缺口、下一個具體動作。若方向更動，先在 DESIGN 決策紀錄記原因與受影響 UX ID；再產生新基準，不覆寫舊基準。遇到檔案與對話不一致時，核對最新使用者要求與實際程式，不能只相信摘要。

## 2026-11-13 正式實作批次（未完成）

- UX-01/02/03/04/07/08/09/10：ManualPlanner 同工作區、原生 dialog 加入面板與可見常用列；SessionPlanEditor 僅實際內容分組。單動作以 exercisePhase 推導，經 domain preview/apply；加入後不關閉面板，保留搜尋。
- 最新操作 undo 包含加入及移除；組次／排序／名稱／複製／切日會清除舊操作。複製目的草稿須先看原／新清單並勾選確認。
- QuickWorkoutPicker 面板開啟期間凍結收藏 ID 排序，使用最新revision；展開才render劑量內容；markUsed 不等待且不使用 store.busy gate，本機加入失敗與附帶同步失敗分開。
- 已跑：三個主元件 eslint 通過、正式 Vite build 通過。主代理第一輪正式瀏覽器功能任務已通，視覺不合格，不能算成品PASS。現更新既有 smoke 至新契約，再跑check及受影響整合。
- 不改 reference-v3、不部署、不推送。接續：完成受影響 smoke 與資料測試，等 reference-v5 評審後才套用新視覺。真人可用性及實機延遲仍未驗證。

## 2026-11-14 接續記錄（正在執行，非最終交付）

- 使用者否定舊視覺後，reference-v5 已完成新視覺與5張PNG，HANDOFF含映射；正式ManualPlanner/SessionPlanEditor/QuickWorkoutPicker與combo-first.css已套入，root正在審正式四尺寸圖。尚需縮頂部及避免成功toast遮住動作。
- root獨立scripts/combo-first-review.mjs通過390zh/320zh/1440zh/390en，含連續組合、8暖身、去重、面板undo、日期隔離、單動作階段、任選3項真實收藏釘選與立即出現、預覽不寫入、正式裝置套用。正式圖在implementation-review，不覆寫reference-v3。
- npm run check通過lint、275單元、build。完整integration第一階段67個資料/emulator測試全通；瀏覽器第一檔先因HMR/context失效、後因舊Apply標籤與日期格式失敗。root修planShareDialog.browser為關閉HMR+新控制項selector、加實存日期間隔assert，獨跑已PASS。完整browser-only仍待最後source穩定後跑。
- Sol review完成SaveWorkoutDialog/useSavedWorkouts及tests/integration/savedWorkouts.browser：實際hook時序、snapshot前後write、delete後late resolve、帳號切換、舊modal隔離、真實3項子集pinned、進階sourceItem更新均PASS（不等於實際雲端真人測試）。
- Sol主實作已通新版多尺寸planner/ux-followup/workout smoke與async local operations harness；舊ux-followup歷史圖已恢復，新證據另存implementation-review/ux-followup。
- 獨立review另發現2個P1，交sol_planner_review修：①帶initialSessions的特定日編輯→預覽→返回編輯可能重吃最早manualInput覆蓋新草稿；②收藏直接套用未依profile.time/context做最終資格gate。涉及App.jsx、ApplyWorkoutPlan.jsx及SharedWorkout.jsx傳editProfile；待補回歸測試後才交付。
- GitHub寫入實測受阻：CLI git push --dry-run 403；GitHub connector create_branch亦403 Resource not accessible by integration。可讀取帳號及repo不等於可寫。沒有推送或部署本輪；不要重用歷史授權碼，也不能聲稱已上線。
- branch design/combo-first-v3，已提交的最後版本仍14c2cec；其後src/測試/新基準在工作區待最終驗收提交。接續先讀本檔與DESIGN最新視覺章節，繼續兩P1＋正式v5審查，最後check/browser套件→更新交付記錄→本地提交。root持有最終review與統一截圖權限，避免多agent同時覆寫同產物。

## 2026-11-14 接續批次（待主代理最終驗收）

- UX-02/03/08：正式 v5 樣式已整檔整理至 `src/components/combo-first.css`，沒有保留先前視覺覆寫歷史。常用整列直接加入；動作為單一白色清單、整列可點；桌面常用側欄、手機同頁；日期／更多／加入保留正式資料模型。未搬原型示例身份、nav或資料。
- UX-04：最新加入／移除統一 parent undo。成功通知3秒後收起，更多選單仍保留「撤銷最近一次變更」。名稱、組次、排序、複製或切日後舊undo失效。刪除／變更phase後焦點回可見動作或內容標題。
- UX-07：組合及單動作0結果提供相同「沒有符合項目／清除篩選」，只重設搜尋與部位，保留內容tab。
- UX-09：`scripts/combo-local-operations-smoke.mjs` 正式元件隔離harness已通過：store.busy＋尚未resolve的markUsed不阻擋加入A/B，撤B保留A；同步失敗不回滾；移除可undo；改名稱使舊undo失效；舊帳號pending完成不污染新帳號。已接integration runner。這不是實機延遲量測。
- 既有 `planner-redesign-smoke`、`workout-planner-smoke`、`navigation-smoke`、`ux-followup-review` 已改新契約，未刪除日期／劑量／分享／匯入資料斷言。`ux-followup-review` 新產物在 `implementation-review/ux-followup/`；本輪曾覆寫的舊歷史PNG/JSON已精確恢復，舊folder git status乾淨。
- 已實際通過（v5前的功能版）：`npm run check`（eslint、275 unit、Vite build）；`workout-planner-smoke` 320/390/1440完整local＋分享收件者匯入；`ux-followup-review` 320/390/1440中文及390英文，跨phase任選3動作收藏、常用立即重用、重開、3日期套用。
- v5後已通：390 `planner-redesign-smoke`、`combo-local-operations-smoke`、主代理獨立四尺寸React流程（root最終重跑中）。兩個44px回歸已修，完整workout smoke重跑中。主代理負責最終check／emulator／browser-only及截圖對照；不得把先前測試推定成最終版本全PASS。
- 其他代理同步修訂：SaveWorkoutDialog/useSavedWorkouts 任選+pin及receipt/account隔離；ApplyWorkoutPlan精簡review、保護日期、profile/time/context gate；App特定initialSessions返回草稿保留。這些改動以各代理實際測試及root整合結果為準。
- 下一步：root完成最後成品截圖（390首屏3–4動作、成功通知收起後）、四尺寸語系／鍵盤／放大與emulator整合。真人可用性、實機p95、上線驗證仍未取得。不部署、不推送。

## 2026-11-15 恢復／最後測試狀態

- 11/14 最後一輪獨立 emulator 執行中，`scripts/navigation-smoke.mjs` 已實際輸出 PASS：cold／warm #plan/#program/#workout、分享退出、匯入取消、modal／picker／draft／week／root Back。Navigation A fixture 已改現行八筆獨立徒手暖身，保留舊版分享預覽相容性及近14000字長鏈案例；沒有放寬正式資格檢核。該輪結果來自工具輸出，沒有持久化單獨log。
- 同輪後續 `workout-planner-smoke.mjs` 結果未在環境恢復前取得，不能推定最後一版PASS。新收件者路徑已用可見input的waitForFunction等待設定面板，沒有sleep或注入profile。
- 11/15 root接手統一全browser重跑；本代理依指示不重跑、不啟停共用emulator、不改src。共用emulator及最終runner日誌由root保存至 `/workspace/scratch/`。最終結果以root本輪輸出為準。

## 2026-11-15 最終結果

- root正式驗收：check通過（275單元、lint、build），67個資料層emulator整合通過；11/15共用demo emulators執行完整 `node scripts/integration.mjs --browser-only`，exit0。
- navigation/native8 fixture與workout非同步器材選單等待均已修正，整套同一輪通過；沒有跳過先前失敗的套件。
- root四尺寸React截圖／任務全通；390首屏3筆完整動作；CSS200%冒煙主要按鈕仍可見（不冒充原生瀏覽器縮放）；完整log及限制見FINAL-REVIEW與implementation-review。
- GitHub寫入仍403；未推送未上線。下一步僅權限恢復後發布及線上讀回，不再返回P1／P2重做。

- 本地正式實作commit：`a742b56`，branch `design/combo-first-v3`；後續文件提交僅保存最終驗收紀錄。root已完成版本保存，請勿以14c2cec作為最新實作版本。

## 2026-11-15 藍色修正

使用者指出藍色不應改紫色。正式combo-first／assignment／收藏面板恢復藍色主色與淺藍底，中性文字；排版與流程不動。v5僅作排版參考，色彩以blue-correction正式截圖為準。既有四尺寸React流程與build已通過，root已檢視藍色正式畫面；不重跑未受影響的資料套件。色彩修正另有後續提交，最新版本以git log為準。部署仍因GitHub403受阻。

## GitHub授權診斷更新

使用者已完成GitHub CLI登入及明確repo scope refresh；兩次CLI均Authentication complete，帳號vbnmzxc9513、repo permissions含admin/push。但隔離環境GH_TOKEN並強制gh credential後，git push仍403；gh API create-ref亦Resource not accessible by integration。不要再讓使用者反覆做相同device-code登入。連接工具list_installations回傳空安裝列表，目前仍無可用寫入路徑。已公開API確認官方OpenAI app https://github.com/apps/chatgpt-codex-connector，owner=openai，其requested permissions包含contents/write、workflows/write。下一步是使用者在此官方App安裝／設定中把FunctionalFitnessPlanner納入授權，並更新此ChatGPT/Codex連線。遠端main仍0563f53，藍色版本本地8bf773b未推送；待連線修正後再fetch/push，不改已驗收程式、不重做CLI登入。
