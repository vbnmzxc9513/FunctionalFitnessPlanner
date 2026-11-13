# Project continuity

## Active manual-planner redesign

When working on manual scheduling, combo selection, or the planning UI, read:

1. `docs/planner-redesign/2026-11-combo-first/STATE.md` — actual progress, missing work, next step.
2. `docs/planner-redesign/2026-11-combo-first/DESIGN.md` — current product decisions and acceptance contract.

The latest user instructions take precedence. Root `design.md` and earlier UX documents contain historical requirements; do not combine their retired phase-first navigation with the current design. The new direction is **compose a day using visible, reusable combos, with very little default text**.

Before changing implementation, identify the acceptance IDs affected. After each coherent change, update STATE with touched files, actual verification, unresolved gaps, and the next executable step. Record facts rather than intended work as completed. This is the restart point after context compaction or a handoff.

`reference-v3/` under the design directory is an immutable reference snapshot, not production code. Generate implementation screenshots separately. If a reference must change, record the reason and create a new reference version; do not silently overwrite the baseline to make an implementation appear compliant.

Review behavior, appearance, and data preservation separately. A prototype browser check does not validate Firebase writes, production performance, or human usability. Keep those statuses distinct. Do not call the redesign finished while the old workflow is still the user-facing route.

Preserve current exercise IDs, eight independently recorded warmups, dose validation, completion records, account/date isolation, and share/import compatibility. UI replacement may be substantial; reuse domain protections rather than rebuilding them in a second editor.

These instructions do not introduce an extra approval requirement or authorize external messaging. Use the authorization and scope already established by the user.
