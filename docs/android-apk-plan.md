# Android APK 製作方案評估

評估日期：2026-10-21。依據目前 `main` 的 `6ab8aeb`。本文件為方案與審查紀錄，尚未實作或產出 APK。

## 1. 建議與範圍

建議先做 **TWA（Trusted Web Activity）＋ Bubblewrap 產生的 Android 外殼**，使用 GitHub Actions 建置正式簽章 APK，先以 GitHub Releases 的測試版提供少量使用者安裝。網站與 App 都使用同一份線上 React 網站、Firebase Authentication、Firestore 與既有資料路徑。

建議有條件成立：先在 Android 驗證 Google 登入、訪客綁定、資料共用、返回鍵與分享連結。這些測試尚未執行，不能以網頁測試或成功產生 APK 取代。若 TWA 的真機流程無法達標，先查明原因；需要原生登入或原生能力時再比較 Capacitor，不改用偽裝瀏覽器的 WebView。

第一版只處理 Android 安裝、啟動網站、Google 帳號與既有功能的可用性。沿用線上運作，不承諾完整離線記錄、背景計時／提醒、Health Connect 或自動安裝 APK 更新。不需要先建立另一套原生課表系統，也不把完整離線 PWA 當成製作 APK 的先決條件。

## 2. 目前專案的實際條件

- React 19／Vite 7，已具有手機介面；沒有 Android、Capacitor、Web App Manifest 或 Digital Asset Links 設定。
- `src/hooks/useAuth.js` 使用 Firebase Web 的 `signInWithPopup`／`linkWithPopup`。匿名帳號連到既有 Google 帳號時，已包含擷取與重試匯入流程；但備份在切換 UID 後才寫入 `sessionStorage`，不能據此承諾程序遭終止後仍可復原。Android 必須驗證並補強這個中斷缺口。
- `src/services/firebase.js` 的 Firebase 專案與 `VITE_APP_ID` 決定既有資料命名空間。Android 套件名稱與這個資料命名空間是不同概念，不可因新增 APK 換掉後者。
- 網站有 Cloudflare 根路徑及 GitHub Pages 專案子路徑兩個入口。建議 APK 固定開 `https://badminton-functional-fitness-planner.pages.dev/`，或在實作前選定自訂網域。GitHub Pages 現有入口維持使用。
- 2026-10-21 唯讀檢查：Cloudflare 的 `/manifest.webmanifest` 與 `/.well-known/assetlinks.json` 均為 HTTP 200，但內容是 `text/html`、不是 JSON；屬於 SPA fallback，不能判定已設定。GitHub 使用者網域根目錄的 `/.well-known/assetlinks.json` 是 404。
- 既有分享使用 `#plan=`、`#program=` 與相容的 `#workout=`。Android 冷啟動與已開啟時都須保留完整 fragment。
- `sharedPlanRepository.js` 與舊分享函式沿用發送端 origin，GitHub Pages 產生的舊分享連結不會因 Cloudflare 完成驗證就自動開啟 APK。
- 目前讀取的 GitHub `deploy.yml` 只部署 GitHub Pages，沒有證據能從它確認 Cloudflare 正式網站部署了哪個 commit；原型與發布紀錄須另外建立這項對應。
- 本次未讀取 Firebase 管理端 OAuth 設定，授權網域與同意畫面狀態仍待確認。

## 3. 製作方式比較

| 方案 | 網站更新的連動 | Google 登入與資料 | 維護負擔／判斷 |
| --- | --- | --- | --- |
| TWA＋Bubblewrap | 載入網站；重新開啟／重新整理並依 HTTP 快取取得新版 | 沿用 HTTPS 網站登入及同一 Firebase；須實機測試 popup／回跳 | 最符合目前需求；推薦 |
| 小型 Custom Tabs 啟動器 | 同上 | 使用瀏覽器，仍需測試 | 很簡單，但會出現瀏覽器工具列；可作原型或明確降級方式 |
| Capacitor，將 React build 打包到 App | 雲端資料可共用；內建介面通常需重新建置發版 | 應規劃原生／系統瀏覽器登入並接回 Firebase，不能照搬內嵌 popup | 若確定要原生提醒、背景功能、完整離線，才更有價值 |
| 遠端網站直接放普通 WebView | 網站可更新 | Google OAuth 的內嵌瀏覽器限制，另有返回、分享與下載整合工作 | 不作首版捷徑；不偽裝 User-Agent 繞過限制 |
| Kotlin／Flutter／React Native 重寫 | 需維護另一份介面與發版 | 可共用後端，但不是直接共用現有介面 | 目前沒有足以支持重寫的需求 |

