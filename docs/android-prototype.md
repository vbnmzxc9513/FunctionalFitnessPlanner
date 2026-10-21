# Android 第一階段原型

2026-10-21。此階段新增可自行安裝的 debug 原型；未正式發布、未部署至正式主站、未建立 Android CI，也不是正式交付候選。`docs/android-apk-plan.md` 的正式簽章、覆蓋升級、Google 登入及資料驗收門檻仍適用。

- 名稱：**羽球體能（測試）**。
- package：`io.github.vbnmzxc9513.functionalfitnessplanner.prototype`，與未來正式 package 分離。
- 預設來源：`https://badminton-functional-fitness-planner.pages.dev/`。沿用網站的 Firebase 與資料命名空間。
- minSdk 24（Android 7）；compile／target SDK 36。不據此宣稱所有版本或瀏覽器已驗收。
- TWA 使用真實瀏覽器；驗證或支援不足時採 Custom Tabs。未加入 WebView activity、原生 Firebase／OAuth SDK、UA 偽裝、通知、Service Worker 或離線同步。

## 固定來源與工具

`android/` 由 `@bubblewrap/core@1.27.0` 的 `TwaGenerator` 產生，圖示來自本 repository 的 `public/icon.png`。生成時以 loopback HTTP 提供本機圖示，生成完成後 `twa-manifest.json` 改回正式 HTTPS 來源；建置不需執行 Bubblewrap，也不讀取可變的線上 Manifest。

提交的生成後原始碼已調整為 AGP 8.13.2／Gradle 8.13／SDK 36、獨立測試 package、唯一的私人測試憑證、限定 origin 的完整 URI 傳遞、Custom Tabs fallback 與預覽來源設定。若日後重新生成，必須審查及保留這些變更，不能直接覆蓋。

審核後移除了 Gradle 內重複的名稱、網址、App 版本及依賴版本常數：實際建置直接讀取 `twa-manifest.json` 與 `prototype-tooling.json`；建置與憑證 helper 也從同一份工具設定取得 Build Tools 版本。這兩份 JSON 是建置輸入，不只是文件。

裝置審查另修正了生成模板與 ABH 2.7.4 的相容問題：ABH 啟動時會操作 `ManageDataLauncherActivity`，因此即使不開啟網站設定捷徑，也必須宣告這個不對外公開的元件，否則會閃退。保留 Manifest 內的相容註解；升級生成器或 ABH 時除了編譯／lint，必須實際啟動並測試 Custom Tabs fallback。這項修正不複製或修改第三方函式庫。

版本與下載 checksum 在 `android/prototype-tooling.json`；Gradle Wrapper 有 `distributionSha256Sum`，wrapper JAR SHA-256 為 `81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f`，與 Gradle 官方 8.13 wrapper checksum 相同。`android/app/gradle.lockfile` 固定本階段實際解析的 debug 依賴。未宣稱 APK 每次位元組一致。

## 本機建置

需要完整 **JDK 21**（只有 JRE 不能編譯）、Node、Android command-line tools、`platforms;android-36`、`build-tools;36.0.0`。SDK、Gradle cache、憑證與 APK 都不能提交。

```bash
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
# 可選；不要指向 repository。沿用相同 key 才能更新已安裝的測試包。
export PROTOTYPE_KEYSTORE=/private/path/fitness-planner-prototype.jks
scripts/android-build.sh
```

缺少測試 key 時 helper 會建立一把隨機 RSA 3072-bit、365 天有效的私人 key；預設路徑為 `$HOME/.android/fitness-planner-prototype.jks`，alias 為 `prototype`，測試用預設密碼為 `android`。可用 `PROTOTYPE_KEYSTORE_PASSWORD` 覆寫；它不是正式發布簽章方案。不要把正式 key 交給這個 helper。key 不在 repository，其他開發者產生的 key 會有不同 fingerprint。

helper 保留既有代理與 TLS 信任，並把 `HTTPS_PROXY` 的 HTTP proxy host／port 傳給 Java。在本 cloud environment，下載的 JDK 使用 `/etc/ssl/certs/java/cacerts`，避免失去已配置的 CA。沒有關閉 TLS 檢查。

