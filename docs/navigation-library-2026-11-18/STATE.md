# State — 2026-11-18

Implemented N1–N3 in src/App.jsx and src/uxLocale.js: promote library to primary navigation, remove obsolete nested planView route and duplicate Plan shortcut. Existing editor guards and daily Add callbacks retained. AGENTS.md points here for current navigation.

Verification complete:
- `npm run check`: lint, all 288 unit tests and production build pass. Existing bundle-size advisory remains.
- Isolated browser review at 320 / 390 / 1440px Chinese and 320px English: four labeled primary tabs; one-click Library from Today, Plan and Records; active state; search; open custom creation; Library entry into date-based automatic planner; no horizontal overflow; every main navigation target at least 44px; zero page errors. Actual captures and results in screens/.
- Visually inspected the separate phone and desktop implementation captures: blue active Library, complete labels, mobile bottom navigation and desktop sidebar.
- Existing usability-direct-day suite passed at 320 / 390 / 1440px (temporary copy redirected output to this task's screens/direct-day, no assertion changes): direct Add; chest/tag filters; exact date save; empty date opens picker; neighboring date and separate multi-day draft preserved; protected completions never overwritten. Zero page errors.
- Review concerned navigation and signed-out device fixtures. No new Firebase/account behavior, no physical-device trial or human usability study claimed.

Next: push source to main, verify canonical Cloudflare deployment with the same isolated navigation checks, and record release evidence. No Firebase rules change required.
