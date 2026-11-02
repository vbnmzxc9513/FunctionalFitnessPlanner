import { createServer } from 'vite';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024) throw new Error('A smoke-test port is required');
if (process.env.VITE_USE_FIREBASE_EMULATORS === 'true' && process.env.VITE_FIREBASE_PROJECT_ID !== 'demo-fitness-planner') {
  throw new Error('Browser emulator checks require VITE_FIREBASE_PROJECT_ID=demo-fitness-planner; production project defaults are not a test fixture.');
}
// Independent browser suites and manual review servers must not invalidate one
// another's optimized dependency URLs while a lazy screen is opening.
const server = await createServer({ cacheDir: `node_modules/.vite-smoke-${port}`, server: { host: '127.0.0.1', port, strictPort: true, ...(process.env.SMOKE_DISABLE_HMR === '1' ? { hmr: false, watch: { ignored: ['**/*'] } } : {}) } });
await server.listen();