Bubblewrap 是產生／更新 TWA 專案的工具；PWABuilder 是可用的 GUI 入口，底層同樣可用 Bubblewrap，不是另一種 Android 架構。TWA 是瀏覽器提供的能力，不是自行內嵌 WebView；瀏覽器支援、網域驗證或簽章不符時，可能降級成有工具列的 Custom Tab。Bubblewrap 本身的 README 也明示它不是受 Google 官方支援的產品，因此應保留產生後原始碼與固定版本，不依賴線上產生器永遠不變。

## 4. 網域、帳號與同步規則

1. **固定一個正式來源**：APK 啟動、Manifest 的 `start_url`／`scope`、App Links 都對準選定的 HTTPS origin。不把兩個網站的瀏覽器儲存空間當成同一份資料。自訂網域若確定要用，宜在首版前選定，避免日後改 APK 網址與本機草稿位置。
2. **共用雲端帳號**：使用同一 Firebase 專案及既有 `VITE_APP_ID`。以經 Firebase 驗證的 UID 存取原有課表、收藏、紀錄；不以 email、Android 裝置 ID 或 APK 套件名稱另建一份帳號資料。
3. **分清資料與登入狀態**：已寫入帳號的雲端資料可跨裝置讀取；未登入的裝置資料、未儲存表單、Google 綁定前的草稿不保證自動遷移。同一 origin 與瀏覽器 profile 的網站和 TWA 可能共用登入及登出效果；換 origin、瀏覽器、profile 或清除瀏覽器資料則需重新驗證。共用 UID 不代表每個入口自動登入；移除 APK 也不等於清除瀏覽器資料。
4. **登入路徑**：TWA 首版執行的是 HTTPS 網站的 Firebase Web 登入，不先混入原生 Firebase SDK。確認授權網域，測試新登入、取消、登出、換帳號、重新開啟及匿名綁定。先測現有 popup；若不可靠，再依 Firebase 官方方案評估同源 `/__/auth/` 透明反向代理、對應 `authDomain` 與 OAuth redirect URI，以及完整的 `linkWithRedirect`／`getRedirectResult` 流程。Cloudflare 與目前 `firebaseapp.com` 的跨源儲存限制不能只靠替換 API 解決；回跳須保留分享 fragment、取消狀態及遷移語意。OAuth 頁面顯示瀏覽器工具列可以接受，不為隱藏它而信任 Google 網域。若需要改用原生登入，另正確註冊 Android OAuth client 並接回同一 Firebase 身分，不能把網頁 client 直接拿去當原生 client。
5. **不轉交認證資料**：APK 不讀取 Chrome cookies；不把 ID token、refresh token 或私人紀錄塞進 App Links／查詢字串。不得以修改 User-Agent 繞過 Google 政策。
6. **訪客遷移可復原**：對會切換 UID 的遷移，在切換前完成可跨分頁重建／程序終止復原的本機備份，登入成功後綁定經驗證的目標 UID，成功匯入才清除。保留去重與失敗重試，不把待遷移資料自動匯入任意下一個登入帳號。先用 Emulator 驗證中斷、重試及帳號隔離，再做 Android 終止／重開驗收；目前程式尚未符合此承諾。
7. **分享來源**：首版新產生的公開課表分享統一使用選定正式 origin，保留完整分享內容；既有 GitHub Pages 分享繼續在瀏覽器可用，不宣稱會直接開 APK。除非另取得 GitHub origin 根目錄的驗證檔控制權，否則不將它加入已驗證 App Links。也不強制轉移整個網站入口，以免混淆原 origin 的本機草稿。

## 5. 原型先行與最小檔案範圍

### A：確認網站可驗證

