import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.LIVE_UI_BASE_URL || 'http://localhost:5173';
const target = new URL(baseURL);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  target.protocol !== 'http:' ||
  target.username ||
  target.password ||
  target.pathname !== '/' ||
  target.search ||
  target.hash
)
  throw new Error(
    'Live UI rehearsal is restricted to an explicitly configured local application',
  );

/** Opt-in rehearsal against the running application: no disposable backend and no provider mocks. */
export default defineConfig({
  testDir: './tests-live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-live', open: 'never' }],
  ],
  // Keep live files outside the default runner's output directory, which it clears on start.
  outputDir: 'test-results-live',
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'live-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
});
