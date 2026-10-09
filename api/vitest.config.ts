import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/generated/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/generated/**',
        'src/main.ts',
        'src/**/*.module.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