- 補 `public/manifest.webmanifest`、一般與 maskable 圖示、名稱、啟動網址、顯示模式及色彩；沿用現有視覺。
- 在正式 origin 根目錄提供 `public/.well-known/assetlinks.json`，宣告 Android package 與實際簽章的 SHA-256 指紋。以正式網址檢查內容與 MIME；HTTP 200 的 HTML、登入頁或重新導向均不算成功。
- 分開處理兩個結果：TWA 的可信任網站關聯，以及 Android App Links。檢查產生後 Android 端網站關聯設定與含 `VIEW`／`BROWSABLE`／`DEFAULT`、`autoVerify` 的 intent filter，僅涵蓋已驗證正式網站。沒有工具列不等於外部連結一定會開 APK；兩者分開測試。將來使用 Play app signing 時，DAL 採使用者實際安裝包的簽章憑證，不誤用 upload key。
- 以不同設定處理 Cloudflare `/` 與 GitHub Pages `/FunctionalFitnessPlanner/`，不能讓新 Manifest／圖示破壞原有網站子路徑。
- 先確認現有 HTML 的重新驗證與 fingerprint assets 快取行為。不為了包 APK 同時導入 Service Worker／全量離線同步，避免增加舊版畫面或私人資料快取問題。

### B：產生原型並驗證關鍵流程

- 使用固定版本 Bubblewrap 產生 `android/` 專案，保留 Gradle Wrapper、產生後原始碼、`twa-manifest.json` 與工具版本；後續 CI 不每次從可變的線上 Manifest 重新產生整個專案。
- package 建議候選 `io.github.vbnmzxc9513.functionalfitnessplanner`，實作時確定後保持穩定。測試與正式簽章若不同，測試包使用不同 package，避免正式更新衝突。
- debug 原型只證明基本流程。正式候選必須使用最終 package／長期簽章，直接驗收要交付的 APK；另產生一個遞增 `versionCode` 的同簽章候選，實測覆蓋安裝。debug 包驗收結果不能代替正式包的 DAL、分享攔截與升級結果。
- 在可取得的 Android 真機及模擬器驗證；版本範圍依實際選用的依賴與瀏覽器確認，不先宣稱支援所有 Android 手機。至少涵蓋最低支援版本與目前正式版本、一般大小與窄螢幕，以及 Chrome／預設瀏覽器切換。
- Google 登入須在真正可完成授權的 Android 環境驗證；現有 Puppeteer／Firebase Emulator 測試只能覆蓋其中一部分。
- 外部 `ACTION_VIEW` 應將完整 URI 送入 TWA，不重設成 `start_url`。測試冷啟動與已開啟分享 A 時再收到分享 B，以及長 `#program=`；React 已監聽 hash／history 事件不能代替 Android intent 驗證。
- 定義系統返回：先關動作詳情，再返回挑選／每日／週總覽；最上層才離開。現有頁面多以 React state 切換，沒有完整路由歷史，可能需要小範圍 History 適配。不能假設包成 APK 後自然成立。

### C：加入 Actions 建置與測試版分發

新增獨立 `.github/workflows/android.yml`，不把 Android 建置失敗綁成網站無法發布。

