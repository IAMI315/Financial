import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const port = process.env.PORT ?? env.PORT ?? '7001';
  const apiTarget = `http://127.0.0.1:${port}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/healthz': apiTarget,
        '/api': apiTarget,
      },
    },
  };
});
