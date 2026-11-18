# Current work state — 2026-11-18

Implemented against DESIGN A–E:
- Shared selection helper shows common basics first, preserves unavailable exercises as disabled cards with reasons, and recognizes chest/shoulder aliases.
- Six basic movements added: C17 dumbbell bench press, C18 lateral raise, C19 curl, C20 pushdown, C21 overhead triceps extension, B19 hip thrust. Bench variants require dumbbells plus stable bench/platform. Original IDs and default plans preserved.
- New manual CreateExerciseDialog from picker/library. Name/use/body/equipment with optional notes/dose. Sticky save. No Gemini/key. Device persistence for signed-out users; existing owner exercises/custom document for signed-in users. Explicit bodyParts used for tags, not inferred training achievements.
- Picker uses blue segmented tabs, search, quick body shortcuts/full filter and new cards. Desktop centered dialog, phone full screen. No mandatory phase/date steps.
- AI candidate starter doses compacted into documented arrays to retain the existing 60KB prompt bound as the catalog grows; values and clinical facts remain intact.
- Public catalog whitelist updated for actual IDs only, but production rules still require Firebase authentication (known previous failure). New custom exercises retain existing share limitations; never silently dropped.

Verification complete:
- `npm run check`: lint, all 288 unit tests and production build pass. Final focused custom/storage/availability tests and lint also pass after review polish.
- One new Firestore owner-persistence test passes with complete declared metadata and stranger denial; all 12 public-share emulator tests pass, including basic/legacy catalog IDs and expression-budget/atomicity checks.
- New browser suite passed at 320 / 390 / 1440: chest/shoulder discovery even without equipment, disabled reasons, equipment adjustment, keyless custom creation, add + actual date save/reload with eight warmups, library creation, quota failure and retry with form preservation, zero AI calls/page errors, no horizontal overflow. Device/owner account creation, reload and login/logout isolation also passed using demo emulators. See screens/results.json and screens/account-results.json.
- Existing workout-planner smoke passed at 320 / 390 / 1440 (manual/dose/save/reuse/share/recipient import); planner-redesign smoke at 320 / 390 / 768 / 1440 (combo/undo/edit/scope/reload/apply); legacy browser smoke on desktop/mobile (account, logging, restricted BYOK, library groups, feedback, rollover, language); direct-day smoke at 320 / 390 / 1440 (fixed dates, other-date/draft/protected-record preservation).
- Updated browser mock parser to locate the actual newline-delimited candidate JSON instead of the descriptive starterDose bracket; no planning assertions were removed.

Persistence details: Firestore cannot store nested equipmentOptions arrays. Persist custom equipment as flat equipmentRequired, hydrate it to runtime equipmentOptions. Device reader accepts both the initial nested device-only representation and flat storage; corrupt storage is never silently overwritten. Deletion retains identity metadata for existing records.

Known limits:
- Device and account custom definitions do not auto-migrate or mix. Creator clearly identifies where it saves.
- User-defined movements are for manual planning; do not present them as broken curated automatic-planner choices. Existing public-sharing restrictions for custom content are preserved and surfaced rather than silently dropping it.
- Production public-catalog rules publication was retried on 2026-11-18 and failed before changes: Firebase CLI authentication is missing. New custom account storage uses the existing private map rule and requires no rules migration. Additional built-in short links need `firebase deploy --only firestore:rules --project myfitnessapp-c4aba` after authentication. Full embedded links remain available for built-in movements.

Implementation and local review are complete. No human usability trial or physical-device performance test is claimed.

Release verification (2026-11-18):
- Source `bfa89bb` pushed to GitHub main. Canonical Cloudflare site live at https://badminton-functional-fitness-planner.pages.dev/ with entry asset `/assets/index-B34vqSkG.js`.
- Isolated production 390px browser verified chest search with missing-equipment reasons, manual custom creation/add, actual device-only day save plus eight warmups, and reload with the custom movement intact. Zero AI calls, zero page errors, zero production account writes.
- Live captures: `screens/live-picker-390.png`, `screens/live-create-390.png`. Firebase production public rules remain pending as described above; private custom metadata uses the existing deployed owner map rule.
