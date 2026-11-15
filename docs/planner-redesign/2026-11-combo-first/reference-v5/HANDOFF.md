# Reference v5 · 視覺交付

日期：2026-11-14。此目錄為新的獨立視覺基準，不修改 v3/v4、正式 src、DESIGN 或 STATE。

## 開啟與畫面

自含 [prototype.html](prototype.html) 可直接開啟；不載入外部字型／圖片／函式庫，不連接 Firebase，也不持久化資料。

- `?state=empty`：[空白日 390×844](01-empty-390.png)
- `?state=filled`：[已排日 390×844](02-filled-390.png)
- `?state=picker`：[加入面板 390×844](03-picker-390.png)
- [已排日 1440×1000](04-filled-1440.png)
- [加入面板 1440×1000](05-picker-1440.png)

使用 `node scripts/smoke-server.mjs 5211` 後，可開啟 `http://localhost:5211/FunctionalFitnessPlanner/docs/planner-redesign/2026-11-combo-first/reference-v5/prototype.html`。

重拍：`node docs/planner-redesign/2026-11-combo-first/reference-v5/capture.mjs`；對比：`node docs/planner-redesign/2026-11-combo-first/reference-v5/contrast.mjs`。

## 五項具體視覺決策

1. **用日期建立主體**：選取日為唯一深紫週曆塊，大日期29px建立視覺焦點；不靠三階段按鈕組成畫面。手機收掉重複英文日期眉題。
2. **把組合收成一段清楚的工具列**：常用兩列共用淡紫底，名稱直接可見、整列直接加入，沒有逐張卡片或大片說明。已排內容不會被常用區吞沒。
3. **將動作整合為一面訓練日誌**：白色單面、22px圓角；階段小標與細分隔線建立節奏。名稱14px、劑量12px、列高67px；390×844首屏可完整看到四個獨立暖身，其他動作正常向下捲動。
4. **主要操作只有一組節奏**：底部淡紫加入、深紫檢查，54px高；面板用44px加入鈕、名稱展開詳情，加入後原地連續挑選。頁內不放設計說明；沒有以emoji代替功能。
5. **用色彩與字重建立層級，同時保住可讀性**：背景#f6f7fb、主字#24263d、主色#6454d9、常用底#eeecfa；metadata採#756a84附近的實色。五個指定畫面的可見文字對比最低4.52:1，沒有用opacity壓淡metadata。

## 正式元件映射

| 正式範圍 | 原型結構與最終樣式 |
| --- | --- |
| ManualPlanner 日期／編輯標題 | `.week/.date`、`.day-head`。週曆約59px高；標題29px，星期21px。正式已有日期控制時沿用其資料與切換行為，不另建日期模型。 |
| SessionPlanEditor 常用區 | `.favorites/.quick-list/.quick-row`。手機兩列46px，單一底色、中央細分隔；保留完整名稱與直接加入。 |
| SessionPlanEditor 當天內容 | `.exercise-section/.phase/.exercise`。單一白色容器，無逐動作卡片；67px最小列高、14px名稱、12px劑量。暖身仍8筆。 |
| 底部操作 | `.bottom/.bottom-inner/.primary/.add-main/.review-main`。主要按鈕54px，分別淡／深紫；內容留足底部捲動空間。正式需接現有安全區與全站導覽高度。 |
| QuickWorkoutPicker | `.panel/.panel-head/.tabs/.search-wrap/.chips/.panel-body/.combo-row/.combo-add/.panel-foot`。手機滿高；桌面460px側欄。77px清單列，14px名稱＋11px動作數，加入44×44。 |
| 桌面內容重排 | `.main` 在1000px以上用內容＋270px常用側欄；左側動作保持主體。父層已有nav時不要複製原型的固定220px邊欄偏移。 |

HTML末尾有自審後的CSS覆寫；移植時請以最後 computed style 為準，可合併成正式樣式，無需保留覆寫歷史。

**正式範圍界線**：只套手動排課工作區。保留正式全站nav、產品名稱、登入資料。原型的英文品牌、YL頭像與桌面sidebar只是獨立頁框架，不能搬進正式app。不得移植原型的簡化資料、劑量字串或套用行為。

## 已做的實際驗證

- 用 `/usr/bin/chromium` 與 Puppeteer 產出5張PNG；設計agent已實際看過空白／已排／加入手機及桌面圖，修正過密度與對比後重拍。
- 暖身加入8個；再加入髖內旋，總數10，明示1個重複保留原設定；面板維持開啟。
- 切到11/17是空白，再回11/16保留10個；320/390無水平溢出；無pageerror。見 [review.json](review.json)。
- 五個狀態以sRGB相對亮度檢查可見文字與其不透明背景，最低4.52:1，無低於4.5項。見 [contrast-review.json](contrast-review.json)。此項只涵蓋記錄的預設狀態，不等於所有互動、使用者字級或正式介面驗收。

此交付是視覺與獨立互動原型，沒有正式資料寫入、Firebase整合或真人可用性測試。不宣稱運動療效，不捏造訓練估時；40分鐘是情境時間上限。八個暖身名稱及劑量沿用v3示例資料。