APK 位於 `android/app/build/outputs/apk/debug/app-debug.apk`。helper 執行 `apksigner verify --verbose --print-certs` 並印出 SHA-256。純 Gradle 等價命令是 `./android/gradlew -p android --no-daemon --max-workers=2 assembleDebug`；需自行提供同樣的 SDK、JDK、key、proxy 與 CA 設定。只有有意更新版本時才使用 `--write-locks`。

本次 cloud selectors：`JAVA_HOME=/workspace/tooling/jdk-21.0.12.1`、`ANDROID_HOME=/workspace/tooling/android-sdk`、`GRADLE_USER_HOME=/workspace/tooling/gradle-home`、`PROTOTYPE_KEYSTORE=/workspace/tooling/prototype-signing/fitness-planner-prototype.jks`。

## 網站與驗證

`public/manifest.webmanifest` 的 id／start_url／scope 與圖示 URL 都是相對網址，HTML 使用 `%BASE_URL%manifest.webmanifest`，可同時建置 Cloudflare 根路徑與 GitHub Pages 子路徑。`public/_headers` 為 Cloudflare 明訂 JSON MIME 與重新驗證快取；沒有修改網站部署 workflow。

**正式網站的 `public/.well-known/assetlinks.json` 刻意為 `[]`。** 此原型不把一般 SDK debug key 或私人測試 key 加到正式 DAL。因此預設來源預期可能顯示 Custom Tab 工具列，Android App Links 也未驗證；能產生 APK 不能取代這兩項驗收。

本次實際 APK 的憑證 fixture 在 `android/test-fixtures/prototype-assetlinks.json`，只供受控測試來源使用。重新建置若換 key，必須重新產生：

```bash
ANDROID_HOME=/path/to/sdk node scripts/android-association.mjs \
  android/app/build/outputs/apk/debug/app-debug.apk /private/path/assetlinks.json
```

helper 從已驗證簽章 APK 讀取 package 與 SHA-256，拒絕輸出到 `public/`。fingerprint 是公開資訊，private key 與密碼不得隨 fixture 分發。

需要驗證全螢幕與 App Links 時，先準備獨立的 Cloudflare Pages preview deployment，在該 deployment 的 `/.well-known/assetlinks.json` 放入實際 fixture，並記錄 preview URL 與網站 commit；不要改正式網站 DAL。再用**同一把 key**建置目標 preview 的測試包：

```bash
scripts/android-build.sh -PprototypeHost=PREVIEW.badminton-functional-fitness-planner.pages.dev
node scripts/android-check-site.mjs https://PREVIEW.badminton-functional-fitness-planner.pages.dev \
  android/test-fixtures/prototype-assetlinks.json
```

`prototypeHost` 僅接受此專案正式來源或其 Cloudflare preview 子網域；同時設定啟動 URL、Android App Links host 與 APK asset statements。它不授權／執行部署。未指定 property 時始終使用正式來源。產出 preview APK 後記錄它自己的 SHA-256，不能沿用正式來源原型的 checksum。

`android-check-site.mjs` 使用保留 proxy／CA 的 curl，檢查無 redirect 的 HTTP 200、正確 MIME、JSON、Manifest scope 與實際憑證關聯；不把 JSON 成功宣稱為裝置驗證成功。

## 原生連結與實機重現

Launcher 採 `standard` launch mode；一般暖啟動會建立新的 launcher。`getUrlForIntent` 接受 `ACTION_VIEW` 的同來源 HTTPS URI，直接回傳原始 `Uri`，不以 `start_url` 重建、不解碼／重編碼 query 或 fragment。拒絕其他 host、userinfo、非 443 port 或 scheme。明確帶 `SINGLE_TOP` 的暖啟動另由 `onNewIntent` 更新 Intent 後再啟動瀏覽器。

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -a android.intent.action.MAIN \
  -n io.github.vbnmzxc9513.functionalfitnessplanner.prototype/.LauncherActivity
# 冷啟動：先停止 wrapper，再以外部 ACTION_VIEW 開啟真實有效的分享 URL。
adb shell am force-stop io.github.vbnmzxc9513.functionalfitnessplanner.prototype
adb shell am start -a android.intent.action.VIEW -d 'https://HOST/#plan=PAYLOAD' \
  -n io.github.vbnmzxc9513.functionalfitnessplanner.prototype/.LauncherActivity
