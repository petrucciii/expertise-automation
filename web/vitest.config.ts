import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/**/*.ts',
        'src/auth/**/*.{ts,tsx}',
        'src/components/**/*.{ts,tsx}',
        'src/features/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}'],
      reporter: ['text-summary', 'html', 'json-summary'],
    },
  },
});
