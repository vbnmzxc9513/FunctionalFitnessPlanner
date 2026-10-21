# Android 第一階段實作審查

日期：2026-10-21。由 subagent 實作 Android 外殼與網站相容流程，主 agent 逐一讀取變更、要求修正並獨立重建／執行測試。只處理可安裝測試原型，沒有正式 APK 分發或 Android Actions。

## 審查結論

程式與建置可作測試原型；**正式 Android 發布仍不放行**。Google 真實帳號登入、實體 Android 的共用資料、全螢幕 TWA 與 App Links 尚未驗收。正式網站也尚未部署本分支的 Manifest、返回與遷移修改；測試 APK 預設會開啟現有線上網站，不能把本機測試結果當作線上已更新。

## 找到並處理的問題

| 問題 | 嚴重性 | 處理與證據 |
| --- | --- | --- |
| APK 編譯成功但啟動閃退：生成模板未宣告 ABH 2.7.4 必需的網站設定元件 | P1 | 由 Android logcat 定位缺少的 `ManageDataLauncherActivity`，對照實際 AAR bytecode 與上游原始碼，補上私有、預設停用的元件；不以吞例外或修改第三方套件避開問題 |
| 訪客紀錄在切換 UID 後才備份，程序中斷會失去復原線索 | P1 | 切換前寫入持久備份；由 Firebase 驗證後的 Google subject／UID 綁定目的帳號，錯帳號不匯入，重試保留既有資料；新增 Emulator 與中斷測試 |
| 新流程會忽略舊版 sessionStorage 的待匯入備份 | P1 | 僅對正確已登入 Google UID 升級，保留原備份直到匯入完成；儲存失敗仍顯示待處理 |
| 分享頁以按鈕關閉後，下一次 Back 可能重開原分享 | P2 | 統一管理返回歷史與分享退出；實際 Chromium 測試關閉後返回、三種分享格式、不同課表 A→B 及接近 14,000 字元的有效連結 |
| 收藏內容與匯入確認沒有正確的返回層級 | P2 | 補上詳情／改名／確認與日期選擇的返回，回呼不執行保存、刪除或匯入 |
| 已隱藏的問卷步驟仍會攔截日期頁的 Back，使用者要多按一次才有反應 | P2 | 先以 Chromium 重現，再讓返回處理只在可見的問卷／預覽階段啟用；加入修改日期後一次返回總覽、保留原課表的回歸測試 |
| 本機測試若直接執行可能使用正式 Firebase 預設值 | P1 | 新增測試在任何 Auth／資料寫入前要求 demo 專案與 Emulator 設定 |
| Android 名稱／網址／版本與 SDK／依賴常數分散重複 | P2 | 建置直接讀取兩份既有 JSON；helper 共用 Build Tools 版本，不增加另一套 React 或帳號系統 |
| 測試憑證若進正式 DAL，會混淆測試包與正式包的信任關係 | P1 | 正式 DAL 保持空陣列；精確憑證只放測試 fixture，不提交私鑰，不宣稱已驗證全螢幕 |

## 獨立驗證

| 檢查 | 結果 |
| --- | --- |
| 主 agent 重建 APK、簽章與憑證 fixture | 通過；初版獨立重建一致，但裝置測試抓到閃退，修正後另建 APK 並重新安裝。核對實際編譯的啟動 URL、JSON 網站關聯與 Custom Tabs fallback |
| Android `lintDebug` | 0 errors、16 warnings；保留已固定的工具版本與生成資源／圖示提示，不將「有新版」直接當成升級理由 |
| `npm run check` | lint、235 項單元測試與網站 build 通過 |
| Auth／Firestore Emulator | 56 項通過，含中斷恢復、錯帳號隔離、碰撞保留與冪等重試 |
| GitHub Pages 與 Cloudflare build | 兩種 base path 通過；Manifest、相對圖示路徑與空 DAL 確認正確 |
| Chromium 操作回歸 | 返回／分享、手動排課、收藏／匯入、日期排課、紀錄、恢復、目標與暖身流程通過。整輪最後一項每日切換曾逾時；補診斷後單獨重跑桌機與手機皆通過，沒有放寬斷言，仍須觀察 CI |
| Android 安裝與啟動交接 | 修正版已安裝至 API35 模擬器並交接到 Chrome `FirstRunActivity`；原本的缺元件閃退已修正。首次啟動另遇到無加速環境的系統 Digital Wellbeing ANR，不能用這台模擬器推論一般手機效能 |
| 真實 Google 登入／實體 Android | 未執行，不能宣稱通過 |

Emulator 測試不等同正式 Google 授權或實體 Android 驗收。Android 軟體模擬器無硬體加速，安裝／啟動結果另記 `android/test-fixtures/prototype-build-evidence.json`；不能只以 ADB 連線成功判定 App 已可操作。

## 後續驗收範圍

先在受控網站部署與 Android 裝置完成登入、取消、登出、換帳號、訪客中斷復原、跨裝置雲端資料、返回、分享冷／暖啟動、CSV／剪貼簿與網路失敗驗收。之後才進入長期正式簽章、兩版覆蓋安裝及 GitHub Actions 分發。維護步驟與改動範圍見 [Android 原型說明](android-prototype.md)。
