# Controlled AI trial (disabled by default)

The ordinary planner works without an AI key. BYOK stays available independently. The optional hosted trial is an implementation for a future operator-funded service; adding its files does **not** activate billing, create a shared key, or enable free AI in production.

## Boundary and contract

`requestAiTrialPlan` is a Firebase Functions v2 callable in `asia-east1`. Only Firebase Google sign-in is accepted (anonymous guests and other providers cannot use it). The callable enforces Firebase App Check. Web clients initialize reCAPTCHA Enterprise App Check using a public site key; the Gemini secret never reaches the browser.

Client input is limited to `context`, `dailyTime` (integer 10–60), `lang` (`zh`/`en`), `userGoal` (300 characters), and `userMessage` (500). Health/recovery notes accept at most 2,000 characters each, matching the existing profile. Requests over 12,000 serialized characters fail. The client sends no progress history, arbitrary prompt, model, API key, or exercise catalogue. The server rejects prompt/model/catalogue fields, ignores client dates, and calculates date and ISO week using UTC. UTC is also the quota reset timezone, not the user's local timezone. The callable returns `{ plan, currentWeek, currentDate }`, with the period captured once from the server request clock for both new and cached responses. The frontend checks the returned week before saving. Near Sunday/Monday when the device's local week differs from UTC, the frontend declines with `AI_TRIAL_WEEK_MISMATCH` **before calling the backend**; this predictable mismatch consumes no attempt. The hosted trial is available only when UTC and local weeks match. A rollover during an in-flight request is rejected before saving, but its reserved attempt may already have incurred a charge. Template/BYOK planning remains available through these boundaries.

The server constructs the coaching prompt from the repository's reviewed domain modules and catalogue, filters equipment/experience/partner/health eligibility, and validates the returned five-day plan including phases, preparation, volume and duration. The frontend validates it again before saving. These checks are programming constraints, not medical clearance; clinical notes must still be reviewed with the treating professional.

`functions/build-shared.mjs` copies an explicit allowlist of seven domain files and the catalogue into ignored `functions/shared/` during build/predeploy. No Firebase configuration, credential file, custom exercise, or user data is bundled. Changes to planner domains must be rebuilt before deploying functions.

## Cost controls

- One **attempt** per Firebase UID per UTC ISO week, reserved transactionally before the provider request.
- A global daily call cap shared by all accounts, required and limited to 1–100. The effective cap is the smaller of deployment parameter and server runtime document.
- Same normalized input returns a validated cached result; different input uses no second call. Pending requests return `AI_TRIAL_BUSY`, failed requests exhaust the week's attempt. Timeouts, invalid JSON and provider failures are **not refunded**, because they may already incur a charge.
- No billable retry. Fixed model `gemini-2.5-flash`; maximum 60,000 UTF-8 prompt bytes, 8,192 output tokens, thinking budget zero, a 45-second provider timeout and a 200,000-byte streamed response limit.
- Function maximum two instances, concurrency one, 60-second request timeout, 256 MiB memory. Instance limits are infrastructure constraints; atomic Firestore counters are the admission control.

Call limits are **not a monetary budget guarantee**. Firebase execution, Firestore, App Check, Secret Manager and Gemini may incur charges. Provider pricing can change; a timed-out call may still finish and bill. Configure billing alerts and provider/project quotas independently. Alerts generally notify rather than stop spending.

## Requirements before an operator enables it

1. Use a Firebase project with the required billing plan (normally Blaze for this deployment). Review expected regional service charges and ownership of the funding account.
2. Create a dedicated restricted Gemini API key for this service. Store it in Secret Manager using Firebase CLI `functions:secrets:set FITNESS_TRIAL_GEMINI_KEY`; enter it interactively. Never put it in `VITE_*`, source control, a client bundle, an issue, or chat.
3. Register the web app and its actual deployed domains with Firebase App Check/reCAPTCHA Enterprise. Verify valid tokens on the deployed origin. Do not use an App Check debug token in production.
4. Deploy the server-only Firestore denial rules before enabling the feature. Client reads/writes anywhere under `aiTrialQuota/**` and `aiTrialConfig/**` must be denied; Admin SDK uses IAM and bypasses those rules. Restrict operator/service-account permissions separately.
5. Install with `npm ci --prefix functions`, then `node functions/build-shared.mjs`. Configure function parameters `AI_TRIAL_ENABLED=true` and `AI_TRIAL_DAILY_CALL_CAP` to the deliberately selected small cap. An omitted/zero cap or omitted enable flag denies requests.
6. Using the Firebase console or trusted Admin SDK, create `aiTrialConfig/runtime` with `{ enabled: true, dailyCap: <chosen integer> }`. This document is never writable by users. Missing or disabled runtime configuration denies requests, including cached ones.
7. Deploy only the reviewed function with `firebase deploy --only functions:requestAiTrialPlan`. This is an operator action after billing/key/App Check configuration, not part of ordinary Pages deployment.
8. Only after the server is deployed and verified, build the frontend with `VITE_AI_TRIAL_ENABLED=true`, `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=<public site key>`, and optionally `VITE_AI_TRIAL_REGION=asia-east1`. Without these settings the public app leaves the trial disabled.

The tracked `functions/.env.example` is intentionally inert. Local parameter files (`functions/.env*`) and generated shared code are ignored. Production parameters are not front-end variables.

## Stop, retention, and verification

For an immediate application stop, set server `aiTrialConfig/runtime.enabled=false`; every newly admitted request then declines before Gemini. Requests already reserved/in flight can still finish. Disabling the frontend flag hides the entry but **does not** stop backend callers. Revoke the dedicated provider key or disable the function as a separate emergency action when necessary.

Quota storage is private: weekly documents at `aiTrialQuota/weekly/users/{uid}/weeks/{week}` store input hash, state, timestamps, expiry and validated result; daily documents at `aiTrialQuota/days/{UTC-date}/counter` store count/timestamp. Raw inputs and prompts are not stored or logged by the implementation. Generated results can contain personal health context, so treat them as personal data. Configure a Firestore TTL policy for the `weeks` collection-group expiry field `expiresAt` (a timestamp) if automatic deletion is desired; TTL is **not configured automatically**. Weekly expiry is 30 days from request date, longer than the enforcement window. Daily counters can be removed by a trusted retention job after their date has passed. Account deletion/retention needs an operator process covering these server-only documents too.

Unit tests run entirely with an injected generator and transactional in-memory Firestore. They check authentication, App Check, disabled budgets, server dates, input bounds, cache, concurrent attempts, global cap, failed-attempt accounting and invalid output. Root integration tests cover client denial of quota/config collections. No automated test calls Gemini or enables paid resources. Before activating production, additionally test the deployed callable with actual App Check tokens, valid/expired Google sign-in, quotas, runtime kill switch, provider timeout and expected billing configuration in a dedicated project. App Check enforcement cannot be proven by the in-memory tests.
