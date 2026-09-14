import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const port = process.env.PORT ?? env.PORT ?? '7001';
  const apiTarget = `http://127.0.0.1:${port}`;
  const buildId = process.env.VITE_BUILD_ID ?? process.env.GITHUB_SHA ?? `${Date.now()}`;

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    },
    server: {
      proxy: {
        '/healthz': apiTarget,
        '/api': apiTarget,
      },
    },
  };
});
