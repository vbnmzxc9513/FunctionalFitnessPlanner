> 最新發布狀態：GitHub App授權已修正，main已推送至a73a7d2。主要網站已實際讀回新版手動流程及藍色；GitHub Pages Actions 43676380076仍在執行。下方未推送／403是先前驗收時的歷史狀態。

# 手動排課改版：正式介面審查

日期：2026-11-15。實作／獨立審查使用 GPT-6.1 Sol；root 負責整合、正式畫面審查與最後測試。**新版尚未上線，GitHub 寫入權限回覆 403。**

## 成品範圍

新版正式路徑為日期 → 同一份單日草稿 → 檢查／套用。三種來源入口與三階段大按鈕已移除；常用組合直接顯示名稱並整列加入；同一面板可連續選組合或個別動作。八個暖身各自顯示、編輯與記錄，未重新合成一個流程項目。

正式樣式依 reference-v5 重做：淡紫常用列、單面動作日誌、清單式加入面板與一組底部主要操作。保留實際產品導覽、帳號、藍紫色系與資料契約。沒有搬入原型的示例身份、品牌或簡化資料處理。

## 色彩修正

2026-11-15依使用者回饋恢復藍色主調，保留新版排版；紫色不再作主色。色彩版build與四尺寸正式流程已通過。下列主要畫面連結已改為藍色修正版；歷史implementation-review圖片保留供對照。

## 實際畫面

以下來自正式 React App 的隔離未登入流程，並非 prototype.html。資料為測試草稿。

- [手機已有內容](blue-correction/04-populated-day-390-zh.png)：390×844 首屏完整三個動作，第四個開始露出；成功提示三秒後收起，撤銷仍可從更多選單使用。
- [手機加入面板](blue-correction/02-add-combos-390-zh.png)：預設只顯示名稱、動作數及加入，詳情展開。
- [桌面已有內容](blue-correction/04-populated-day-1440-zh.png)：內容為主、常用組合側欄。
- [確認套用](blue-correction/05-review-390-zh.png)：清楚顯示指定日期、內容及實際儲存位置。
- 320px、中英文、收藏與套用後畫面同存於 implementation-review。

## 重點修正與證據

| 契約 | 正式結果與證據 |
| --- | --- |
| UX-01～03 | 舊來源／階段入口已移除；常用名稱可見；連續加入不離開面板。正式四尺寸語系流程、navigation／planner／ux-followup smoke驗證；root逐張看過手機、桌面與加入畫面。 |
| UX-04 | 暖身8項＋髖內旋新增2項＝10項；90/90保留原劑量與階段。加入／移除可撤銷，後續編輯使過期操作失效；domain與正式UI任務均驗證。 |
| UX-05 | 勾任意3項、命名、真實釘選，保存後立即可再次找到；使用既有snapshot與store。hook另驗證snapshot／write先後、外部刪除與晚回覆、舊帳號與舊modal隔離。 |
| UX-06 | 日期映射、複製前確認與完成紀錄保護延續既有domain／transaction；新增「特定日期→改劑量→預覽→返回」回歸，最新動作／日期／組次保留。 |
| UX-07 | 無搜尋結果可清除篩選；不靜默排除內容或略過受保護日期。檢查與套用前都重驗時間、器材及健康資格；分享收件者可經編輯補齊條件後再套用。 |
| UX-08 | 320／390／768／1440相關流程、中英文、44px控制項、Back／modal／focus有瀏覽器證據。另作390px CSS zoom 200%冒煙，兩主要按鈕仍在視窗內；它不等於原生瀏覽器縮放、讀屏或真人測試。 |
| UX-09 | 未resolve／失敗的markUsed與store.busy不阻擋本機連續加入，不回滾已成功加入的草稿；正式元件harness已驗證。實機p95未量測，不宣稱達到100ms。 |
| UX-10 | 正式入口已走新版；分享／匯入／重開仍相容。線上部署與版本讀回尚未完成，原因是GitHub拒絕寫入。 |

本輪獨立review找出的兩個P1已修復並補測：初始特定日期草稿往返時遺失修改；收藏直接套用漏掉目前時間／器材／健康限制。未降低檢核來迎合舊測試，舊分享fixture改由真實編輯入口修正退休動作及器材後才套用。

## 驗證紀錄

- `npm run check`：ESLint、275個單元測試、Vite正式build通過；build仍有既有大chunk提示。
- 資料層：67個Firestore／Auth emulator整合測試通過，domain／repository／rules未在本輪改動。
- `node scripts/combo-first-review.mjs`：390zh／320zh／1440zh／390en正式App任務通過，記錄見 [browser-review.json](implementation-review/browser-review.json)。
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium WORKOUT_PLANNER_SMOKE_PORT=5244 node scripts/integration.mjs --browser-only`（共用demo emulators）：**2026-11-15整套通過，程序exit 0**；包含分享、收藏hook、assignmentSafety、navigation、workout、planner、async markUsed、ux-followup、既有紀錄／排課／活動度、效能與完成勾選測試。
- 新增的assignmentSafety及combo-local-operations已接正式integration runner，後續CI會持續檢查本次回歸，而非只留下手動報告。

完整瀏覽器串接曾在舊fixture／非同步選單selector失敗；這些失敗保留於工作紀錄，修正後以最後一輪結果為準，不把早期失敗輪次宣稱通過。

## 品質結論與限制

本地工程驗收與產品試用分開。正式介面可供試用；真人上手度、實機效能、原生200%縮放與人工讀屏尚未取得證據。沒有以agent模擬充當真人反饋。

GitHub CLI dry-run及connector寫入皆曾回覆403，11/15重新檢查CLI仍相同；因此未推送、未部署，也沒有線上版本讀回證據。恢復repository寫入權限後，可依使用者既有授權推送、執行CI及部署驗證，不必重新詢問是否要做這次改版。

正式src與測試已保存為本地commit `a742b56`（branch `design/combo-first-v3`）。完整最後一輪瀏覽器輸出見 [browser-suite.txt](implementation-review/browser-suite.txt)。`early-test-failure.png` 是早期失敗輪次，並非最後畫面。
