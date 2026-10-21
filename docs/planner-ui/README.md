# 核准原稿與實際 App 對照

核准來源為 `design/planner-ux-v2` 分支的 `9fa6969`。這裡的右欄來自實際 React App，並非重新畫的原型。兩側都以 390 CSS px 呈現；左欄保留原稿的原型提示，正式版不顯示該提示。動作、分鐘和天數取隔離裝置中的測試資料，因此不會與原稿的範例數字相同。

| 畫面 | 對照 PNG |
| --- | --- |
| 本週首頁 | [原稿／實際](compare-01-home.png) |
| 手動排課工作台 | [原稿／實際](compare-04-manual.png) |
| 加入動作 | [原稿／實際](compare-05-picker.png) |
| 我的課表列表 | [原稿／實際](compare-07-library.png) |
| 收藏課表詳情 | [原稿／實際](compare-08-library-detail.png) |
| 分享課表日期對應 | [原稿／實際](compare-11-dates.png) |

補充實際畫面：[分享設定](09-share.png)、[接收者預覽](10-recipient.png)、[自動排課條件](14-auto-goals.png)、[身體狀態](15-auto-body.png)、[自動課表預覽](17-auto-preview.png)。

## 重現

`node scripts/planner-visual-capture.mjs` 會在隔離的瀏覽器情境產生 17 個實際畫面，預設存入已忽略的 `artifacts/planner-visual`。不登入帳號，也不寫入正式服務。課表 fixture 由真正的固定規則引擎產生，手動、收藏、分享及接收流程使用真正的 App。

如需並排比較，先從上述設計分支取出 `design/planner-v2`，以 `PLANNER_REFERENCE_DIR` 指定該目錄；可用 `PLANNER_VISUAL_OUTPUT` 指定輸出位置。沒有參考圖時只輸出實際畫面。

## 檢查方式與界線

依核准的資訊層級逐頁核對，另由兩位 agent 檢查首屏、字重、留白、導覽與漸進揭露，再由主 agent 檢視整合後截圖及真實操作回歸。這是 agent 走查與瀏覽器驗證，不能取代真人任務測試或正式無障礙評鑑。

自動問卷保留三步，將條件、身體狀態與偏好動作分開；原型的兩個問卷示意頁沒有完整涵蓋既有欄位。公開分享目前保留必要的隱私限制：單日用公開總名辨識，多日以來源日序號呈現，不公開原作者私人的每日主題。整段套用尚未提供撤銷，動作／階段複製也不宣稱完整涵蓋原型所有構想。