- PR：不讀簽章 Secrets；以 `./gradlew assembleDebug` 驗證設定與 debug APK，不發布正式檔。
- 手動執行 `workflow_dispatch` 或推送 `android-v*` 標籤：從受信任、已通過檢查的 commit 以固定 Gradle Wrapper 的 `assembleRelease` 建置 release。固定 Node、JDK、Android SDK／Build Tools、Gradle 與依賴版本，提交 Wrapper checksum 與依賴鎖定設定；實際版本在原型階段選定。保存工具版本以供追溯重建，不先承諾每次 APK 位元組完全一致。
- 正式簽章金鑰首次建立後備份；Secrets 綁定受保護的 GitHub environment 與允許發布的 ref，不寫進 repo、網頁、APK 設定檔或日誌。一般 PR、fork PR 與可指定任意 ref 的未驗證輸入不能取得金鑰；不用 `pull_request_target` checkout PR 程式後執行帶金鑰的建置。
- 建立候選 APK 後檢查 `apksigner verify`、package、遞增的 `versionCode`、簽章指紋與網站 Asset Links 一致性；驗證成功才上傳／發布。
- CI Artifact 供短期測試；首版 GitHub Release 先標為測試版，附 APK、SHA-256、簽章指紋、版本、外殼 commit、固定網站網址及安裝／更新說明。驗收通過後將同一檔案升為正式版，不重建另一份未驗收的 APK。不要自動把每次網站版面修改都當成新的 APK 版本。
- APK 外殼 commit 不等於正在執行的網站版本。測試紀錄與 Release 另外保存 Cloudflare deployment／網站 commit 的對應；若現有部署無法提供，先建立可核對的部署資訊。發布前對正式 origin 檢查 Manifest、DAL 及關鍵流程；不能只用 GitHub Pages 建置成功當作 Cloudflare 已更新的證據。
- Release 的 SHA-256 可協助檢查下載完整性，不取代 Android 簽章驗證。
- 網站更新時保持 API／資料格式與已發外殼相容。外殼網址、權限、啟動圖示或必要 Android 設定改動，才另發 APK；APK 的安裝更新不宣稱會自動完成。

擬新增的主要檔案為 `android/`、上述 Manifest／圖示／Asset Links、Android workflow 與發布說明。網站端限於上述必要的遷移復原、分享來源與部署追溯；登入方式或 History 的調整依原型結果決定，不全面改寫 App。

依序交付：① 可安裝原型及登入／返回／分享的測試紀錄；② 最終簽章候選與覆蓋安裝結果；③ Actions 與 GitHub prerelease。每階段通過才擴大下一階段工作；真機驗收之前不對外宣稱正式可用。

## 6. 發布前驗收

| 任務 | 通過條件 |
| --- | --- |
| 安裝與升級 | 驗收最終 package／簽章候選的新安裝，以及兩個遞增 versionCode 的覆蓋安裝；不要求重裝，不能只看 debug APK 能編譯 |
| 啟動與瀏覽器降級 | TWA 驗證成功時全螢幕；另測 App Links 的外部連結處理。缺少支援瀏覽器或驗證失敗時，能理解實際開啟方式，不顯示假成功 |
| Google 登入 | 登入／取消／登出／換帳號／殺掉重開都合理；匿名綁定新帳號與既有帳號不遺失已完成紀錄、不覆蓋別人資料；在 UID 切換前後、匯入中強制終止後可安全恢復 |
| 網站與 APK 共用資料 | 同一 Google 帳號在電腦排課，APK 取得該雲端課表；APK 寫入實做後網站可讀；換帳號不殘留前人資料 |
| 本機草稿 | 說明裝置限定的資料；返回與暫離不默默清除；不承諾換 origin／瀏覽器／清除資料後仍保留 |
| 系統返回 | 動作視窗、動作挑選、每日、週總覽依定義返回；不因返回意外標記完成或套用課表 |
| 分享連結 | 正式 origin 的 `#plan=`／`#program=`／舊 `#workout=` 冷啟動及暖啟動 A→B 都能預覽，保留完整 fragment；舊 GitHub 連結在瀏覽器可用。確認匯入前不寫課表或完成紀錄；外部網站與登入頁不任意成為受信任內容 |
| 匯出與分享 | 系統分享面板、剪貼簿、CSV 下載與中文字檔名實際可用，不假設桌面瀏覽器通過就足夠 |
| 網站改版 | 記錄外殼版本與實際網站部署版本；不換 APK 部署網站後，重開／重新整理能看到新版，舊外殼仍相容；不在未儲存輸入中強制重載 |
| 網路中斷 | 清楚知道仍需連線；未完成的雲端寫入不顯示成已同步，也不把快取當最新資料 |
| 回歸 | 既有 lint、unit、Firestore／Auth 整合及瀏覽器流程通過；另保留 Android 實機結果與未驗證項目 |

**Go／No-go**：沒有真機 Google 登入結果、簽章／DAL 不匹配、分享丟 fragment、帳號資料隔離失敗或既有紀錄保護失敗時，不發布正式版。系統返回與匯出若不符合首版定義，也先修正或明確縮減首版承諾，不能直接標為已完成。

## 7. 分發與後續判斷

