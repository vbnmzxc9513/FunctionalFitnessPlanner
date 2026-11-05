# Interaction latency investigation

## Reproduced causes

1. A guest with a legacy weekly preview who browsed another week entered an unbounded update loop. `periodFromWeeklyDraft` created a new `localPeriod` prop on every parent render; the overview effect loaded that new prop and reported its count to the parent, which created the next object. The browser renderer consumed approximately one CPU core (97% in the observed process sample) and stopped answering the diagnostic interaction.
2. The overview used the same repository read as editable previews. That included per-exercise reads for absent deterministic log slots, needed to protect future writes but unnecessary for browsing.
3. A signed-in completion toggle awaited the plan, progress, seven daily metadata documents and their dose chunks serially. Recording a detailed training log likewise serialized independent initial reads. Network latency accumulated before controls became available again.

## Changes

- Memoize the legacy conversion, profile, merged exercise catalog, eligibility and history projections. Avoid reporting unchanged overview counts back as new state. Memoize fingerprints with complete dependencies so relevant changes still invalidate previews.
- Add a read-only overview loader using the same session/log queries and reconstruction, without absent-log reads or a write-authorizing `expectedState`. Generation/application retain the complete conflict-detection path. Overview data cannot be passed directly to apply.
- Completion uses two dependency stages: read plan/progress/daily metadata together, then read dependent dose chunks together. All reads and version checks remain in the transaction. Detailed logging similarly parallelizes its three independent initial reads.
- No storage/schema migration, new dependencies or visual redesign.

## Validation

- Lint, 266 unit tests and production build passed.
- 67 emulator data integration tests passed, including a new overview/full-read equivalence check, protected-day retention and rejection of a write using overview data. Existing concurrent-change and dose revision checks pass with parallel reads.
- New browser regression `scripts/performance-smoke.mjs` exercises legacy and native guest plans, week navigation and catalog search at 390 px with 4× CPU slowdown. It asserts that idle rendering and storage writes settle; this check is included in the integration pipeline.
- Initial fixed-version probe: zero additional commits and zero writes during a two-second idle interval. The full regression also reports zero commits/writes over 1.5 seconds in both fixtures.
- Local development-server navigation to the library measured 423 ms (legacy) and 541 ms (native) including lazy module loading and browser automation overhead. These are diagnostic figures, not real-device or production latency guarantees.
- Full browser suite and production release are verified separately before reporting completion.