# 已開啟 A 時，再送 B（另測 #program= 長連結及相容 #workout=）。
adb shell am start -a android.intent.action.VIEW -d 'https://HOST/#program=PAYLOAD_B' \
  -n io.github.vbnmzxc9513.functionalfitnessplanner.prototype/.LauncherActivity
# Android 12+ 的 App Links 驗證；全螢幕 TWA 與外部連結攔截需分開觀察。
adb shell pm verify-app-links --re-verify io.github.vbnmzxc9513.functionalfitnessplanner.prototype
adb shell pm get-app-links io.github.vbnmzxc9513.functionalfitnessplanner.prototype
```

指定 component 能測 URI 傳遞，但不能證明外部 App Links 自動攔截；後者須移除 `-n` 由其他 App 開啟已驗證來源。也要測驗證失敗時的 Custom Tabs 與不同預設瀏覽器。沒有任何支援瀏覽器時的行為取決於裝置，尚未承諾可正常使用。

## 本次結果與界線

建置、簽章／compiled Manifest 與資源檢查結果記於 `android/test-fixtures/prototype-build-evidence.json`。本環境無實體裝置、無 `/dev/kvm`；software emulator 的結果另記在同一 evidence 與下方紀錄。沒有登入真正 Google 帳號，沒有真機 Google 授權或跨裝置同步的通過證據。

仍待裝置驗收：Google 登入／取消／登出／換帳號、訪客綁定與中斷復原、雲端資料共用及帳號隔離、系統返回、真實有效分享的冷／暖預覽、系統分享／剪貼簿／CSV 中文檔名、網路中斷、最低 API／最新正式 API、Chrome／預設瀏覽器切換。正式簽章與 DAL、兩個 versionCode 覆蓋安裝、Actions／分發屬後續階段。

## 維護方式與改動成本

| 日後改什麼 | 主要修改位置 | 是否要新 APK |
| --- | --- | --- |
| 動作、排課、介面與文字 | 原本的 React／domain 程式 | 通常不用；部署網站並檢查舊外殼相容性 |
| 登入、返回、分享／匯入 | 既有服務及本次共用 hooks | 通常不用；除了網站測試，補 Android 瀏覽器驗收 |
| 外殼名稱、App 版本、啟動設定 | `android/twa-manifest.json`，Gradle 直接讀取 | 要；桌面名稱與版本屬安裝包內容 |
| Android SDK／ABH／AGP | `android/prototype-tooling.json`，更新依賴鎖檔 | 要；只在平台需求或明確問題時更新 |
| Gradle | 官方 Wrapper 更新命令、Wrapper checksum、工具版本紀錄 | 要；不要為消除「有新版」提示直接升級 |
| 網域、套件名稱、簽章 | 原生設定、網站關聯與登入設定；分享主站另見 `src/domain/publicOrigin.js` | 要；涉及連結與帳號入口遷移，避免日常更動 |
| 外殼圖示 | 本機產生的 Android `res/` 與網站圖示 | 要；不要重新產生並覆蓋整個 Android 專案 |

網站日常開發仍使用 `npm run check`；登入、排課、分享或返回流程改動再跑 `npm run test:integration`。原生設定或依賴修改以 `scripts/android-build.sh lintDebug` 一次建置、檢查 Android lint、驗證簽章，並在 Android 安裝測試。依賴升級才使用 `--write-locks`；一般建置保留已提交的鎖定版本。

`src/hooks/useBackNavigation.js` 與 `src/domain/backNavigation.js` 集中處理返回歷史。新增會覆蓋目前畫面的狀態時，重用 `useBackNavigation(active, closeCallback, priority)`，回呼只關閉／返回，不套用課表或標記完成；不要在各畫面另外加入 `popstate` 攔截。現有順序為詳情／確認視窗、挑選器、每日／編輯、排課工作區、根頁，相關回歸集中在 `scripts/navigation-smoke.mjs`。

TWA 沒有自己的帳號、課表 UI、Firebase Native SDK 或資料同步服務，這些繼續由網站維護。不要在外殼重做同一份邏輯；需要原生能力時先重新評估架構，而不是逐步堆入另一套系統。未來 Android Actions 直接建置已提交的外殼，不在每次網站提交重新執行 Bubblewrap。
