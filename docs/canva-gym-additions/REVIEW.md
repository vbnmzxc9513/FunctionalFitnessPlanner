# Canva gym movement selection

Source: https://www.canva.com/design/DAHY_eELi54/FMCNn6c0wehjEGDqgM3_Iw/view

The seven Canva pages were read directly, including their movement names and outgoing video links. YouTube playback was unavailable in this environment. The catalog instructions describe conservative gym versions inferred from the movement names; they are not video transcripts or an assertion that the linked demonstration was reviewed. References are shown inside the existing expandable guide, with a variation notice.

## Selection

| Canva label | Catalog identity | Decision |
| --- | --- | --- |
| 單臂下拉 | bf_C14 / C14 | Add single-arm cable pulldown using a stable split stance. |
| 站姿肩推 | shoulder_press / C15 | Complete the existing legacy movement with bilingual metadata and guide; preserve its ID and default dose. |
| 俯撐划船 | plank_row / C16 | Complete legacy movement; advanced and disabled by default, consistent with existing advanced catalog entries. Requires stable non-rolling dumbbells. |
| 負重跨步 | weighted_lunge / B18 | Complete legacy forward lunge; correct the old English lateral-lunge name, preserve ID and default dose. |
| 高位下拉、水平划船、小腿提踵、前推對抗、滑輪轉體 | C04, C01, B07, D02, D05 | Reuse existing movements and add source references; no duplicate entries. |

Barbell bench press needs equipment outside the user's stated dumbbell/band/cable setup. Ambiguous fly, high-pull and explosive variations were not added without checking their demonstrations. Court drills are outside this gym-addition request. No medicine ball is required.

## Integration and review

- Four complete catalog entries, bringing the curated catalog from 98 to 102; three reuse existing legacy IDs.
- Manual search supports source names and English aliases. Shoulder press appears under shoulders, the lunge under legs, pulldown under back, plank row under back and core.
- Weekly movement-pattern and target reports include the correct push, pull, squat/lunge and anti-rotation roles.
- Chosen compatible movements can occupy real fixed-rule schedule slots. They are not inserted into previously saved plans.
- Existing equipment, treatment, beginner and disabled filters remain authoritative. Explicit account overrides still take precedence over catalog defaults.
- Sharing preserves identities and doses. References come from a static built-in map, not untrusted user URLs, and open only after a user click.
- Source links stay inside the expandable guide so list browsing gains no new detail panels.

## Validation

- Lint, 266 unit tests, production build: passed.
- Optional backend shared-catalog build: passed.
- Added tests exercise bilingual search/categories, historical identity/dose preservation, eligibility exclusions, manual addition, share round trip and actual fixed-rule placement for each of the four movements.
- Mobile browser: 390 px Chinese and 320 px English passed for all four movements (search, expanded guide, source links, no horizontal overflow or runtime exceptions). Screenshots are in `screens/`; the Chinese pulldown screen was visually inspected.
- GitHub Actions runs the full emulator and browser suites on the release commit before publishing GitHub Pages.