先提供 GitHub Release APK；這能先確認真實使用體驗，但下載、允許來源安裝與後續手動更新，比 Play 商店多步驟。需要廣泛推廣時再評估 Play 的 AAB、簽章及上架流程；CI 能產檔不代表已通過商店審核。

Android 的開發者驗證政策在變動。2026-10-21 查到的官方資料描述：2026-09-30 起在巴西、印尼、新加坡、泰國的參與商店／Android 7+ 認證裝置開始，2027 年再擴展。因此發布時須按目標地區與分發管道確認，不宣稱從 GitHub 下載就永久不受註冊／驗證要求影響，也不把目前規則誤說成所有地區的 GitHub APK 已一律被封鎖。

若未來主要需求變成離線完整訓練、原生背景提醒、Health Connect 或大量原生整合，再考慮 Capacitor；保留 React 與 Firebase，原生登入及資料同步仍需重新驗證。若只是嫌 Custom Tab 有工具列，先修正 TWA 的驗證／瀏覽器支援，不因此重寫整個 App。

## 8. 官方依據

- [TWA 概覽](https://developer.chrome.com/docs/android/trusted-web-activity)
- [TWA／Bubblewrap 起步與 Digital Asset Links](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Bubblewrap 原始碼與工具維護界線](https://github.com/GoogleChromeLabs/bubblewrap)
- [Google OAuth 政策](https://developers.google.com/identity/protocols/oauth2/policies)
- [Firebase 網頁 Google 登入](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase redirect 與跨源儲存限制](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Android App Links 與 Intent filters](https://developer.android.com/training/app-links/add-applinks)
- [Custom Tabs 與瀏覽器狀態共用](https://developer.chrome.com/docs/android/custom-tabs)
- [Android App 簽章](https://developer.android.com/studio/publish/app-signing)
- [Android 開發者驗證](https://developer.android.com/developer-verification)
- [Capacitor Android 文件](https://capacitorjs.com/docs/android)

## 9. 獨立審查

已由兩位獨立 subagent（`gpt-6.1-sol`，登入架構採 high、CI／分發採 medium）唯讀檢查方案、相關原始碼與官方文件。兩者均有條件推薦 TWA＋Bubblewrap，沒有提出更符合現階段需求的替代架構；不將 Custom Tabs 視為登入可靠性的保證。

| 審查角度 | 發現 | 本版處理 |
| --- | --- | --- |
| 登入，P1 | popup 失敗後不能直接換 redirect | §4 加入同源 auth handler、OAuth URI、回跳及匿名綁定評估路徑 |
| 資料，P1 | 匿名遷移備份建立太晚且依賴 sessionStorage | §4／§6 要求 UID 切換前可復原備份與強制終止驗收；尚未修正程式 |
| 分享，P2 | GitHub 舊網址不受 Cloudflare DAL 涵蓋 | §4 固定新分享來源、保留舊連結瀏覽器使用；§5／§6 加冷／暖完整 URI 測試 |
| 驗證，P2 | TWA 全螢幕與 App Links 為不同結果 | §5 分開設定／驗收，並區分實際安裝簽章與 Play upload key |
| 帳號，P2 | 共用 UID 不代表跨入口自動登入 | §4 明列 origin、瀏覽器 profile、登出與移除 APK 的狀態邊界 |
| 發布，P1 | APK commit 無法證明線上網站版本 | §2／§5／§6 追蹤 Cloudflare deployment 與網站 commit，驗收正式 origin |
| CI，P2 | 工具固定與簽章權限需要可執行契約 | §5 明訂 Gradle 指令、Wrapper checksum、鎖定依賴與受保護 release Secrets |
| 發布，P2 | debug 包無法證明正式包可升級及驗證 | §5／§6 要求最終簽章候選、兩版覆蓋安裝，驗收後發布同一 APK |

這些是已納入方案的修正，尚未代表程式問題已解決。沒有 APK 建置、簽章、正式 origin 部署版本關聯或真機 Google 登入的實證；正式發布仍以 §6 為準。若目標只剩手機桌面捷徑，可安裝 PWA 的成本更低；在明確要求 APK 的前提下，保留目前建議。
