# Planner data v3

The data boundary is 24 unique exercise IDs per day and 28 calendar days. These are storage limits, not training targets. The legacy workout snapshot/share v1 and program/public-plan v2 readers retain their eight-item boundary. New snapshots, workout shares and program shares explicitly write v3. Existing sequence IDs and their completed/actual facts are read without expansion.

## Date assignments

Existing `dateSessions`, `dateDoses`, `progress` and `planningPeriods` collections remain in use. New session metadata adds `v: 3`. Prescription documents use `${date}__${chunk}` for chunk 0–11 and `{v:3,date,revision,items:[one or two doses]}`. Each dose retains its own ID, phase, target and preparation. `dateDoseStorage.js` centralizes the codec; it joins only matching revisions and ordered IDs. Old `${date}_${exerciseId}` dose records remain readable.

A maximum assignment writes 336 dose chunks, 28 metadata documents, at most five weekly progress snapshots and one period summary: at most 370 writes in one transaction. Preview fingerprints, account checks, recorded/completed date protection, replacement consent and revision checks remain in that transaction. There is no partial assignment or truncation. The optional `legacyWeek` adapter accepts only this week's exact Monday–Friday range; regular assignments keep the current-date lower bound.

Rules validate each bounded native document independently, as the legacy native format did. The routine rule verifies typed list equality after joining and splitting, bounded ASCII identifiers, uniqueness and a 24-item maximum. Two-dose chunks keep detailed preparation validation below the expression limit. Readers reject incomplete or inconsistent cross-document joins.

## Public publication

V2 short links keep their original immutable 254-write maximum publication. V3 uses the existing `sharedPlans`, `shareOwners`, `days` and `doses` paths. Headers start with `status: building, completedDays: 0`. Each ordered day is published in a batch of at most 16 writes: its day metadata, 12 two-dose chunks, two checkpoint documents and one header advance. Checkpoints named `proof0`/`proof1` in the existing doses collection each prove existence of up to six immutable validated chunks. Header advancement proves the day's checkpoints and increments exactly one day. Only the final advancement sets `status: complete`.

Anonymous header and descendant reads are denied while building. Missing chunks cannot receive a checkpoint; missing checkpoints cannot advance publication. Completed chunks, checkpoints and days are immutable. Publication interruption leaves an unreadable copy and returns failure to the caller. No recipient can observe a partial program. Numeric chunk sorting preserves slots 10 and 11.

Embedded `#workout=` and `#program=` retain their existing length limits; oversized payloads fail explicitly. `#plan=` short links preserve every supported day and dose. Public copies continue to exclude custom movements, original dates, source free text, preparation instructions, identity and actual/completed data.

## Saved templates

The existing private template record stays `v:1` with optional `scope`, `tags`, `contentVersion`, `pinned` and `lastUsedAt` fields. Legacy defaults are `day`, `[]`, `1`, `false`, `null`. Scope is day/warmup/training/cooldown/selection; tags are at most six unique nonempty strings of at most 30 characters. Content version is recipe metadata, separate from snapshot schema v3. Last-used values are bounded epoch milliseconds.

Device and account repositories expose `create`, revision-guarded partial `update`, `setPinned(id,boolean,revision)` and `markUsed(id,revision?)`, along with existing rename/delete operations. An explicit update can atomically change name, content and metadata while maintaining the unique-name reservation. Unspecified fields remain unchanged. New replacement payloads must use bounded v3 snapshots; old payload reads remain supported. Account checks occur before operations and on transaction retries. Created timestamps and facts do not enter template updates.

## Verification

Synthetic emulator cases cover atomic 28×24 private assignment/reload, public 28×24 publication/reload, interrupted and premature publication, replay/skip/stale checkpoints, omitted public required fields, malformed native identifiers/doses, account isolation, complete template updates, and legacy sequence actual/completion migration without expansion. No production deployment is part of this change.
