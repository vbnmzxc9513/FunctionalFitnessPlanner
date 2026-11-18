# State — 2026-11-18

Implemented N1–N3 in src/App.jsx and src/uxLocale.js: promote library to primary navigation, remove obsolete nested planView route and duplicate Plan shortcut. Existing editor guards and daily Add callbacks retained. AGENTS.md points here for current navigation.

Verification complete:
- `npm run check`: lint, all 288 unit tests and production build pass. Existing bundle-size advisory remains.
- Isolated browser review at 320 / 390 / 1440px Chinese and 320px English: four labeled primary tabs; one-click Library from Today, Plan and Records; active state; search; open custom creation; Library entry into date-based automatic planner; no horizontal overflow; every main navigation target at least 44px; zero page errors. Actual captures and results in screens/.
- Visually inspected the separate phone and desktop implementation captures: blue active Library, complete labels, mobile bottom navigation and desktop sidebar.
- Existing usability-direct-day suite passed at 320 / 390 / 1440px (temporary copy redirected output to this task's screens/direct-day, no assertion changes): direct Add; chest/tag filters; exact date save; empty date opens picker; neighboring date and separate multi-day draft preserved; protected completions never overwritten. Zero page errors.
- Review concerned navigation and signed-out device fixtures. No new Firebase/account behavior, no physical-device trial or human usability study claimed.

Release verified:
- Source fc9a79f pushed to GitHub main. Cloudflare check succeeded, deployment 819f8253-a10d-4a38-9ef7-e78ab383b9de.
- Canonical site https://badminton-functional-fitness-planner.pages.dev/ serves entry asset /assets/index-C47Atzlt.js; strict HTTPS asset read confirms navLibrary.
- Isolated production browser at 390px confirms all four main tabs, one-click library from the three other main destinations, search, custom creation dialog, automatic planning entry, no overflow and zero page errors. Only canonical-host requests allowed; no production account writes. See screens/live-library-390-zh.png and live-results.json.
- Separate GitHub Pages full CI run 44245446432 was still running at the canonical release check; no hosted integration success is claimed here.

Complete. No Firebase rules change required.
