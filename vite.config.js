import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd()), ...process.env };
  const cloudflare = env.CF_PAGES === '1';
  const siteUrl = (env.VITE_SITE_URL || (cloudflare ? 'https://badminton-functional-fitness-planner.pages.dev/' : 'https://vbnmzxc9513.github.io/FunctionalFitnessPlanner/')).replace(/\/?$/, '/');
  if (!/^https:\/\/[a-zA-Z0-9./_-]+$/.test(siteUrl)) throw new Error('VITE_SITE_URL must be a canonical HTTPS URL');
  return {
    base: env.VITE_BASE_PATH || (cloudflare ? '/' : '/FunctionalFitnessPlanner/'),
    plugins: [react(), tailwindcss(), {
      name: 'site-metadata',
      transformIndexHtml: html => html.replaceAll('__SITE_URL__', siteUrl),
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nSitemap: ${siteUrl}sitemap.xml\n` });
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}</loc></url></urlset>\n` });
      },
    }],
    build: {
      rollupOptions: { output: { manualChunks(id) {
        if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) return 'firebase';
        if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-') || id.includes('/node_modules/@reduxjs/') || id.includes('/node_modules/redux')) return 'charts';
        if (id.includes('/node_modules/react-markdown/') || id.includes('/node_modules/remark-') || id.includes('/node_modules/rehype-') || id.includes('/node_modules/micromark')) return 'markdown';
      } } },
    },
  };
});
