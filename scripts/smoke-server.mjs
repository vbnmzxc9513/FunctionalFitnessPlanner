import { createServer } from 'vite';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024) throw new Error('A smoke-test port is required');
// Independent browser suites and manual review servers must not invalidate one
// another's optimized dependency URLs while a lazy screen is opening.
const server = await createServer({ cacheDir: `node_modules/.vite-smoke-${port}`, server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
