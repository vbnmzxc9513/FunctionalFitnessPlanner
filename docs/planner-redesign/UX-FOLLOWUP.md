# 排課介面簡化：核准的後續範圍

日期：2026-11-02。此文件補充原已凍結的 `design.md` 與 `IMPLEMENTATION-REVIEW.md`；以下明確要求優先於原介面名稱及入口位置。實作前記錄本次範圍，不改寫原對照圖或原核准紀錄。

- 每日編輯上方提供可點擊的暖身／訓練／收操概覽，呈現動作數及未安排狀態，點擊移至該區並轉移鍵盤焦點。390×844 首屏可辨識三區；八個暖身繼續逐列顯示。壓縮日期與標題的空白。
- 使用「快速組合／當日課表／我的收藏」區分短組合、日期內容與保存集合。常用組合直接顯示名稱、動作數及估時；不暗示短組合就是完整一日訓練。
- 名稱旁顯示次要「收藏這天」，呼叫既有保存視窗及範圍選項；複製、分享保留原流程。
- 動作選擇器取消未選列右側重複的加號，保留 checkbox、整列標籤選取、已選回饋與收藏。類型／部位更緊湊，保留腿、胸、背、胸椎、前鋸肌等篩選；不自動聚焦搜尋引發手機鍵盤。
- 用一處固定狀態說明裝置草稿保存與尚未套用；確認套用及受保護日期語意維持。加入快速組合後提供次要「繼續加入訓練」，不自動增加動作或湊滿可用時間。

沿用天藍／靛藍色、單一主要操作與至少 44px 觸控目標，中英文同步。只改 UI、相關樣式及必要 browser smoke selectors；不改資料模型、儲存、路由、API、規則或交易邊界。程式與瀏覽器檢查結果另記錄；agent 檢查不視為真人使用性驗證。

## 實作與 agent 驗證（2026-11-03）

已在既有元件完成上述五項調整。當日概覽以三個可點擊的階段按鈕顯示動作數／尚未安排，點擊會捲動並聚焦標題，遵從減少動態效果偏好；八項暖身仍逐列顯示。「收藏這天」沿用 `SaveWorkoutDialog` 的整天／階段／勾選範圍、同名與失敗處理。選擇器聚焦標題而非搜尋欄，未選列只有 checkbox 與收藏操作；所有類型與部位仍可用。切換日期或進入日期調整會清除前一天的成功／撤銷／繼續加入訓練提示，避免把操作套到錯日。

中英文統一以快速組合／Quick combos、當日課表／Daily workout、我的收藏／My favorites 區分內容。保存整天範圍標為「當日課表副本」，不宣稱已完整涵蓋一天訓練。常見快速組合只在清單上方解釋一次；每列直接呈現名稱、數量、估時與器材。

- `npm run check`：ESLint、258 個單元測試、正式建置通過。保留既有 bundle 大小提示。
- `REDESIGN_SMOKE_WIDTHS=320,390,1440 node scripts/planner-redesign-smoke.mjs`：最終版三個寬度通過；包含八項獨立動作、去重、撤銷、劑量修改、範圍保存、重開、收藏重用、確認與套用，無水平溢出或 runtime error。
- `node scripts/workout-planner-smoke.mjs`：320／390／1440 通過；包含單一動作篩選、新增、劑量、日期套用、命名保存、快速重用、分享及接收匯入。最後一次執行在最終標題／間距調整前，之後的最終版另由上述 redesign smoke 驗證。
- `node tests/integration/savedWorkouts.browser.mjs`：保存／重開、同名重試、改名穩定 ID、quota 失敗、刪除確認、回呼、帳號範圍切換、中英文與 320／390／1440 的 44px 控制尺寸通過。

穩定操作 selector 為 `manual-save-day`、`manual-day-overview`、`manual-jump-warmup`／`manual-jump-strength`／`manual-jump-cooldown` 與 `manual-continue-training`。既有 browser scripts 的受影響文案／保存入口同步更新；`capture-paired.mjs` 僅更新產品保存入口 selector。本次沒有重拍或改寫原 `paired/`、原參考 HTML 及原核准文件，這些仍代表先前審查時的歷史快照。新的獨立主代理走查與截圖另列於 `ux-followup/`。

上述為程式與 agent 瀏覽器走查，未進行真人任務測試；未更動 domain、schema、路由、API、rules、儲存或交易邊界，亦未提交、推送或部署。

## CI 日期相依檢查修正（2026-11-03）

既有 `scripts/browser-smoke.mjs` 在保護週一舊版完成紀錄的驗證末尾，誤用「今天」尋找週一動作；11/2（週一）會通過，11/3（週二）則正確切換到週二的新版課表，使舊驗證逾時。測試已改為從日期總覽開啟明確的 `mondayDate`，確認原舊版動作仍顯示，再從 emulator 重新讀取該週的 `exerciseKey(1, originalID)` 完成事實，確認其為 true、八個新版暖身完成 key 未被憑空標為 true。原有套用前後完整 progress 相等檢查保留；日期預覽保持唯讀，不新增完成操作。

修正只涉及 browser smoke 與本證據紀錄，沒有更動產品、資料或凍結整個測試日期。以真實執行日 2026-11-03（週二）啟動全新 `demo-fitness-planner` Auth／Firestore emulators，聚焦執行 `node scripts/browser-smoke.mjs`：desktop 1280×900、mobile 390×844 均通過，含 BYOK 攔截、保護日期／十筆動作重開、實做資料、週切換、登出及英文檢查；未呼叫正式 Gemini。該檔 ESLint 與 `git diff --check` 通過。執行記錄為工作區 `/workspace/scratch/browser-smoke-date-fix.log`；其他 browser suites 與 CI 全套重跑由主代理另行確認。

## CI browser 診斷生命週期修正（2026-11-03）

CI `41591038191` 的既有 `period-smoke.mjs` 在帳號套用時啟用 CDP「所有例外都暫停」，以非同步 `Debugger.paused` listener 呼叫 `Debugger.resume` 收集除錯 JSON；此 listener 的 promise 不受測試流程等待，CDP detach／target 關閉時可在流程外拋出 `TargetCloseError`。該 JSON 不參與任何產品驗收，因此已移除整段常駐暫停診斷。原本的實際套用按鈕消失、器材保存／雲端重開、帳號與裝置實做隔離、完成與實做保存／重開，以及 `pageerror` 必須為空的檢查完整保留；沒有忽略產品錯誤或調整產品程式。

- 全新 `demo-fitness-planner` Auth／Firestore emulators 下，聚焦 `node scripts/period-smoke.mjs`：desktop 1280×900、mobile 390×844 的帳號日期課表套用／保存／重開／實做檢查均通過，exit 0。記錄：`/workspace/scratch/period-smoke-cdp-fix.log`。
- 完整執行 `firebase emulators:exec --project demo-fitness-planner --only auth,firestore "node scripts/integration.mjs --browser-only"`：15 個 browser suites 全數通過，含四個 UX 情境、週二日期修正、帳號 period smoke 與後續 compact／recovery／coach review／targets／planner requests；exit 0，emulators 正常關閉。記錄：`/workspace/scratch/ux-followup-browser-only-cdp-fix.log`。
- `period-smoke.mjs` 的 ESLint 與 `git diff --check` 通過；先前兩次 CI 已通過的 66 個資料整合測試未重跑。browser suite 產生的非預期游標閃爍截圖差異已還原，保留先前審閱圖片。

此次修改僅包含該 browser script 與本證據紀錄；未提交或推送，CI 重跑由主代理另行確認。
