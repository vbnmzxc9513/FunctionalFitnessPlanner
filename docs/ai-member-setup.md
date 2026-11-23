# AI 會員雲端金鑰設定指南（Cloud Functions + Secret Manager）

本專案支援兩種 AI 排課授權模式：
1. **BYOK（預設，免後端費用）**：使用者在瀏覽器貼上自己的 Google AI Studio API Key（僅存本機 `localStorage`）。
2. **會員制雲端代理（安全，Key 絕不送到瀏覽器）**：由管理員在 Firestore 新增 `aiMembers/{uid}` 名單，會員登入後由 Firebase Cloud Functions 使用 Secret Manager 內的 Gemini API Key 代為呼叫。

---

## 首次啟用步驟（管理員操作一次即可）

### 1. 確認 Firebase 專案已開通 Blaze 方案
Cloud Functions v2 與 Secret Manager 需要 Firebase Blaze 方案（按量計費，小型個人使用通常在免費額度內，建議同步在 Google Cloud Console 設定預算警示）。

---

### 方式 A（推薦）：GitHub Actions 一鍵自動部署（免在本機跑 CLI）

#### A-1. 取得 Firebase Service Account JSON
1. 開啟 [Firebase Console](https://console.firebase.google.com/project/myfitnessapp-c4aba/settings/serviceaccounts/adminsdk) → **專案設定 → 服務帳戶（Service accounts）**。
2. 點選 **「產生新的私密金鑰（Generate new private key）」**，下載 `.json` 檔（請妥善保管，切勿提交到 Git）。
   > 若使用自訂服務帳戶，需具備 Firebase Admin / Cloud Functions Admin / Secret Manager Admin / Service Account User 權限；使用預設 `firebase-adminsdk` 通常已涵蓋部署所需權限。

#### A-2. 在 GitHub Repo 設定 2 個 Secrets
前往 GitHub Repo → **Settings → Secrets and variables → Actions → New repository secret**，新增以下兩個 Secret：
1. **`FIREBASE_SERVICE_ACCOUNT`**：貼上剛剛下載的 Service Account `.json` 檔案**完整內容**。
2. **`GEMINI_API_KEY`**：貼上你的 Google AI Studio Gemini API Key（會由 Workflow 安全寫入 Firebase Secret Manager `FITNESS_TRIAL_GEMINI_KEY`，不會印在日誌也不會進前端）。

#### A-3. 一鍵執行部署
1. 前往 GitHub Repo → **Actions** → 左側選擇 **「Deploy Firebase Functions & Rules」**。
2. 點右上角 **「Run workflow」**：
   - `target` 保持預設 `member_ai_and_rules`（部署 `firestore:rules`、`requestMemberAiPeriodChunk`、`requestMemberAiCoachReply`）。
   - `sync_gemini_secret` 保持勾選 `true`（將 `GEMINI_API_KEY` 同步寫入 Secret Manager）。
3. 等待約 2–3 分鐘變成綠勾，即完成部署！以後每次改完後端或更換 API Key，都只要回來點一次 **Run workflow**。

---

### 方式 B（備用）：在本機使用 Firebase CLI 手動部署

#### B-1. 將你的 Gemini API Key 存入 Firebase Secret Manager
> 切勿將 API Key 寫在程式碼、`.env` 或 Firestore 文件中。

```bash
npx firebase login
npx firebase functions:secrets:set FITNESS_TRIAL_GEMINI_KEY --project myfitnessapp-c4aba
```
執行後貼上你的 Google AI Studio API Key 並按 Enter。

#### B-2. 部署 Firestore 安全規則與會員雲端函式
```bash
npm ci --prefix functions
npm run build --prefix functions
npx firebase deploy --only firestore:rules,functions:requestMemberAiPeriodChunk,functions:requestMemberAiCoachReply --project myfitnessapp-c4aba
```

---

## 如何新增／停用會員（Firebase Console）

1. 開啟 Firebase Console → **Authentication → Users**，複製該使用者的 **User UID**（須使用 Google 登入，匿名訪客不適用）。
2. 前往 **Firestore Database**，建立／編輯文件：
   - 集合（Collection）：`aiMembers`
   - 文件 ID（Document ID）：貼上該使用者的 `UID`
   - 欄位（Fields）：
     - `active`（boolean）：`true`（設為 `false` 或刪除文件即立即停用）
     - `tier`（string，選填）：`"member"`
     - `dailyLimit`（number，選填）：`20`（該會員每日共享額度，合併計算 AI 自動排課每週區塊與 AI 教練對話次數，上限 50，預設 20）
     - `expiresAt`（timestamp 或 ISO 字串，選填）：到期時間，留空表示無期限

設定完成後，該會員在 App 的「課表 → 自動排課 → AI 教練排課」、「✨ 問 AI 教練」對話與「設定」頁會立即看到 **「會員專屬雲端 AI 已啟用 · 免填 API Key」**，無需輸入 API Key 即可直接使用 AI 自動排課（1–28 天）與 AI 教練對話。
