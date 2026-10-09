import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

const sourceDirectory = path.resolve('src');
const outputDirectory = path.resolve('dist');

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    {
      name: 'coverage-of-compiled-production-code',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer || !source.startsWith('.') || !source.endsWith('.js'))
          return null;
        const original = path.resolve(path.dirname(importer), source);
        if (!original.startsWith(`${sourceDirectory}${path.sep}`)) return null;
        const compiled = path.resolve(
          outputDirectory,
          path.relative(sourceDirectory, original),
        );
        // Both suites exercise the same build and source maps; avoid duplicate TS/JS coverage entries.
        return existsSync(compiled) ? compiled.replaceAll('\\', '/') : null;
      },
    },
  ],
  test: {
    globals: true,
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/generated/**'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=2048'],
    coverage: {
      // Coverage runs unit and HTTP tests against the same compiled Nest implementation.
      provider: 'istanbul',
      // Source paths must also match after the compiled source maps are remapped.
      include: ['src/**/*.ts', 'dist/**/*.js'],
      exclude: [
        'src/**/*.spec.ts',
        'src/generated/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'dist/generated/**',
        'dist/main.js',
        'dist/**/*.module.js',
      ],
      excludeAfterRemap: true,
      thresholds: { statements: 80, lines: 80, branches: 70, functions: 85 },
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
