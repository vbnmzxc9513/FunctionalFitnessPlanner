---
name: deploy-web-app
description: How to deploy a Vite/React app to GitHub Pages and Cloudflare Pages, covering CI/CD setup and the key differences between the two platforms.
---

# Deploying Vite/React App — GitHub Pages vs Cloudflare Pages

## Key Difference

| | GitHub Pages | Cloudflare Pages |
|---|---|---|
| Build | ❌ Does NOT auto-build | ✅ Auto-builds with `npm run build` |
| Trigger | Must manually deploy `dist/` to `gh-pages` branch | Push to `main` → auto-build & deploy |
| Setup | Needs GitHub Actions workflow | Connect repo in Cloudflare dashboard |

## Cloudflare Pages Setup

Cloudflare Pages connects to the GitHub repo and runs its own CI/CD pipeline automatically. No extra configuration needed after initial setup. Every push to `main` triggers a new build.

## GitHub Pages Setup (Auto-Deploy with GitHub Actions)

Since GitHub Pages just serves static files and doesn't know how to build, you need a GitHub Actions workflow.

### Step 1: Create `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to gh-pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### Step 2: Configure GitHub Pages source

In the GitHub repository → **Settings → Pages**:
- **Source**: Deploy from a branch
- **Branch**: `gh-pages`
- **Folder**: `/ (root)`

After the first workflow run, GitHub Pages will update automatically from the `gh-pages` branch on every push to `main`.

## Lazy Login Pattern (UX)

Instead of blocking users with a login wall at startup, show the app immediately and only prompt login when accessing protected features:

- **Auth check**: Use `isAuthLoading` boolean instead of blocking `authMode` states
- **Protected tabs**: Render a `<LoginPrompt />` component inline when `!user`
- **Protected actions**: Show a toast ("Please log in") when `!user` tries to interact
- **Header**: Show "Login" button (with text label) when logged out, "Logout" when logged in

```jsx
// Pattern for lazy login
const [user, setUser] = useState(null);
const [isAuthLoading, setIsAuthLoading] = useState(true);

// In onAuthStateChanged:
setIsAuthLoading(false); // Always called, regardless of login state

// In render:
if (isAuthLoading) return <Loader />;
// Then render full app, protecting tabs conditionally

// Protected tab example:
{activeTab === 'ai' && (
  !user ? <LoginPrompt /> : <AICoachContent />
)}
```
