import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import * as path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: { allow: [process.cwd(), path.resolve(process.cwd(), '../docs')] },
      // Keep the browser on one origin; the API still checks its original Origin header.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000' },
      },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  };
});
