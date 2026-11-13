# 接續工作入口

更新：2026-11-13。狀態：**設計／原型；正式 React 排課流程未改，新版未上線。**

## 先讀這些，避免依聊天摘要猜測

1. 本檔：實際進度與下一步。
2. [DESIGN.md](DESIGN.md)：唯一現行規格 v3，包含第一性原理推導與 UX-01～UX-10。
3. [reference-v3](reference-v3/README.md)：保留的原型及截圖。它不是正式程式。

最新使用者要求：允許重構排課；常用組合容易找到；取消三段選擇負擔；UI 字太多；必須保住產品方向及成品品質，不靠 context 記憶。

## 已確定的方向

- 用熟悉的組合拼出一天。日期 → 編輯 → 檢查／套用；局部面板不變成另一套流程。
- 名稱直接可見、同面板連續加入、即時回饋；階段只分組，不要求先選。
- 常態卡片：名稱＋動作數＋加入。詳情按需展開；沒有常駐教學段落。
- 藍紫色系保留。重組 UI 容器與狀態；沿用資料契約、檢核與保護。
- 八個暖身分開；重複保留原劑量、不能默默排除；可撤銷。
- 舊三入口、三階段大按鈕、各階段加入入口與整頁組合預覽須替換，不能在旁邊多加第四入口。

## 進度與證據

| 階段 | 狀態 | 事實／缺口 |
| --- | --- | --- |
| P0 現況審視、方向與原型 | 已有；基準已保存 | 現況基於 `0563f53`；before-*.png；prototype.html；原型走查 320/390/1440px |
| P1 完整流程設計 | 部分完成 | 單日、組合、收藏有原型；日期、多日切換、例外與套用頁仍缺具體畫面 |
| P2 正式 UI 替換 | 未開始 | src 下沒有本輪修改；不能把 prototype.html 搬進 app 當完整實作 |
| P3 正式資料／同步整合 | 未開始 | 原型只有隔離 localStorage；不能沿用其簡化驗證、任意劑量字串與示例收藏 |
| P4 成品審查 | 未開始 | 正式截圖、UX-01～10、語系／鍵盤／放大、例外、資料、慢網路與實機待驗證 |
| P5 發佈與讀回 | 未開始 | 無本輪正式部署，不能說已上線 |

目前 UX-01～10 **沒有任何一項正式成品 PASS**。原型通過的任務見 prototype-review.json；未做真人測試，不推定「使用者覺得好用」。

## 下一個可執行步驟

先完成 P1：以同一單日編輯模型補出「選日期／多日切換／有衝突的加入／檢查套用」狀態，確認動作清單與常用入口在已填內容時仍清楚。每頁依 DESIGN 的「當下問題」決定內容；不要再發明新的模式或問卷。

完成這些狀態後，直接按現有授權進 P2/P3；不需再為已確定的方向請使用者重複確認。依序切出能端到端走完的小批次，每批記錄 UX ID 與實際證據；產品整體完成前不把局部批次說成整體已完成。

## 實作切入點

- `src/components/ManualPlanner.jsx`：多入口狀態、全頁切換與日期草稿。
- `src/components/SessionPlanEditor.jsx`：三個階段大按鈕、空階段、重複加入入口。
- `src/components/QuickWorkoutPicker.jsx`：長預覽、加入後關閉、等待 markUsed。
- `src/components/BatchExercisePicker.jsx`：單一動作搜尋，整合進同一面板。
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
