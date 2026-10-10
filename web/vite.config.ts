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
      // Verification HTML must never trigger reloads while a surveyor edits a draft.
      watch: {
        ignored: [
          '**/test-results*/**',
          '**/playwright-report*/**',
          '**/coverage/**',
          '**/*.tsbuildinfo',
        ],
      },
      fs: {
        allow: [process.cwd(), path.resolve(process.cwd(), '../docs')],
        // Preserve Vite's sensitive-file exclusions and keep traces off the dev origin.
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key,p12,pfx,cer,der}',
          '.npmrc',
          '.yarnrc.yml',
          '**/.git/**',
          '**/test-results*/**',
          '**/playwright-report*/**',
          '**/coverage/**',
        ],
      },
      // Keep the browser on one origin; the API still checks its original Origin header.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000' },
      },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  };
});
